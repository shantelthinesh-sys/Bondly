// Domain types for Bondly.

export interface Profile {
  id: string;
  display_name: string;
  username?: string;
  bio: string;
  avatar_url: string | null;
  organization: string;
  location_city: string;
  headline: string;
  is_demo: boolean;
  visibility: ProfileVisibility;
  discovery_enabled: boolean;
  message_privacy?: 'everyone' | 'connections';
  is_admin: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileVisibility {
  organization: boolean;
  skills: boolean;
  interests: boolean;
  location: boolean;
  connections: boolean;
}

export interface Interest {
  id: string;
  name: string;
  category: InterestCategory;
}

export type InterestCategory =
  | 'technology'
  | 'arts'
  | 'sports'
  | 'entertainment';

export interface Skill {
  id: string;
  name: string;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  category: string;
  created_by: string | null;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
}

export interface Connection {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
}

export interface ConnectionRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string;
  created_at: string;
  updated_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export type FeedbackType =
  | 'interested'
  | 'not_interested'
  | 'already_know'
  | 'dismiss'
  | 'not_relevant';

export interface RecommendationFeedback {
  id: string;
  user_id: string;
  candidate_id: string;
  feedback_type: FeedbackType;
  note: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface UserBlock {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface ProfileWithRelations extends Profile {
  interests: Interest[];
  skills: Skill[];
  is_friend?: boolean;
  is_saved?: boolean;
  has_pending_request?: boolean;
  is_blocked?: boolean;
}

// Recommendation engine types

export interface GraphNode {
  id: string;
  label: string;
  interests: string[];
  skills: string[];
}

export interface FeatureVector {
  candidate_id: string;
  mutual_friends: number;
  jaccard_similarity: number;
  common_interests: number;
  interest_similarity: number;
  common_skills: number;
  skill_similarity: number;
  connection_distance: number;
  proximity_score: number;
  feedback_score: number;
  is_connected: boolean;
  skills_available: boolean;
  neighborhood_available: boolean;
  proximity_available: boolean;
  feedback_available: boolean;
}

export interface ScoreContribution {
  label: string;
  weight: number;
  raw_value: number;
  normalized: number;
  contribution: number;
  level: 'none' | 'low' | 'moderate' | 'high' | 'strong';
}

export interface Recommendation {
  candidate: Profile;
  candidate_id: string;
  features: FeatureVector;
  score: number;
  shared_interests: Interest[];
  shared_skills: Skill[];
  mutual_friend_count: number;
  connection_distance: number;
  explanation: string;
  contributions: ScoreContribution[];
  triggered_rules: string[];
  feedback: FeedbackType | null;
}

export interface RecommendationConfig {
  weights: {
    mutual_friends: number;
    interest_similarity: number;
    skill_similarity: number;
    jaccard: number;
    proximity: number;
    feedback: number;
  };
}

export const DEFAULT_WEIGHTS = {
  mutual_friends: 0.10,
  interest_similarity: 0.70,
  skill_similarity: 0.05,
  jaccard: 0.05,
  proximity: 0.05,
  feedback: 0.05,
};

export const DEFAULT_CONFIG: RecommendationConfig = {
  weights: { ...DEFAULT_WEIGHTS },
};

export interface BFSStep {
  step: number;
  action: string;
  queue: string[];
  visited: string[];
  currentNode: string | null;
  discoveredEdges: { from: string; to: string }[];
  levels: Record<string, number>;
  description: string;
}

export interface BFSResult {
  steps: BFSStep[];
  visitedOrder: string[];
  levels: Record<string, number>;
  edges: { from: string; to: string }[];
}
