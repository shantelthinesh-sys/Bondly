/*
# Bondly AI — Core Schema

Builds the persistent foundation of the Bondly AI social discovery platform.

## 1. New Tables
- `profiles`: public profile data for auth users and fictional demo users (display_name, bio, education, organization, location, avatar, visibility, discovery settings).
- `interests`: catalog of interest topics grouped by category.
- `profile_interests`: join table profiles↔interests.
- `skills`: catalog of skills.
- `profile_skills`: join table profiles↔skills.
- `connections`: accepted friendships (undirected edge stored as ordered pair user_a<user_b with unique constraint).
- `connection_requests`: pending/sent/declined friend requests.
- `communities`: interest-group communities with creator and category.
- `community_memberships`: who joined which community.
- `saved_profiles`: private bookmarks with optional note.
- `recommendation_feedback`: per-candidate feedback (interested / not_interested / already_know / dismiss / not_relevant).
- `recommendation_events`: log of recommendation impressions and outcomes for later evaluation.
- `notifications`: in-app notifications.
- `user_blocks`: blocking relationships (directed).
- `reports`: user-submitted reports for moderation.
- `model_metadata`: metadata about the current ML recommendation model.
- `activity_log`: timestamps of connection events for network-growth analytics.

## 2. Security
- RLS enabled on EVERY table. Multi-tenant: owner columns default to `auth.uid()`.
- Grants: `authenticated` gets CRUD on its own rows. `anon` is NOT granted anything — sign-in required.
- Profiles readable by all authenticated users (need to see people for recommendations), editable only by owner.
- Connections are readable by authenticated users for graph calculations. Requests, feedback, saved profiles, notifications, blocks, reports are owner-scoped.
- Community memberships readable by all (for member counts), insert/delete only by joining user.
- Communities readable by all, insertable by any authenticated user.

## 3. Important Notes
1. `connections` stores the smaller UUID in `user_a`, larger in `user_b` to enforce an undirected edge. Unique constraint prevents duplicate edges. Status is always accepted — pending lives in `connection_requests`.
2. `connection_requests` enforces one active pending request per ordered pair via partial unique index.
3. `profiles` does NOT store email/password — those live in `auth.users`.
4. `user_blocks` is directional: (blocker, blocked).
5. `model_metadata` is a reference table; only readable by authenticated users.
*/

-- ============================================================================
-- PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  bio text DEFAULT '',
  avatar_url text,
  education text DEFAULT '',
  organization text DEFAULT '',
  location_city text DEFAULT '',
  headline text DEFAULT '',
  is_demo boolean NOT NULL DEFAULT false,
  visibility jsonb NOT NULL DEFAULT '{"education":true,"skills":true,"interests":true,"location":true,"connections":true}'::jsonb,
  discovery_enabled boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR (is_demo = true AND auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles (created_at);

CREATE OR REPLACE FUNCTION delete_auth_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id AND is_demo = false;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION delete_auth_profile() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_delete_auth_profile ON auth.users;
CREATE TRIGGER trg_delete_auth_profile
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION delete_auth_profile();

-- ============================================================================
-- INTERESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'technology',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON interests TO authenticated;
DROP POLICY IF EXISTS "interests_select_all" ON interests;
CREATE POLICY "interests_select_all" ON interests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "interests_insert_any" ON interests;
CREATE POLICY "interests_insert_any" ON interests FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- PROFILE_INTERESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS profile_interests (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interest_id uuid NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, interest_id)
);

ALTER TABLE profile_interests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_interests TO authenticated;
DROP POLICY IF EXISTS "profile_interests_select_all" ON profile_interests;
CREATE POLICY "profile_interests_select_all" ON profile_interests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profile_interests_insert_own" ON profile_interests;
CREATE POLICY "profile_interests_insert_own" ON profile_interests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = profile_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.is_demo = true)
  );
DROP POLICY IF EXISTS "profile_interests_delete_own" ON profile_interests;
CREATE POLICY "profile_interests_delete_own" ON profile_interests FOR DELETE TO authenticated USING (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_interests_interest ON profile_interests (interest_id);

-- ============================================================================
-- SKILLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON skills TO authenticated;
DROP POLICY IF EXISTS "skills_select_all" ON skills;
CREATE POLICY "skills_select_all" ON skills FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "skills_insert_any" ON skills;
CREATE POLICY "skills_insert_any" ON skills FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS profile_skills (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, skill_id)
);

ALTER TABLE profile_skills ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_skills TO authenticated;
DROP POLICY IF EXISTS "profile_skills_select_all" ON profile_skills;
CREATE POLICY "profile_skills_select_all" ON profile_skills FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profile_skills_insert_own" ON profile_skills;
CREATE POLICY "profile_skills_insert_own" ON profile_skills FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = profile_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.is_demo = true)
  );
