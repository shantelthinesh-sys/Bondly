import { supabase } from './supabase';
import type {
  Profile, Interest, Skill, Connection, Community, FeedbackType,
  RecommendationFeedback,
} from './types';

interface BlockRow {
  blocked_id: string;
}

interface SavedProfileRow {
  saved_profile_id: string;
}

interface ConnectionRequestRow {
  sender_id: string;
  receiver_id: string;
}

/** Load the entire social network into in-memory maps for graph computation. */
export async function loadNetwork(userId?: string) {
  const [profilesRes, interestsRes, piRes, skillsRes, psRes, connectionsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('is_demo', false),
    supabase.from('interests').select('*'),
    supabase.from('profile_interests').select('profile_id, interest_id'),
    supabase.from('skills').select('*'),
    supabase.from('profile_skills').select('profile_id, skill_id'),
    supabase.from('connections').select('*'),
  ]);

  const loadError = [
    profilesRes.error,
    interestsRes.error,
    piRes.error,
    skillsRes.error,
    psRes.error,
    connectionsRes.error,
  ].find(Boolean);
  if (loadError) throw loadError;

  const profiles = (profilesRes.data ?? []) as Profile[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const interests = (interestsRes.data ?? []) as Interest[];
  const skills = (skillsRes.data ?? []) as Skill[];
  const visibleProfileIds = new Set(
    profiles
      .filter((profile) => profile.id === userId || profile.visibility.connections)
      .map((profile) => profile.id),
  );
  const connections = ((connectionsRes.data ?? []) as Connection[]).filter(
    (connection) => visibleProfileIds.has(connection.user_a) && visibleProfileIds.has(connection.user_b),
  );

  const interestsByProfile = new Map<string, Interest[]>();
  const skillsByProfile = new Map<string, Skill[]>();

  const interestMap = new Map(interests.map((i) => [i.id, i]));
  const skillMap = new Map(skills.map((s) => [s.id, s]));

  for (const row of piRes.data ?? []) {
    if (row.profile_id !== userId && !profileMap.get(row.profile_id)?.visibility.interests) continue;
    const list = interestsByProfile.get(row.profile_id) ?? [];
    const interest = interestMap.get(row.interest_id);
    if (interest) list.push(interest);
    interestsByProfile.set(row.profile_id, list);
  }
  for (const row of psRes.data ?? []) {
    if (row.profile_id !== userId && !profileMap.get(row.profile_id)?.visibility.skills) continue;
    const list = skillsByProfile.get(row.profile_id) ?? [];
    const skill = skillMap.get(row.skill_id);
    if (skill) list.push(skill);
    skillsByProfile.set(row.profile_id, list);
  }

  return {
    profiles,
    interests,
    skills,
    connections,
    interestsByProfile,
    skillsByProfile,
  };
}

export async function loadUserNetworkData(userId: string) {
  const [blocksRes, feedbackRes, savedRes, connectionsRes, sentReqRes, recvReqRes] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', userId),
    supabase.from('recommendation_feedback').select('*').eq('user_id', userId),
    supabase.from('saved_profiles').select('saved_profile_id').eq('user_id', userId),
    supabase.from('connections').select('*').or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from('connection_requests').select('*').eq('sender_id', userId).eq('status', 'pending'),
    supabase.from('connection_requests').select('*').eq('receiver_id', userId).eq('status', 'pending'),
  ]);

  const loadError = [
    blocksRes.error,
    feedbackRes.error,
    savedRes.error,
    connectionsRes.error,
    sentReqRes.error,
    recvReqRes.error,
  ].find(Boolean);
  if (loadError) throw loadError;

  const blocks = (blocksRes.data ?? []) as BlockRow[];
  const feedback = (feedbackRes.data ?? []) as RecommendationFeedback[];
  const saved = (savedRes.data ?? []) as SavedProfileRow[];
  const connections = (connectionsRes.data ?? []) as Connection[];
  const sentRequests = (sentReqRes.data ?? []) as ConnectionRequestRow[];
  const receivedRequests = (recvReqRes.data ?? []) as ConnectionRequestRow[];
  const blockedIds = new Set(blocks.map((block) => block.blocked_id));
  const feedbackMap = new Map<string, FeedbackType>(
    feedback.map((f) => [f.candidate_id, f.feedback_type]),
  );
  const savedIds = new Set(saved.map((s) => s.saved_profile_id));
  const acceptedFriendIds = new Set<string>();
  for (const c of connections) {
    if (c.user_a === userId) acceptedFriendIds.add(c.user_b);
    else acceptedFriendIds.add(c.user_a);
  }
  const outgoingRequestIds = new Set(sentRequests.map((r) => r.receiver_id));
  const incomingRequestIds = new Set(receivedRequests.map((r) => r.sender_id));

  return { blockedIds, feedbackMap, savedIds, acceptedFriendIds, outgoingRequestIds, incomingRequestIds };
}

export async function loadCommunities(userId?: string) {
  const [communitiesRes, membershipsRes, userMembershipsRes] = await Promise.all([
    supabase.from('communities').select('*'),
    supabase.from('community_memberships').select('community_id'),
    userId
      ? supabase.from('community_memberships').select('community_id').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const loadError = communitiesRes.error ?? membershipsRes.error ?? userMembershipsRes.error;
  if (loadError) throw loadError;

  const memberCounts = new Map<string, number>();
  for (const m of membershipsRes.data ?? []) {
    memberCounts.set(m.community_id, (memberCounts.get(m.community_id) ?? 0) + 1);
  }
  const userMemberships = new Set((userMembershipsRes.data ?? []).map((m) => m.community_id));

  return ((communitiesRes.data ?? []) as Community[]).map((c) => ({
    ...c,
    member_count: memberCounts.get(c.id) ?? 0,
    is_member: userMemberships.has(c.id),
  }));
}

export async function ensureInterest(name: string, category: string): Promise<string | null> {
  const { data: existing, error: existingError } = await supabase
    .from('interests').select('id, category').eq('name', name).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from('interests').insert({ name, category }).select('id').maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function ensureSkill(name: string): Promise<string | null> {
  const { data: existing, error: existingError } = await supabase
    .from('skills').select('id').eq('name', name).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from('skills').insert({ name }).select('id').maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
