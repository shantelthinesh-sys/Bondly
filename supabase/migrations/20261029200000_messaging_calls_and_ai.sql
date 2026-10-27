ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS message_privacy text NOT NULL DEFAULT 'everyone'
    CHECK (message_privacy IN ('everyone', 'connections'));

UPDATE public.profiles
SET username = left(
  trim(both '.' FROM lower(regexp_replace(coalesce(display_name, 'member'), '[^a-zA-Z0-9]+', '.', 'g'))),
  20
) || '.' || left(id::text, 6)
WHERE username IS NULL OR btrim(username) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique
  ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION public.set_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  username_base text;
BEGIN
  IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
    username_base := left(
      trim(both '.' FROM lower(regexp_replace(coalesce(NEW.display_name, 'member'), '[^a-zA-Z0-9]+', '.', 'g'))),
      20
    );
    NEW.username := coalesce(nullif(username_base, ''), 'member') || '.' || left(NEW.id::text, 6);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_username ON public.profiles;
CREATE TRIGGER profiles_set_username
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_username();

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('direct', 'group')),
  name text,
  avatar_path text,
  direct_key text UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_direct_key_check CHECK (
    (kind = 'direct' AND direct_key IS NOT NULL AND name IS NULL)
    OR (kind = 'group' AND direct_key IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  muted_until timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR (
      is_demo = false
      AND (
        discovery_enabled = true
        OR EXISTS (
          SELECT 1 FROM public.connections c
          WHERE (c.user_a = auth.uid() AND c.user_b = profiles.id)
             OR (c.user_b = auth.uid() AND c.user_a = profiles.id)
        )
        OR EXISTS (
          SELECT 1 FROM public.conversation_members own_member
          JOIN public.conversation_members shared_member
            ON shared_member.conversation_id = own_member.conversation_id
          WHERE own_member.user_id = auth.uid() AND shared_member.user_id = profiles.id
        )
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
  ON public.conversation_members (user_id, archived_at);

CREATE OR REPLACE FUNCTION public.is_conversation_member(target_conversation uuid, target_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversation_members AS cm
    WHERE cm.conversation_id = target_conversation AND cm.user_id = target_user
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.message_requests (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'video', 'audio', 'post', 'profile')),
  attachment_path text,
  shared_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  shared_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_content_check CHECK (
    (char_length(body) <= 5000)
    AND (
      attachment_path IS NULL
      OR attachment_path LIKE conversation_id::text || '/' || sender_id::text || '/%'
    )
    AND (
      (kind = 'text' AND attachment_path IS NULL AND shared_post_id IS NULL AND shared_profile_id IS NULL)
      OR (kind IN ('image', 'video', 'audio') AND attachment_path IS NOT NULL)
      OR (kind = 'post' AND shared_post_id IS NOT NULL)
      OR (kind = 'profile' AND shared_profile_id IS NOT NULL)
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_send_conversation_message(target_conversation uuid, target_sender uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_conversation_member(target_conversation, target_sender)
    AND (
      EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = target_conversation AND c.kind = 'group')
      OR NOT EXISTS (SELECT 1 FROM public.message_requests mr WHERE mr.conversation_id = target_conversation)
      OR EXISTS (
        SELECT 1 FROM public.message_requests mr
        WHERE mr.conversation_id = target_conversation
          AND (mr.status = 'accepted' OR (mr.sender_id = target_sender AND mr.status = 'pending'))
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.conversation_members cm ON cm.conversation_id = c.id
      JOIN public.user_blocks b
        ON (b.blocker_id = target_sender AND b.blocked_id = cm.user_id)
        OR (b.blocker_id = cm.user_id AND b.blocked_id = target_sender)
      WHERE c.id = target_conversation AND c.kind = 'direct' AND cm.user_id <> target_sender
    );
$$;

REVOKE ALL ON FUNCTION public.can_send_conversation_message(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_conversation_message(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_direct_conversation(other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  viewer uuid := auth.uid();
  new_conversation_id uuid;
  direct_pair_key text;
  is_connected boolean;
  recipient_discoverable boolean;
  recipient_privacy text;
BEGIN
  IF viewer IS NULL OR other_user IS NULL OR viewer = other_user THEN
    RAISE EXCEPTION 'Choose another Bondly member to message';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = viewer AND b.blocked_id = other_user)
       OR (b.blocker_id = other_user AND b.blocked_id = viewer)
  ) THEN
    RAISE EXCEPTION 'Messaging is unavailable for this member';
  END IF;
  SELECT p.message_privacy, p.discovery_enabled
  INTO recipient_privacy, recipient_discoverable
  FROM public.profiles p
  WHERE p.id = other_user AND p.is_demo = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'This profile is not available for messaging'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.connections c
    WHERE (c.user_a = viewer AND c.user_b = other_user)
       OR (c.user_b = viewer AND c.user_a = other_user)
  ) INTO is_connected;
  IF NOT is_connected AND (NOT recipient_discoverable OR recipient_privacy = 'connections') THEN
    RAISE EXCEPTION 'This member only accepts messages from connections';
  END IF;

  direct_pair_key := least(viewer::text, other_user::text) || ':' || greatest(viewer::text, other_user::text);
  INSERT INTO public.conversations (kind, direct_key, created_by)
  VALUES ('direct', direct_pair_key, viewer)
  ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key
  RETURNING id INTO new_conversation_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (new_conversation_id, viewer), (new_conversation_id, other_user)
  ON CONFLICT DO NOTHING;

  IF NOT is_connected THEN
    INSERT INTO public.message_requests (conversation_id, sender_id, recipient_id)
    VALUES (new_conversation_id, viewer, other_user)
    ON CONFLICT (conversation_id) DO NOTHING;
    IF EXISTS (
      SELECT 1 FROM public.message_requests
      WHERE public.message_requests.conversation_id = new_conversation_id
        AND status = 'rejected'
    ) THEN
      RAISE EXCEPTION 'This message request was declined';
    END IF;
  ELSE
    UPDATE public.message_requests
    SET status = 'accepted', updated_at = now()
    WHERE message_requests.conversation_id = new_conversation_id
      AND status <> 'accepted';
  END IF;
  RETURN new_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_group_conversation(group_name text, invited_users uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  viewer uuid := auth.uid();
  new_conversation uuid;
  invited uuid;
BEGIN
  IF viewer IS NULL OR char_length(btrim(group_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Enter a group name of 1 to 80 characters';
  END IF;
  IF coalesce(array_length(invited_users, 1), 0) < 1 OR array_length(invited_users, 1) > 99 THEN
    RAISE EXCEPTION 'Choose between 1 and 99 group members';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(invited_users) AS candidate(user_id)
    WHERE candidate.user_id = viewer
       OR NOT EXISTS (
         SELECT 1 FROM public.profiles p
         WHERE p.id = candidate.user_id AND p.is_demo = false AND p.discovery_enabled = true
       )
       OR EXISTS (
         SELECT 1 FROM public.user_blocks b
         WHERE (b.blocker_id = viewer AND b.blocked_id = candidate.user_id)
            OR (b.blocker_id = candidate.user_id AND b.blocked_id = viewer)
       )
  ) THEN
    RAISE EXCEPTION 'One or more selected members cannot be added';
  END IF;
  INSERT INTO public.conversations (kind, name, created_by)
  VALUES ('group', btrim(group_name), viewer)
  RETURNING id INTO new_conversation;
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (new_conversation, viewer, 'admin');
  FOREACH invited IN ARRAY invited_users LOOP
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (new_conversation, invited)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN new_conversation;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_group_member_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  group_title text;
  creator uuid;
BEGIN
  SELECT c.name, c.created_by INTO group_title, creator
  FROM public.conversations c WHERE c.id = NEW.conversation_id AND c.kind = 'group';
  IF FOUND AND creator <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_id)
    VALUES (NEW.user_id, 'group_added', 'Added to a group', coalesce(group_title, 'Group conversation'), NEW.conversation_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_group_member_added() FROM PUBLIC;
DROP TRIGGER IF EXISTS conversation_members_notify_added ON public.conversation_members;
CREATE TRIGGER conversation_members_notify_added
  AFTER INSERT ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_group_member_added();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.conversations, public.conversation_members, public.message_requests TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;

DROP POLICY IF EXISTS conversations_select_member ON public.conversations;
CREATE POLICY conversations_select_member ON public.conversations
  FOR SELECT TO authenticated USING (public.is_conversation_member(id));
DROP POLICY IF EXISTS conversation_members_select_member ON public.conversation_members;
CREATE POLICY conversation_members_select_member ON public.conversation_members
  FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS message_requests_select_party ON public.message_requests;
CREATE POLICY message_requests_select_party ON public.message_requests
  FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
DROP POLICY IF EXISTS messages_select_member ON public.messages;
CREATE POLICY messages_select_member ON public.messages
  FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS messages_insert_allowed ON public.messages;
CREATE POLICY messages_insert_allowed ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_conversation_message(conversation_id, sender_id)
    AND char_length(body) <= 5000
  );

CREATE OR REPLACE FUNCTION public.notify_conversation_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sender_name text;
  preview text;
  recipient record;
BEGIN
  SELECT p.display_name INTO sender_name FROM public.profiles p WHERE p.id = NEW.sender_id;
  preview := CASE NEW.kind
    WHEN 'image' THEN 'sent a photo'
    WHEN 'video' THEN 'sent a video'
    WHEN 'audio' THEN 'sent a voice message'
    WHEN 'post' THEN 'shared a post'
    WHEN 'profile' THEN 'shared a profile'
    ELSE left(NEW.body, 140)
  END;
  FOR recipient IN
    SELECT cm.user_id FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id <> NEW.sender_id
      AND (cm.muted_until IS NULL OR cm.muted_until <= now())
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_id)
    VALUES (recipient.user_id, 'message', coalesce(sender_name, 'A Bondly member'), preview, NEW.conversation_id);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_conversation_message() FROM PUBLIC;
DROP TRIGGER IF EXISTS messages_notify_conversation ON public.messages;
CREATE TRIGGER messages_notify_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_conversation_message();

CREATE OR REPLACE FUNCTION public.respond_message_request(target_conversation uuid, accept_request boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.message_requests
  SET status = CASE WHEN accept_request THEN 'accepted' ELSE 'rejected' END,
      updated_at = now()
  WHERE conversation_id = target_conversation
    AND recipient_id = auth.uid()
    AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'This message request is no longer available'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_message_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_message_request(uuid, boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('❤️', '😂', '👍', '😮', '😢', '🔥')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
DROP POLICY IF EXISTS message_reactions_select_member ON public.message_reactions;
CREATE POLICY message_reactions_select_member ON public.message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id)));
DROP POLICY IF EXISTS message_reactions_insert_own ON public.message_reactions;
CREATE POLICY message_reactions_insert_own ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id))
  );
DROP POLICY IF EXISTS message_reactions_delete_own ON public.message_reactions;
CREATE POLICY message_reactions_delete_own ON public.message_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_conversation_read(target_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversation_members
  SET last_read_at = now(), archived_at = NULL
  WHERE conversation_id = target_conversation AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_conversation(target_conversation uuid, should_archive boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversation_members
  SET archived_at = CASE WHEN should_archive THEN now() ELSE NULL END
  WHERE conversation_id = target_conversation AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_conversation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_conversation(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_conversation_muted(target_conversation uuid, mute_until timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversation_members
  SET muted_until = CASE WHEN mute_until > now() THEN mute_until ELSE NULL END
  WHERE conversation_id = target_conversation AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_conversation_muted(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_conversation_muted(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.edit_chat_message(target_message uuid, new_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.messages
  SET body = btrim(new_body), edited_at = now()
  WHERE id = target_message AND sender_id = auth.uid() AND deleted_at IS NULL
    AND created_at > now() - interval '15 minutes'
    AND char_length(btrim(new_body)) BETWEEN 1 AND 5000
    AND kind = 'text';
  IF NOT FOUND THEN RAISE EXCEPTION 'This message can no longer be edited'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_chat_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_chat_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_chat_message(target_message uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.messages
  SET body = '', kind = 'text', attachment_path = NULL,
      shared_post_id = NULL, shared_profile_id = NULL, reply_to = NULL,
      deleted_at = now()
  WHERE id = target_message AND sender_id = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This message cannot be deleted'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_chat_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_group_member(target_conversation uuid, new_member uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id = target_conversation AND c.kind = 'group'
      AND cm.user_id = auth.uid() AND cm.role = 'admin'
  ) THEN RAISE EXCEPTION 'Only group administrators can add members'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = auth.uid() AND blocked_id = new_member)
       OR (blocker_id = new_member AND blocked_id = auth.uid())
  ) OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = new_member AND is_demo = false) THEN
    RAISE EXCEPTION 'This member cannot be added';
  END IF;
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (target_conversation, new_member) ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.add_group_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_group_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_group(target_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = target_conversation AND cm.user_id = auth.uid() AND cm.role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = target_conversation AND cm.user_id <> auth.uid() AND cm.role = 'admin'
  ) THEN
    UPDATE public.conversation_members
    SET role = 'admin'
    WHERE conversation_id = target_conversation AND user_id <> auth.uid()
      AND joined_at = (
        SELECT min(joined_at) FROM public.conversation_members
        WHERE conversation_id = target_conversation AND user_id <> auth.uid()
      );
  END IF;
  DELETE FROM public.conversation_members cm
  USING public.conversations c
  WHERE cm.conversation_id = target_conversation AND cm.user_id = auth.uid()
    AND c.id = cm.conversation_id AND c.kind = 'group';
  IF NOT FOUND THEN RAISE EXCEPTION 'Group not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.leave_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_group_name(target_conversation uuid, new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations c
  SET name = btrim(new_name), updated_at = now()
  WHERE c.id = target_conversation AND c.kind = 'group'
    AND char_length(btrim(new_name)) BETWEEN 1 AND 80
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid() AND cm.role = 'admin'
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Only group administrators can rename a group'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_group_name(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_group_name(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_group_avatar(target_conversation uuid, new_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations c
  SET avatar_path = new_path, updated_at = now()
  WHERE c.id = target_conversation AND c.kind = 'group'
    AND (new_path IS NULL OR new_path LIKE target_conversation::text || '/' || auth.uid()::text || '/%')
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid() AND cm.role = 'admin'
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Only group administrators can change the group picture'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_group_avatar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_group_avatar(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_group_member_role(target_conversation uuid, target_user uuid, make_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = target_conversation AND user_id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Only group administrators can change member roles'; END IF;
  UPDATE public.conversation_members
  SET role = CASE WHEN make_admin THEN 'admin' ELSE 'member' END
  WHERE conversation_id = target_conversation AND user_id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group member not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_group_member_role(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_group_member_role(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_group_member(target_conversation uuid, target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF target_user = auth.uid() THEN
    PERFORM public.leave_group(target_conversation);
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = target_conversation AND user_id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Only group administrators can remove members'; END IF;
  DELETE FROM public.conversation_members
  WHERE conversation_id = target_conversation AND user_id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group member not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('audio', 'video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'rejected', 'ended', 'missed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_call_sessions_callee_status
  ON public.call_sessions (callee_id, status, created_at DESC);
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.call_sessions TO authenticated;
GRANT UPDATE (status, answered_at, ended_at) ON public.call_sessions TO authenticated;
DROP POLICY IF EXISTS call_sessions_select_participant ON public.call_sessions;
CREATE POLICY call_sessions_select_participant ON public.call_sessions FOR SELECT TO authenticated
  USING (auth.uid() IN (caller_id, callee_id) AND public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS call_sessions_insert_caller ON public.call_sessions;
CREATE POLICY call_sessions_insert_caller ON public.call_sessions FOR INSERT TO authenticated
  WITH CHECK (
    caller_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = caller_id AND b.blocked_id = callee_id)
         OR (b.blocker_id = callee_id AND b.blocked_id = caller_id)
    )
    AND EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = call_sessions.conversation_id AND user_id = callee_id)
    AND caller_id <> callee_id
  );
DROP POLICY IF EXISTS call_sessions_update_participant ON public.call_sessions;
CREATE POLICY call_sessions_update_participant ON public.call_sessions FOR UPDATE TO authenticated
  USING (auth.uid() IN (caller_id, callee_id))
  WITH CHECK (auth.uid() IN (caller_id, callee_id));

CREATE TABLE IF NOT EXISTS public.call_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice', 'reject', 'hangup')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pg_column_size(payload) <= 8192)
);
CREATE INDEX IF NOT EXISTS idx_call_signals_recipient
  ON public.call_signals (recipient_id, call_id, created_at);
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.call_signals TO authenticated;
DROP POLICY IF EXISTS call_signals_select_participant ON public.call_signals;
CREATE POLICY call_signals_select_participant ON public.call_signals FOR SELECT TO authenticated
  USING (auth.uid() IN (sender_id, recipient_id));
DROP POLICY IF EXISTS call_signals_insert_sender ON public.call_signals;
CREATE POLICY call_signals_insert_sender ON public.call_signals FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_id
        AND ((cs.caller_id = sender_id AND cs.callee_id = recipient_id)
          OR (cs.callee_id = sender_id AND cs.caller_id = recipient_id))
    )
  );

CREATE OR REPLACE FUNCTION public.notify_missed_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('missed', 'rejected') AND OLD.status = 'ringing' THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_id)
    VALUES (
      CASE WHEN NEW.status = 'missed' THEN NEW.callee_id ELSE NEW.caller_id END,
      'missed_call',
      CASE WHEN NEW.status = 'missed' THEN 'Missed call' ELSE 'Call declined' END,
      CASE WHEN NEW.mode = 'video' THEN 'Video call' ELSE 'Audio call' END,
      NEW.conversation_id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_missed_call() FROM PUBLIC;
DROP TRIGGER IF EXISTS call_sessions_notify_status ON public.call_sessions;
CREATE TRIGGER call_sessions_notify_status
  AFTER UPDATE OF status ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.notify_missed_call();

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat' CHECK (char_length(title) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
  ON public.ai_conversations (user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON public.ai_messages (conversation_id, created_at);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.ai_messages TO authenticated;
DROP POLICY IF EXISTS ai_conversations_own ON public.ai_conversations;
CREATE POLICY ai_conversations_own ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS ai_messages_own ON public.ai_messages;
CREATE POLICY ai_messages_own ON public.ai_messages FOR ALL TO authenticated
  USING (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.ai_request_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT current_date,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, usage_date)
);
ALTER TABLE public.ai_request_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_request_usage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_bondly_ai_request(target_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  daily_count integer;
BEGIN
  INSERT INTO public.ai_request_usage (user_id, usage_date, request_count)
  VALUES (target_user, current_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET request_count = public.ai_request_usage.request_count + 1
  RETURNING request_count INTO daily_count;
  RETURN daily_count <= 30;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_bondly_ai_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_bondly_ai_request(uuid) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bondly-messages', 'bondly-messages', false, 52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/webm', 'audio/ogg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS bondly_messages_upload_member ON storage.objects;
CREATE POLICY bondly_messages_upload_member ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bondly-messages'
    AND public.is_conversation_member(((storage.foldername(name))[1])::uuid)
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
DROP POLICY IF EXISTS bondly_messages_read_member ON storage.objects;
CREATE POLICY bondly_messages_read_member ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bondly-messages'
    AND public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
DROP POLICY IF EXISTS bondly_messages_delete_owner ON storage.objects;
CREATE POLICY bondly_messages_delete_owner ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bondly-messages'
    AND public.is_conversation_member(((storage.foldername(name))[1])::uuid)
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        JOIN public.conversation_members cm ON cm.conversation_id = c.id
        WHERE c.avatar_path = storage.objects.name
          AND c.id = ((storage.foldername(name))[1])::uuid
          AND cm.user_id = auth.uid()
          AND cm.role = 'admin'
      )
    )
  );

DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['messages', 'conversation_members', 'call_sessions', 'call_signals'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS bondly_typing_member_read ON realtime.messages;
    CREATE POLICY bondly_typing_member_read ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        split_part(realtime.topic(), ':', 1) = 'messages'
        AND public.is_conversation_member(split_part(realtime.topic(), ':', 2)::uuid)
      );
    DROP POLICY IF EXISTS bondly_typing_member_write ON realtime.messages;
    CREATE POLICY bondly_typing_member_write ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        split_part(realtime.topic(), ':', 1) = 'messages'
        AND public.is_conversation_member(split_part(realtime.topic(), ':', 2)::uuid)
      );
  END IF;
END $$;
