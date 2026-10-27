// Domain types for Bondly AI

export interface Profile {
  id: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  education: string;
  organization: string;
  location_city: string;
  headline: string;
  is_demo: boolean;
  visibility: ProfileVisibility;
  discovery_enabled: boolean;
  is_admin: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileVisibility {
  education: boolean;
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
  | 'education'
  | 'entertainment'
  | 'research';

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

export interface ModelMetadata {
  id: string;
  model_name: string;
  model_version: string;
  dataset_type: 'synthetic' | 'real' | 'none';
  training_example_count: number;
  evaluation_metrics: Record<string, number>;
  feature_importance: { feature: string; weight: number }[];
  limitations: string;
  is_active: boolean;
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
  rule_score: number;
  ml_probability: number | null;
  hybrid_score: number;
  mode: RecommendationMode;
  shared_interests: Interest[];
  shared_skills: Skill[];
  mutual_friend_count: number;
  connection_distance: number;
  explanation: string;
  contributions: ScoreContribution[];
  triggered_rules: string[];
  feedback: FeedbackType | null;
}

export type RecommendationMode = 'rule_based' | 'ml' | 'hybrid';

export interface RecommendationConfig {
  mode: RecommendationMode;
  weights: {
    mutual_friends: number;
    interest_similarity: number;
    skill_similarity: number;
    jaccard: number;
    proximity: number;
    feedback: number;
  };
  hybrid_blend: number;
}

export const DEFAULT_WEIGHTS = {
  mutual_friends: 0.30,
  interest_similarity: 0.25,
  skill_similarity: 0.15,
  jaccard: 0.10,
  proximity: 0.10,
  feedback: 0.10,
};

export const DEFAULT_CONFIG: RecommendationConfig = {
  mode: 'hybrid',
  weights: { ...DEFAULT_WEIGHTS },
  hybrid_blend: 0.70,
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