DROP POLICY IF EXISTS "profile_skills_delete_own" ON profile_skills;
CREATE POLICY "profile_skills_delete_own" ON profile_skills FOR DELETE TO authenticated USING (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_skills_skill ON profile_skills (skill_id);

-- ============================================================================
-- CONNECTIONS (accepted friendships, undirected)
-- ============================================================================
CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_a_lt_user_b CHECK (user_a < user_b),
  CONSTRAINT user_a_ne_user_b CHECK (user_a <> user_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_pair ON connections (user_a, user_b);
CREATE INDEX IF NOT EXISTS idx_connections_user_a ON connections (user_a);
CREATE INDEX IF NOT EXISTS idx_connections_user_b ON connections (user_b);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON connections TO authenticated;
DROP POLICY IF EXISTS "connections_select_participant" ON connections;
CREATE POLICY "connections_select_participant" ON connections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "connections_insert_participant" ON connections;
CREATE POLICY "connections_insert_participant" ON connections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles a, profiles b
      WHERE a.id = user_a AND a.is_demo = true
        AND b.id = user_b AND b.is_demo = true
    )
  );
DROP POLICY IF EXISTS "connections_delete_participant" ON connections;
CREATE POLICY "connections_delete_participant" ON connections FOR DELETE TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

-- ============================================================================
-- CONNECTION_REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  message text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sender_ne_receiver CHECK (sender_id <> receiver_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_request_pair ON connection_requests (sender_id, receiver_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_requests_receiver ON connection_requests (receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_sender ON connection_requests (sender_id, status);

ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON connection_requests TO authenticated;
DROP POLICY IF EXISTS "requests_select_party" ON connection_requests;
CREATE POLICY "requests_select_party" ON connection_requests FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS "requests_insert_sender" ON connection_requests;
CREATE POLICY "requests_insert_sender" ON connection_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "requests_update_party" ON connection_requests;
CREATE POLICY "requests_update_party" ON connection_requests FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (
    (auth.uid() = sender_id AND status IN ('pending', 'cancelled'))
    OR (auth.uid() = receiver_id AND status IN ('pending', 'declined'))
  );
DROP POLICY IF EXISTS "requests_delete_sender" ON connection_requests;
CREATE POLICY "requests_delete_sender" ON connection_requests FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- ============================================================================
-- COMMUNITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'technology',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON communities TO authenticated;
DROP POLICY IF EXISTS "communities_select_all" ON communities;
CREATE POLICY "communities_select_all" ON communities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "communities_insert_any" ON communities;
CREATE POLICY "communities_insert_any" ON communities FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = created_by AND p.is_demo = true)
  );
CREATE INDEX IF NOT EXISTS idx_communities_category ON communities (category);

CREATE TABLE IF NOT EXISTS community_memberships (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE community_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON community_memberships TO authenticated;
DROP POLICY IF EXISTS "cm_select_all" ON community_memberships;
CREATE POLICY "cm_select_all" ON community_memberships FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cm_insert_own" ON community_memberships;
CREATE POLICY "cm_insert_own" ON community_memberships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM profiles p
      JOIN communities c ON c.id = community_id
      JOIN profiles creator ON creator.id = c.created_by
      WHERE p.id = user_id AND p.is_demo = true AND creator.is_demo = true
    )
  );
DROP POLICY IF EXISTS "cm_delete_own" ON community_memberships;
CREATE POLICY "cm_delete_own" ON community_memberships FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- SAVED_PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS saved_profiles (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  saved_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, saved_profile_id),
  CONSTRAINT saver_ne_saved CHECK (user_id <> saved_profile_id)
);

ALTER TABLE saved_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_profiles TO authenticated;
DROP POLICY IF EXISTS "saved_select_own" ON saved_profiles;
CREATE POLICY "saved_select_own" ON saved_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "saved_insert_own" ON saved_profiles;
CREATE POLICY "saved_insert_own" ON saved_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "saved_update_own" ON saved_profiles;
CREATE POLICY "saved_update_own" ON saved_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "saved_delete_own" ON saved_profiles;
CREATE POLICY "saved_delete_own" ON saved_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- RECOMMENDATION_FEEDBACK
-- ============================================================================
CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('interested','not_interested','already_know','dismiss','not_relevant')),
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_ne_candidate CHECK (user_id <> candidate_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_pair ON recommendation_feedback (user_id, candidate_id);

ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON recommendation_feedback TO authenticated;
DROP POLICY IF EXISTS "feedback_select_own" ON recommendation_feedback;
CREATE POLICY "feedback_select_own" ON recommendation_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "feedback_insert_own" ON recommendation_feedback;
CREATE POLICY "feedback_insert_own" ON recommendation_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "feedback_update_own" ON recommendation_feedback;
CREATE POLICY "feedback_update_own" ON recommendation_feedback FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "feedback_delete_own" ON recommendation_feedback;
CREATE POLICY "feedback_delete_own" ON recommendation_feedback FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON recommendation_feedback (user_id);

-- ============================================================================
-- RECOMMENDATION_EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression','click','request_sent','feedback','dismiss')),
  score numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendation_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON recommendation_events TO authenticated;
DROP POLICY IF EXISTS "events_select_own" ON recommendation_events;
CREATE POLICY "events_select_own" ON recommendation_events FOR SELECT TO authenticated USING (auth.uid() = viewer_id);
DROP POLICY IF EXISTS "events_insert_own" ON recommendation_events;
CREATE POLICY "events_insert_own" ON recommendation_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);

