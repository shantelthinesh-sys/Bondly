ALTER TABLE public.posts
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_body_check;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_body_length_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_body_length_check
  CHECK (body IS NULL OR char_length(btrim(body)) <= 5000);

CREATE TABLE IF NOT EXISTS public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL CONSTRAINT post_media_post_id_fkey REFERENCES public.posts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL CONSTRAINT post_media_owner_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  media_path text NOT NULL UNIQUE,
  alt_text text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_media_owner_path_check CHECK (
    media_path LIKE owner_id::text || '/%'
    AND position('..' IN media_path) = 0
  ),
  CONSTRAINT post_media_post_position_unique UNIQUE (post_id, position)
);

CREATE OR REPLACE FUNCTION public.enforce_post_media_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
media_count integer;
has_video boolean;
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM public.posts AS p
  WHERE p.id = NEW.post_id AND p.author_id = NEW.owner_id
) THEN
  RAISE EXCEPTION 'Post media must belong to the post author';
END IF;

SELECT count(*), coalesce(bool_or(pm.media_type = 'video'), false)
INTO media_count, has_video
FROM public.post_media AS pm
WHERE pm.post_id = NEW.post_id AND pm.id <> NEW.id;

IF media_count >= 10 OR (NEW.media_type = 'video' AND media_count > 0) OR (has_video AND media_count > 0) THEN
  RAISE EXCEPTION 'A post can have up to 10 photos or one video';
END IF;

RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_post_media_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS post_media_enforce_limit ON public.post_media;
CREATE TRIGGER post_media_enforce_limit
BEFORE INSERT OR UPDATE ON public.post_media
FOR EACH ROW EXECUTE FUNCTION public.enforce_post_media_limit();

CREATE INDEX IF NOT EXISTS idx_post_media_post ON public.post_media (post_id, position);

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.post_media TO authenticated;

DROP POLICY IF EXISTS "post_media_select_visible" ON public.post_media;
CREATE POLICY "post_media_select_visible" ON public.post_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts AS p
      WHERE p.id = post_id
        AND (p.author_id = auth.uid() OR public.can_view_social_content(p.author_id, p.audience))
    )
  );

DROP POLICY IF EXISTS "post_media_insert_own" ON public.post_media;
CREATE POLICY "post_media_insert_own" ON public.post_media
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts AS p
      WHERE p.id = post_id
        AND p.author_id = auth.uid()
        AND public.can_view_social_content(p.author_id, p.audience)
    )
  );

DROP POLICY IF EXISTS "post_media_delete_own" ON public.post_media;
CREATE POLICY "post_media_delete_own" ON public.post_media
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts AS p
      WHERE p.id = post_id AND p.author_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.saved_posts (
  post_id uuid NOT NULL CONSTRAINT saved_posts_post_id_fkey REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL CONSTRAINT saved_posts_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_posts_user ON public.saved_posts (user_id, created_at DESC);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.saved_posts TO authenticated;

DROP POLICY IF EXISTS "saved_posts_select_own" ON public.saved_posts;
CREATE POLICY "saved_posts_select_own" ON public.saved_posts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_posts_insert_visible" ON public.saved_posts;
CREATE POLICY "saved_posts_insert_visible" ON public.saved_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts AS p
      WHERE p.id = post_id
        AND (p.author_id = auth.uid() OR public.can_view_social_content(p.author_id, p.audience))
    )
  );

DROP POLICY IF EXISTS "saved_posts_delete_own" ON public.saved_posts;
CREATE POLICY "saved_posts_delete_own" ON public.saved_posts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.post_reposts (
  post_id uuid NOT NULL CONSTRAINT post_reposts_post_id_fkey REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL CONSTRAINT post_reposts_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reposts_user ON public.post_reposts (user_id, created_at DESC);

ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.post_reposts TO authenticated;

DROP POLICY IF EXISTS "post_reposts_select_visible" ON public.post_reposts;
CREATE POLICY "post_reposts_select_visible" ON public.post_reposts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts AS p
      WHERE p.id = post_id
        AND (p.author_id = auth.uid() OR public.can_view_social_content(p.author_id, p.audience))
    )
  );

DROP POLICY IF EXISTS "post_reposts_insert_visible" ON public.post_reposts;
CREATE POLICY "post_reposts_insert_visible" ON public.post_reposts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts AS p
      WHERE p.id = post_id
        AND (p.author_id = auth.uid() OR public.can_view_social_content(p.author_id, p.audience))
    )
  );

DROP POLICY IF EXISTS "post_reposts_delete_own" ON public.post_reposts;
CREATE POLICY "post_reposts_delete_own" ON public.post_reposts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_comments_id_post
  ON public.post_comments (id, post_id);

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid;

ALTER TABLE public.post_comments
  DROP CONSTRAINT IF EXISTS post_comments_parent_post_fkey;

ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_parent_post_fkey
  FOREIGN KEY (parent_id, post_id)
  REFERENCES public.post_comments (id, post_id)
  ON DELETE CASCADE;

ALTER TABLE public.post_comments
  DROP CONSTRAINT IF EXISTS post_comments_no_self_reply;

ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_no_self_reply
  CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON public.post_comments (parent_id, created_at);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bondly-posts',
  'bondly-posts',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "post_media_owner_upload" ON storage.objects;
CREATE POLICY "post_media_owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bondly-posts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "post_media_visible_read" ON storage.objects;
CREATE POLICY "post_media_visible_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bondly-posts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.post_media AS pm
        JOIN public.posts AS p ON p.id = pm.post_id
        WHERE pm.media_path = storage.objects.name
          AND public.can_view_social_content(p.author_id, p.audience)
      )
    )
  );

DROP POLICY IF EXISTS "post_media_owner_delete" ON storage.objects;
CREATE POLICY "post_media_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bondly-posts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
