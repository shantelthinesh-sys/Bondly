import type {
  Profile,
  Interest,
  Skill,
  Recommendation,
  FeatureVector,
  ScoreContribution,
  RecommendationConfig,
  FeedbackType,
} from './types';
import { SocialGraph } from './graph';

export interface EngineContext {
  currentUser: Profile;
  candidates: Profile[];
  graph: SocialGraph;
  interests: Map<string, Interest[]>;
  skills: Map<string, Skill[]>;
  blockedIds: Set<string>;
  dismissedIds: Set<string>;
  feedbackMap: Map<string, FeedbackType>;
  acceptedFriendIds: Set<string>;
  config: RecommendationConfig;
}

export interface RuleEvaluation {
  ruleId: string;
  label: string;
  triggered: boolean;
  action: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function levelFor(value: number): ScoreContribution['level'] {
  if (value >= 0.75) return 'strong';
  if (value >= 0.5) return 'high';
  if (value >= 0.25) return 'moderate';
  return value > 0 ? 'low' : 'none';
}

export function extractFeatures(
  currentUserId: string,
  candidateId: string,
  graph: SocialGraph,
  interests: Map<string, Interest[]>,
  skills: Map<string, Skill[]>,
  feedbackMap: Map<string, FeedbackType>,
): FeatureVector {
  const mutual = graph.mutualFriends(currentUserId, candidateId);
  const myInterests = new Set((interests.get(currentUserId) ?? []).map((interest) => interest.id));
  const candidateInterests = new Set((interests.get(candidateId) ?? []).map((interest) => interest.id));
  const mySkills = new Set((skills.get(currentUserId) ?? []).map((skill) => skill.id));
  const candidateSkills = new Set((skills.get(candidateId) ?? []).map((skill) => skill.id));
  const commonInterests = [...myInterests].filter((id) => candidateInterests.has(id)).length;
  const commonSkills = [...mySkills].filter((id) => candidateSkills.has(id)).length;
  const interestUnion = new Set([...myInterests, ...candidateInterests]).size;
  const skillUnion = new Set([...mySkills, ...candidateSkills]).size;
  const distance = graph.connectionDistance(currentUserId, candidateId, 6);
  const feedback = feedbackMap.get(candidateId);
  const neighborUnion = new Set([
    ...graph.getNeighbors(currentUserId),
    ...graph.getNeighbors(candidateId),
  ]).size;

  return {
    candidate_id: candidateId,
    mutual_friends: mutual.length,
    jaccard_similarity: graph.jaccard(currentUserId, candidateId),
    common_interests: commonInterests,
    interest_similarity: interestUnion > 0 ? commonInterests / interestUnion : 0,
    common_skills: commonSkills,
    skill_similarity: skillUnion > 0 ? commonSkills / skillUnion : 0,
    connection_distance: distance === Infinity ? -1 : distance,
    proximity_score: distance === Infinity ? 0 : 1 / Math.max(distance, 1),
    feedback_score: feedback === 'interested' || feedback === 'already_know' ? 1 : 0,
    is_connected: graph.isConnected(currentUserId, candidateId),
    skills_available: mySkills.size > 0 && candidateSkills.size > 0,
    neighborhood_available: neighborUnion > 0,
    proximity_available: distance !== Infinity,
    feedback_available: feedback !== undefined,
  };
}

function buildContributions(
  features: FeatureVector,
  config: RecommendationConfig,
): ScoreContribution[] {
  const factors: {
    label: string;
    weight: keyof RecommendationConfig['weights'];
    raw: number;
    available: boolean;
    normalized: number;
  }[] = [
    { label: 'Shared interests', weight: 'interest_similarity', raw: features.common_interests, available: true, normalized: features.interest_similarity },
    { label: 'Mutual friends', weight: 'mutual_friends', raw: features.mutual_friends, available: true, normalized: clamp01(features.mutual_friends / 10) },
    { label: 'Shared skills', weight: 'skill_similarity', raw: features.common_skills, available: features.skills_available, normalized: features.skill_similarity },
    { label: 'Network overlap', weight: 'jaccard', raw: features.jaccard_similarity, available: features.neighborhood_available, normalized: features.jaccard_similarity },
    { label: 'Network proximity', weight: 'proximity', raw: features.connection_distance, available: features.proximity_available, normalized: features.proximity_score },
    { label: 'Your feedback', weight: 'feedback', raw: features.feedback_score, available: features.feedback_available, normalized: features.feedback_score },
  ];
  const activeWeight = factors.reduce(
    (total, factor) => total + (factor.available ? config.weights[factor.weight] : 0),
    0,
  );

  return factors.map((factor) => {
    const weight = factor.available && activeWeight > 0
      ? config.weights[factor.weight] / activeWeight
      : 0;
    return {
      label: factor.label,
      weight,
      raw_value: factor.raw,
      normalized: factor.available ? clamp01(factor.normalized) : 0,
      contribution: factor.available ? clamp01(factor.normalized) * weight : 0,
      level: factor.available ? levelFor(clamp01(factor.normalized)) : 'none',
    };
  });
}

function buildExplanation(
  features: FeatureVector,
  sharedInterestNames: string[],
): string {
  const names = sharedInterestNames.slice(0, 3);
  const shared = names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0];
  const reasons = [`you both enjoy ${shared}`];
  if (features.mutual_friends > 0) {
    reasons.push(`${features.mutual_friends} mutual connection${features.mutual_friends === 1 ? '' : 's'}`);
  }
  return `Recommended because ${reasons.join(' and ')}. Compatibility is an estimate based on shared profile information, not a prediction of friendship.`;
}

