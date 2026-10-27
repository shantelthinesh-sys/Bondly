ALTER TABLE public.profiles
  ALTER COLUMN visibility
  SET DEFAULT '{"organization":true,"skills":true,"interests":true,"location":true,"connections":true}'::jsonb;

UPDATE public.profiles
SET visibility = visibility - 'education'
WHERE visibility ? 'education';

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS education;

DELETE FROM public.profile_interests AS pi
USING public.interests AS i
WHERE pi.interest_id = i.id
  AND i.name IN ('Academic Writing', 'History', 'Language Learning', 'Physics', 'Research');

DELETE FROM public.interests
WHERE name IN ('Academic Writing', 'History', 'Language Learning', 'Physics', 'Research');

UPDATE public.interests
SET category = CASE
  WHEN name = 'Entrepreneurship' THEN 'technology'
  ELSE 'entertainment'
END
WHERE category IN ('education', 'research');

UPDATE public.communities
SET category = 'entertainment'
WHERE category IN ('education', 'research');

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL CONSTRAINT stories_author_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text', 'image', 'video')),
  body text,
  media_path text,
  audience text NOT NULL DEFAULT 'discoverable' CHECK (audience IN ('discoverable', 'connections')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT stories_body_and_media_check CHECK (
    (kind = 'text' AND media_path IS NULL AND char_length(btrim(coalesce(body, ''))) BETWEEN 1 AND 500)
    OR
    (kind IN ('image', 'video') AND media_path IS NOT NULL AND char_length(coalesce(body, '')) <= 500)
  ),
  CONSTRAINT stories_media_owner_path_check CHECK (
    media_path IS NULL
    OR (media_path LIKE author_id::text || '/%' AND position('..' IN media_path) = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_stories_expiration_feed
  ON public.stories (expires_at, created_at DESC, author_id);

CREATE OR REPLACE FUNCTION public.set_story_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.created_at := now();
  NEW.expires_at := NEW.created_at + interval '24 hours';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_story_expiration() FROM PUBLIC;

DROP TRIGGER IF EXISTS stories_set_expiration ON public.stories;
CREATE TRIGGER stories_set_expiration
  BEFORE INSERT ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.set_story_expiration();

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.stories TO authenticated;

DROP POLICY IF EXISTS "stories_select_visible" ON public.stories;
CREATE POLICY "stories_select_visible" ON public.stories
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR (
      expires_at > now()
      AND public.can_view_social_content(author_id, audience)
    )
  );

DROP POLICY IF EXISTS "stories_insert_own" ON public.stories;
CREATE POLICY "stories_insert_own" ON public.stories
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_view_social_content(author_id, audience)
  );

DROP POLICY IF EXISTS "stories_delete_own" ON public.stories;
CREATE POLICY "stories_delete_own" ON public.stories
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL CONSTRAINT story_views_story_id_fkey REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL CONSTRAINT story_views_viewer_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON public.story_views (viewer_id, viewed_at DESC);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.story_views TO authenticated;

DROP POLICY IF EXISTS "story_views_select_visible" ON public.story_views;
CREATE POLICY "story_views_select_visible" ON public.story_views
  FOR SELECT TO authenticated
  USING (
    viewer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stories AS s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "story_views_insert_visible" ON public.story_views;
CREATE POLICY "story_views_insert_visible" ON public.story_views
  FOR INSERT TO authenticated
  WITH CHECK (
    viewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories AS s
      WHERE s.id = story_id
        AND s.author_id <> auth.uid()
        AND s.expires_at > now()
        AND public.can_view_social_content(s.author_id, s.audience)
    )
  );

DROP POLICY IF EXISTS "story_views_update_visible" ON public.story_views;
CREATE POLICY "story_views_update_visible" ON public.story_views
  FOR UPDATE TO authenticated
  USING (viewer_id = auth.uid())
  WITH CHECK (
    viewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories AS s
      WHERE s.id = story_id
        AND s.author_id <> auth.uid()
        AND s.expires_at > now()
        AND public.can_view_social_content(s.author_id, s.audience)
    )
  );

CREATE OR REPLACE FUNCTION public.get_story_viewers(target_story_id uuid)
RETURNS TABLE (viewer_id uuid, display_name text, avatar_url text, viewed_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stories AS s
    WHERE s.id = target_story_id AND s.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the story owner can view its viewers';
  END IF;

  RETURN QUERY
  SELECT v.viewer_id, p.display_name, p.avatar_url, v.viewed_at
  FROM public.story_views AS v
  JOIN public.profiles AS p ON p.id = v.viewer_id
  WHERE v.story_id = target_story_id
  ORDER BY v.viewed_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_story_viewers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_story_viewers(uuid) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bondly-stories',
  'bondly-stories',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "story_media_owner_upload" ON storage.objects;
CREATE POLICY "story_media_owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bondly-stories'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "story_media_visible_read" ON storage.objects;
CREATE POLICY "story_media_visible_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bondly-stories'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.stories AS s
        WHERE s.media_path = storage.objects.name
          AND s.expires_at > now()
          AND public.can_view_social_content(s.author_id, s.audience)
      )
    )
  );

DROP POLICY IF EXISTS "story_media_owner_delete" ON storage.objects;
CREATE POLICY "story_media_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bondly-stories'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
