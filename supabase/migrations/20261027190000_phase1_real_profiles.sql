-- Remove fictional demo records and restrict profile-related writes to the
-- authenticated profile owner. Existing demo records are intentionally deleted.
BEGIN;

DELETE FROM public.communities c
USING public.profiles p
WHERE c.created_by = p.id
  AND p.is_demo = true;

DELETE FROM public.notifications n
USING public.connection_requests r
WHERE n.related_id = r.id
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.is_demo = true
      AND p.id IN (r.sender_id, r.receiver_id)
  );

DELETE FROM public.profiles
WHERE is_demo = true;

UPDATE public.profiles
SET visibility = jsonb_set(visibility, '{organization}', 'true'::jsonb)
WHERE NOT (visibility ? 'organization');

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR (is_demo = false AND discovery_enabled = true));

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND is_demo = false);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_demo = false);

DROP POLICY IF EXISTS "profile_interests_insert_own" ON public.profile_interests;
CREATE POLICY "profile_interests_insert_own" ON public.profile_interests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "profile_interests_select_all" ON public.profile_interests;
CREATE POLICY "profile_interests_select_all" ON public.profile_interests
  FOR SELECT TO authenticated
  USING (
    auth.uid() = profile_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND p.is_demo = false
        AND p.discovery_enabled = true
        AND p.visibility->>'interests' = 'true'
    )
  );

DROP POLICY IF EXISTS "profile_skills_insert_own" ON public.profile_skills;
CREATE POLICY "profile_skills_insert_own" ON public.profile_skills
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "profile_skills_select_all" ON public.profile_skills;
CREATE POLICY "profile_skills_select_all" ON public.profile_skills
  FOR SELECT TO authenticated
  USING (
    auth.uid() = profile_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND p.is_demo = false
        AND p.discovery_enabled = true
        AND p.visibility->>'skills' = 'true'
    )
  );

DROP POLICY IF EXISTS "connections_select_participant" ON public.connections;
CREATE POLICY "connections_select_participant" ON public.connections
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_a
    OR auth.uid() = user_b
    OR EXISTS (
      SELECT 1 FROM public.profiles a, public.profiles b
      WHERE a.id = user_a AND a.is_demo = false
        AND a.discovery_enabled = true
        AND a.visibility->>'connections' = 'true'
        AND b.id = user_b AND b.is_demo = false
        AND b.discovery_enabled = true
        AND b.visibility->>'connections' = 'true'
    )
  );

REVOKE INSERT ON public.connections FROM authenticated;
DROP POLICY IF EXISTS "connections_insert_participant" ON public.connections;

DROP POLICY IF EXISTS "communities_insert_any" ON public.communities;
CREATE POLICY "communities_insert_any" ON public.communities
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "cm_insert_own" ON public.community_memberships;
CREATE POLICY "cm_insert_own" ON public.community_memberships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.delete_auth_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

COMMIT;