function evaluateRules(
  features: FeatureVector,
  isBlocked: boolean,
  isDismissed: boolean,
  isFriend: boolean,
): RuleEvaluation[] {
  return [
    {
      ruleId: 'R1',
      label: 'Interest overlap',
      triggered: features.common_interests > 0,
      action: `${features.common_interests} shared interest${features.common_interests === 1 ? '' : 's'}`,
    },
    {
      ruleId: 'R2',
      label: 'Exclude blocked profiles',
      triggered: isBlocked,
      action: isBlocked ? 'Excluded because this profile is blocked' : 'Profile is not blocked',
    },
    {
      ruleId: 'R3',
      label: 'Exclude dismissed profiles',
      triggered: isDismissed,
      action: isDismissed ? 'Excluded based on your feedback' : 'Profile is not dismissed',
    },
    {
      ruleId: 'R4',
      label: 'Exclude existing connections',
      triggered: isFriend,
      action: isFriend ? 'Already connected' : 'Not currently connected',
    },
  ];
}

export function generateRecommendations(ctx: EngineContext): Recommendation[] {
  const { currentUser, candidates, graph, interests, skills, config } = ctx;
  const ownInterests = interests.get(currentUser.id) ?? [];
  if (ownInterests.length === 0) return [];

  const recommendations: Recommendation[] = [];

  for (const candidate of candidates) {
    if (candidate.id === currentUser.id || candidate.is_demo || !candidate.discovery_enabled) continue;
    if (!candidate.visibility?.interests) continue;
    if (ctx.blockedIds.has(candidate.id) || ctx.acceptedFriendIds.has(candidate.id) || ctx.dismissedIds.has(candidate.id)) continue;

    const candidateInterests = interests.get(candidate.id) ?? [];
    const sharedInterests = candidateInterests.filter((interest) =>
      ownInterests.some((ownInterest) => ownInterest.id === interest.id),
    );
    if (sharedInterests.length === 0) continue;

    const features = extractFeatures(
      currentUser.id,
      candidate.id,
      graph,
      interests,
      skills,
      ctx.feedbackMap,
    );
    const contributions = buildContributions(features, config);
    const score = Math.round(clamp01(
      contributions.reduce((total, contribution) => total + contribution.contribution, 0),
    ) * 100);
    const sharedSkills = (skills.get(candidate.id) ?? []).filter((skill) =>
      (skills.get(currentUser.id) ?? []).some((ownSkill) => ownSkill.id === skill.id),
    );
    const rules = evaluateRules(
      features,
      ctx.blockedIds.has(candidate.id),
      ctx.dismissedIds.has(candidate.id),
      ctx.acceptedFriendIds.has(candidate.id),
    );

    recommendations.push({
      candidate,
      candidate_id: candidate.id,
      features,
      score,
      shared_interests: sharedInterests,
      shared_skills: sharedSkills,
      mutual_friend_count: features.mutual_friends,
      connection_distance: features.connection_distance,
      explanation: buildExplanation(features, sharedInterests.map((interest) => interest.name)),
      contributions,
      triggered_rules: rules.filter((rule) => rule.triggered).map((rule) => `${rule.ruleId}: ${rule.label}`),
      feedback: ctx.feedbackMap.get(candidate.id) ?? null,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}
