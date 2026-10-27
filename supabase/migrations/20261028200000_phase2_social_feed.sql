CREATE OR REPLACE FUNCTION public.can_view_social_content(target_author uuid, target_audience text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  viewer uuid := auth.uid();
  author_discoverable boolean;
  author_is_demo boolean;
BEGIN
  IF viewer IS NULL OR target_audience NOT IN ('discoverable', 'connections') THEN
    RETURN false;
  END IF;

  SELECT p.discovery_enabled, p.is_demo
  INTO author_discoverable, author_is_demo
  FROM public.profiles AS p
  WHERE p.id = target_author;

  IF NOT FOUND OR author_is_demo THEN
    RETURN false;
  END IF;

  IF viewer = target_author THEN
    RETURN target_audience = 'connections' OR author_discoverable;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_blocks AS b
    WHERE (b.blocker_id = viewer AND b.blocked_id = target_author)
       OR (b.blocker_id = target_author AND b.blocked_id = viewer)
  ) THEN
    RETURN false;
  END IF;

  IF target_audience = 'discoverable' THEN
    RETURN author_discoverable;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.connections AS c
    WHERE (c.user_a = viewer AND c.user_b = target_author)
       OR (c.user_a = target_author AND c.user_b = viewer)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_social_content(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_social_content(uuid, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL CONSTRAINT posts_author_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  audience text NOT NULL DEFAULT 'discoverable' CHECK (audience IN ('discoverable', 'connections')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_feed ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON public.posts (author_id, created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;

DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
CREATE POLICY "posts_select_visible" ON public.posts
  FOR SELECT TO authenticated
  USING (auth.uid() = author_id OR public.can_view_social_content(author_id, audience));

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.can_view_social_content(author_id, audience));

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own" ON public.posts
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id AND public.can_view_social_content(author_id, audience));

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own" ON public.posts
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

CREATE TABLE IF NOT EXISTS public.post_reactions (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_user ON public.post_reactions (user_id, post_id);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.post_reactions TO authenticated;

DROP POLICY IF EXISTS "post_reactions_select_visible" ON public.post_reactions;
CREATE POLICY "post_reactions_select_visible" ON public.post_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts AS p WHERE p.id = post_id));

DROP POLICY IF EXISTS "post_reactions_insert_own" ON public.post_reactions;
CREATE POLICY "post_reactions_insert_own" ON public.post_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.posts AS p WHERE p.id = post_id)
  );

DROP POLICY IF EXISTS "post_reactions_delete_own" ON public.post_reactions;
CREATE POLICY "post_reactions_delete_own" ON public.post_reactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL CONSTRAINT post_comments_author_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments (post_id, created_at);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;

DROP POLICY IF EXISTS "post_comments_select_visible" ON public.post_comments;
CREATE POLICY "post_comments_select_visible" ON public.post_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts AS p WHERE p.id = post_id));

DROP POLICY IF EXISTS "post_comments_insert_own" ON public.post_comments;
CREATE POLICY "post_comments_insert_own" ON public.post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM public.posts AS p WHERE p.id = post_id)
  );

DROP POLICY IF EXISTS "post_comments_delete_own" ON public.post_comments;
CREATE POLICY "post_comments_delete_own" ON public.post_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

CREATE OR REPLACE FUNCTION public.notify_post_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  post_author uuid;
  actor_name text;
  activity_type text;
  activity_body text;
BEGIN
  SELECT p.author_id INTO post_author
  FROM public.posts AS p
  WHERE p.id = NEW.post_id;

  IF post_author IS NULL OR post_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT p.display_name INTO actor_name
  FROM public.profiles AS p
  WHERE p.id = NEW.user_id;

  activity_type := 'post_like';
  activity_body := coalesce(actor_name, 'Someone') || ' liked your post.';

  INSERT INTO public.notifications (user_id, type, title, body, related_id)
  VALUES (post_author, activity_type, 'New post reaction', activity_body, NEW.post_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  post_author uuid;
  actor_name text;
BEGIN
  SELECT p.author_id INTO post_author
  FROM public.posts AS p
  WHERE p.id = NEW.post_id;

  IF post_author IS NULL OR post_author = NEW.author_id THEN
    RETURN NEW;
  END IF;

  SELECT p.display_name INTO actor_name
  FROM public.profiles AS p
  WHERE p.id = NEW.author_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_id)
  VALUES (
    post_author,
    'post_comment',
    'New comment',
    coalesce(actor_name, 'Someone') || ' commented on your post.',
    NEW.post_id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_post_activity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_post_comment() FROM PUBLIC;

DROP TRIGGER IF EXISTS post_reaction_notification ON public.post_reactions;
CREATE TRIGGER post_reaction_notification
  AFTER INSERT ON public.post_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_activity();

DROP TRIGGER IF EXISTS post_comment_notification ON public.post_comments;
CREATE TRIGGER post_comment_notification
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_comment();