CREATE INDEX IF NOT EXISTS idx_events_viewer ON recommendation_events (viewer_id, created_at);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text DEFAULT '',
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;
DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_insert_own" ON notifications;
CREATE POLICY "notif_insert_own" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_delete_own" ON notifications;
CREATE POLICY "notif_delete_own" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications (user_id, read_at);

CREATE OR REPLACE FUNCTION notify_connection_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
BEGIN
  SELECT display_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  INSERT INTO public.notifications (user_id, type, title, body, related_id)
  VALUES (
    NEW.receiver_id,
    'connection_request',
    'New connection request',
    COALESCE(sender_name, 'A Bondly member') || ' wants to connect.',
    NEW.id
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION notify_connection_request() FROM PUBLIC;

CREATE OR REPLACE FUNCTION notify_connection_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_id)
    VALUES (
      NEW.sender_id,
      'new_connection',
      'Connection accepted!',
      'Your connection request was accepted.',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION notify_connection_accepted() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_connection_request ON connection_requests;
CREATE TRIGGER trg_notify_connection_request
  AFTER INSERT ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION notify_connection_request();

DROP TRIGGER IF EXISTS trg_notify_connection_accepted ON connection_requests;
CREATE TRIGGER trg_notify_connection_accepted
  AFTER UPDATE ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION notify_connection_accepted();

CREATE OR REPLACE FUNCTION accept_connection_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row connection_requests%ROWTYPE;
BEGIN
  SELECT * INTO request_row
  FROM public.connection_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND OR request_row.receiver_id <> auth.uid() OR request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Connection request is unavailable';
  END IF;

  INSERT INTO public.connections (user_a, user_b)
  VALUES (LEAST(request_row.sender_id, request_row.receiver_id), GREATEST(request_row.sender_id, request_row.receiver_id))
  ON CONFLICT (user_a, user_b) DO NOTHING;

  UPDATE public.connection_requests SET status = 'accepted' WHERE id = request_row.id;
END;
$$;

REVOKE ALL ON FUNCTION accept_connection_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_connection_request(uuid) TO authenticated;

-- ============================================================================
-- USER_BLOCKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocker_ne_blocked CHECK (blocker_id <> blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON user_blocks TO authenticated;
DROP POLICY IF EXISTS "blocks_select_blocker" ON user_blocks;
CREATE POLICY "blocks_select_blocker" ON user_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocks_insert_blocker" ON user_blocks;
CREATE POLICY "blocks_insert_blocker" ON user_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocks_delete_blocker" ON user_blocks;
CREATE POLICY "blocks_delete_blocker" ON user_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- ============================================================================
-- REPORTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON reports TO authenticated;
DROP POLICY IF EXISTS "reports_select_own" ON reports;
CREATE POLICY "reports_select_own" ON reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "reports_insert_own" ON reports;
CREATE POLICY "reports_insert_own" ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);

-- ============================================================================
-- MODEL_METADATA
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  model_version text NOT NULL,
  dataset_type text NOT NULL CHECK (dataset_type IN ('synthetic','real','none')),
  training_example_count integer NOT NULL DEFAULT 0,
  evaluation_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_importance jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_metadata ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON model_metadata TO authenticated;
DROP POLICY IF EXISTS "model_select_all" ON model_metadata;
CREATE POLICY "model_select_all" ON model_metadata FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- ACTIVITY_LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON activity_log TO authenticated;
DROP POLICY IF EXISTS "activity_select_own" ON activity_log;
CREATE POLICY "activity_select_own" ON activity_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "activity_insert_own" ON activity_log;
CREATE POLICY "activity_insert_own" ON activity_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity_log (user_id, created_at);

-- ============================================================================
-- Helper triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION bump_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION bump_updated_at();

DROP TRIGGER IF EXISTS trg_requests_updated ON connection_requests;
CREATE TRIGGER trg_requests_updated BEFORE UPDATE ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION bump_updated_at();

NOTIFY pgrst, 'reload schema';
