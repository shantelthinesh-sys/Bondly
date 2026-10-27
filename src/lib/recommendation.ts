import type {
  Profile,
  Interest,
  Skill,
  Recommendation,
  FeatureVector,
  ScoreContribution,
  RecommendationConfig,
  RecommendationMode,
  FeedbackType,
} from './types';
import { SocialGraph } from './graph';

/**
 * RecommendationEngine — generates explainable friend recommendations
 * by combining graph-based features, rule-based scoring, and an optional
 * logistic-regression ML model. All scores are computed from real features.
 *
 * Pipeline:
 *   1. Candidate generation (friends-of-friends, privacy-filtered)
 *   2. Feature extraction (mutual friends, Jaccard, interests, skills, proximity, feedback)
 *   3. Rule-based scoring with configurable weights
 *   4. Optional ML prediction (logistic regression)
 *   5. Hybrid blending (rule × blend + ml × (1 - blend))
 *   6. Explanation generation
 */

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
  outgoingRequestIds: Set<string>;
  savedIds: Set<string>;
  config: RecommendationConfig;
  mlModel?: LogisticRegression;
}

export interface RuleEvaluation {
  ruleId: string;
  label: string;
  triggered: boolean;
  action: string;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function levelFor(value: number): ScoreContribution['level'] {
  if (value >= 0.75) return 'strong';
  if (value >= 0.5) return 'high';
  if (value >= 0.25) return 'moderate';
  if (value > 0) return 'low';
  return 'none';
}

/**
 * Logistic regression model — a genuine, trainable binary classifier.
 * Trained on a synthetic dataset (see trainModel) with gradient descent.
 * Persists weights to localStorage so training survives reloads.
 */
export class LogisticRegression {
  weights: number[] = [];
  bias = 0;
  trained = false;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    roc_auc: number;
    trainSamples: number;
    testSamples: number;
  } | null = null;
  featureNames: string[] = [
    'mutual_friends',
    'jaccard_similarity',
    'common_interests',
    'interest_similarity',
    'common_skills',
    'skill_similarity',
    'proximity_score',
    'feedback_score',
  ];

  constructor() {
    this.load();
  }

  private featureVector(f: FeatureVector): number[] {
    return [
      f.mutual_friends / 10,
      f.jaccard_similarity,
      f.common_interests / 8,
      f.interest_similarity,
      f.common_skills / 8,
      f.skill_similarity,
      f.proximity_score,
      f.feedback_score,
    ];
  }

  predict(features: FeatureVector): number {
    if (!this.trained) return 0.5;
    const x = this.featureVector(features);
    return sigmoid(dot(x, this.weights) + this.bias);
  }

  /**
   * Train on a synthetic labeled dataset where the label is a noisy function
   * of the same features that drive the rule-based score. This produces a
   * model that genuinely learns feature-to-outcome relationships, with honest
   * train/test evaluation. The label is clearly synthetic — NOT real friendship
   * outcomes.
   */
  train(
    samples: { features: FeatureVector; label: number }[],
    lr = 0.1,
    epochs = 300,
    l2 = 0.001,
  ): void {
    if (samples.length < 10) return;
    const splitIdx = Math.floor(samples.length * 0.8);
    const train = samples.slice(0, splitIdx);
    const test = samples.slice(splitIdx);

    const n = this.featureNames.length;
    this.weights = new Array(n).fill(0);
    this.bias = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradW = new Array(n).fill(0);
      let gradB = 0;
      for (const s of train) {
        const x = this.featureVector(s.features);
        const pred = sigmoid(dot(x, this.weights) + this.bias);
        const err = pred - s.label;
        for (let i = 0; i < n; i++) {
          gradW[i] += err * x[i] + l2 * this.weights[i];
        }
        gradB += err;
      }
      for (let i = 0; i < n; i++) {
        this.weights[i] -= (lr * gradW[i]) / train.length;
      }
      this.bias -= (lr * gradB) / train.length;
    }

    this.trained = true;
    this.metrics = this.evaluate(train, test);
    this.save();
  }

  private evaluate(
    train: { features: FeatureVector; label: number }[],
    test: { features: FeatureVector; label: number }[],
  ) {
    const testPreds = test.map((s) => ({ pred: this.predict(s.features), label: s.label }));
    return {
      accuracy: computeAccuracy(testPreds),
      precision: computePrecision(testPreds),
      recall: computeRecall(testPreds),
      f1: computeF1(testPreds),
      roc_auc: computeRocAuc(testPreds),
      trainSamples: train.length,
      testSamples: test.length,
    };
  }

  featureImportance(): { feature: string; weight: number }[] {
    return this.featureNames.map((f, i) => ({ feature: f, weight: this.weights[i] ?? 0 }));
  }

  private save(): void {
    try {
      localStorage.setItem('bondly_ml_model', JSON.stringify({
        weights: this.weights,
        bias: this.bias,
        trained: this.trained,
        metrics: this.metrics,
      }));
    } catch {
      // localStorage unavailable — model stays in-memory only
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem('bondly_ml_model');
      if (raw) {
        const data = JSON.parse(raw);
        this.weights = data.weights ?? [];
        this.bias = data.bias ?? 0;
        this.trained = data.trained ?? false;
        this.metrics = data.metrics ?? null;
      }
    } catch {
      // ignore
    }
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function computeAccuracy(preds: { pred: number; label: number }[]): number {
  if (preds.length === 0) return 0;
  let correct = 0;
  for (const p of preds) if ((p.pred >= 0.5 ? 1 : 0) === p.label) correct++;
  return correct / preds.length;
}
function computePrecision(preds: { pred: number; label: number }[]): number {
  let tp = 0, fp = 0;
  for (const p of preds) {
    if (p.pred >= 0.5) {
      if (p.label === 1) tp++; else fp++;
    }
  }
  return tp + fp === 0 ? 0 : tp / (tp + fp);
}
function computeRecall(preds: { pred: number; label: number }[]): number {
  let tp = 0, fn = 0;
  for (const p of preds) {
    if (p.label === 1) {
      if (p.pred >= 0.5) tp++; else fn++;
    }
  }
  return tp + fn === 0 ? 0 : tp / (tp + fn);
}
function computeF1(preds: { pred: number; label: number }[]): number {
  const p = computePrecision(preds);
  const r = computeRecall(preds);
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}
function computeRocAuc(preds: { pred: number; label: number }[]): number {
  const sorted = [...preds].sort((a, b) => b.pred - a.pred);
  const pos = preds.filter((p) => p.label === 1).length;
  const neg = preds.filter((p) => p.label === 0).length;
  if (pos === 0 || neg === 0) return 0.5;
  let auc = 0;
  let rankSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].label === 1) rankSum += i + 1;
  }
  auc = (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
  return auc;
}

/**
 * Generate a synthetic training dataset using the same feature pipeline as
 * real recommendations. Labels are generated by a noisy logistic function of
 * the features — clearly documented as synthetic, never claimed to be real.
 */
export function generateSyntheticDataset(
  graph: SocialGraph,
  interests: Map<string, Interest[]>,
  skills: Map<string, Skill[]>,
  allProfiles: Profile[],
): { features: FeatureVector; label: number }[] {
  const samples: { features: FeatureVector; label: number }[] = [];
  const ids = allProfiles.map((p) => p.id);
  for (const user of ids) {
    for (const candidate of ids) {
      if (user === candidate) continue;
      if (graph.isConnected(user, candidate)) continue;
      const features = extractFeatures(user, candidate, graph, interests, skills, new Map());
      const logit =
        1.2 * features.mutual_friends / 10 +
        1.5 * features.interest_similarity +
        0.8 * features.skill_similarity +
        1.0 * features.jaccard_similarity +
        0.9 * features.proximity_score +
        0.4 * features.feedback_score;
      const noise = (Math.random() - 0.5) * 0.6;
      const label = sigmoid(logit + noise) > 0.5 ? 1 : 0;
      samples.push({ features, label });
    }
  }
  return samples;
}

/**
 * Extract a full feature vector for a candidate relative to the current user.
 */
export function extractFeatures(
  currentUserId: string,
  candidateId: string,
  graph: SocialGraph,
  interests: Map<string, Interest[]>,
  skills: Map<string, Skill[]>,
  feedbackMap: Map<string, FeedbackType>,
): FeatureVector {
  const mutual = graph.mutualFriends(currentUserId, candidateId);
  const myInterests = new Set((interests.get(currentUserId) ?? []).map((i) => i.id));
  const candInterests = new Set((interests.get(candidateId) ?? []).map((i) => i.id));
  const mySkills = new Set((skills.get(currentUserId) ?? []).map((s) => s.id));
  const candSkills = new Set((skills.get(candidateId) ?? []).map((s) => s.id));

  let commonInterests = 0;
  for (const i of myInterests) if (candInterests.has(i)) commonInterests++;
  let commonSkills = 0;
  for (const s of mySkills) if (candSkills.has(s)) commonSkills++;

  const interestDenom = Math.max(myInterests.size, candInterests.size, 1);
  const skillDenom = Math.max(mySkills.size, candSkills.size, 1);

  const distance = graph.connectionDistance(currentUserId, candidateId, 6);
  const proximity = distance === Infinity ? 0 : 1 / distance;

  const feedback = feedbackMap.get(candidateId);
  let feedbackScore = 0;
  if (feedback === 'interested' || feedback === 'already_know') feedbackScore = 1;
  if (feedback === 'not_interested' || feedback === 'not_relevant' || feedback === 'dismiss') feedbackScore = 0;

  return {
    candidate_id: candidateId,
    mutual_friends: mutual.length,
    jaccard_similarity: graph.jaccard(currentUserId, candidateId),
    common_interests: commonInterests,
    interest_similarity: commonInterests / interestDenom,
    common_skills: commonSkills,
    skill_similarity: commonSkills / skillDenom,
    connection_distance: distance === Infinity ? -1 : distance,
    proximity_score: proximity,
    feedback_score: feedbackScore,
    is_connected: graph.isConnected(currentUserId, candidateId),
  };
}

/**
 * Normalize a raw feature value to [0,1] using sensible bounds.
 */
function normalizeFeature(key: keyof FeatureVector, value: number): number {
  switch (key) {
    case 'mutual_friends': return clamp01(value / 10);
    case 'jaccard_similarity': return clamp01(value);
    case 'common_interests': return clamp01(value / 8);
    case 'interest_similarity': return clamp01(value);
    case 'common_skills': return clamp01(value / 8);
    case 'skill_similarity': return clamp01(value);
    case 'proximity_score': return clamp01(value);
    case 'feedback_score': return clamp01(value);
    default: return 0;
  }
}

/**
 * Score contributions: each component's normalized value, weight, and contribution.
 * When feedback data is unavailable (no feedback entries at all), we redistribute
 * its weight across the other components rather than inventing a value.
 */
function buildContributions(
  features: FeatureVector,
  config: RecommendationConfig,
  hasFeedbackData: boolean,
): ScoreContribution[] {
  const weights = { ...config.weights };
  if (!hasFeedbackData) {
    const freed = weights.feedback;
    weights.feedback = 0;
    const remaining = Object.entries(weights)
      .filter(([k]) => k !== 'feedback')
      .reduce((s, [, v]) => s + (v as number), 0);
    if (remaining > 0) {
      const scale = (remaining + freed) / remaining;
      for (const k of Object.keys(weights) as (keyof typeof weights)[]) {
        if (k !== 'feedback') weights[k] *= scale;
      }
    }
  }

  const map: { key: keyof FeatureVector; label: string; weight: keyof typeof weights; raw: number }[] = [
    { key: 'mutual_friends', label: 'Mutual friends', weight: 'mutual_friends', raw: features.mutual_friends },
    { key: 'interest_similarity', label: 'Shared interests', weight: 'interest_similarity', raw: features.interest_similarity },
    { key: 'skill_similarity', label: 'Shared skills', weight: 'skill_similarity', raw: features.skill_similarity },
    { key: 'jaccard_similarity', label: 'Neighborhood overlap', weight: 'jaccard', raw: features.jaccard_similarity },
    { key: 'proximity_score', label: 'Graph proximity', weight: 'proximity', raw: features.proximity_score },
    { key: 'feedback_score', label: 'Feedback signal', weight: 'feedback', raw: features.feedback_score },
  ];

  return map.map((m) => {
    const normalized = normalizeFeature(m.key, m.raw);
    const w = weights[m.weight] ?? 0;
    return {
      label: m.label,
      weight: w,
      raw_value: m.raw,
      normalized,
      contribution: normalized * w,
      level: levelFor(normalized),
    };
  });
}

function buildExplanation(
  features: FeatureVector,
  sharedInterestNames: string[],
  candidateName: string,
): string {
  const parts: string[] = [];
  if (features.mutual_friends > 0) {
    parts.push(`you share ${features.mutual_friends} mutual friend${features.mutual_friends === 1 ? '' : 's'}`);
  }
  if (features.common_interests > 0) {
    const names = sharedInterestNames.slice(0, 3);
    const list = names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0];
    parts.push(`you both like ${list}`);
  }
  if (features.common_skills > 0) {
    parts.push(`you share ${features.common_skills} skill${features.common_skills === 1 ? '' : 's'}`);
  }
  if (features.connection_distance > 0 && features.connection_distance <= 6) {
    parts.push(`${candidateName} is ${features.connection_distance} connection${features.connection_distance === 1 ? '' : 's'} away`);
  }
  if (parts.length === 0) {
    return `${candidateName} appears in your extended network but there's limited overlap in your profiles.`;
  }
  return `${candidateName} is recommended because ${parts.join(', ')}.`;
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
      label: 'Mutual friends boost',
      triggered: features.mutual_friends > 0,
      action: features.mutual_friends > 0 ? `+${features.mutual_friends} mutual friend contribution` : 'No mutual friends — no boost',
    },
    {
      ruleId: 'R2',
      label: 'Shared interests boost',
      triggered: features.common_interests > 0,
      action: features.common_interests > 0 ? `+${features.common_interests} shared interests contribution` : 'No shared interests',
    },
    {
      ruleId: 'R3',
      label: 'Exclude if outside visibility scope',
      triggered: false,
      action: 'Candidate is discoverable',
    },
    {
      ruleId: 'R4',
      label: 'Exclude if blocked',
      triggered: isBlocked,
      action: isBlocked ? 'EXCLUDED — blocked' : 'Not blocked',
    },
    {
      ruleId: 'R5',
      label: 'Suppress dismissed candidate',
      triggered: isDismissed,
      action: isDismissed ? 'SUPPRESSED unless preference reset' : 'Not dismissed',
    },
    {
      ruleId: 'R6',
      label: 'No invented missing values',
      triggered: features.mutual_friends === 0 && features.common_interests === 0,
      action: 'Missing features kept at zero — no artificial match',
    },
    {
      ruleId: 'R7',
      label: 'Exclude existing friends',
      triggered: isFriend,
      action: isFriend ? 'EXCLUDED — already connected' : 'Not already connected',
    },
  ];
}

/**
 * Generate the full recommendation list for the current user.
 */
export function generateRecommendations(ctx: EngineContext): Recommendation[] {
  const { currentUser, candidates, graph, interests, skills, config } = ctx;
  const recs: Recommendation[] = [];

  // Determine if any feedback exists at all (for weight redistribution)
  const hasFeedbackData = ctx.feedbackMap.size > 0;

  for (const candidate of candidates) {
    if (candidate.id === currentUser.id) continue;
    if (ctx.blockedIds.has(candidate.id)) continue;
    if (ctx.acceptedFriendIds.has(candidate.id)) continue;
    if (ctx.dismissedIds.has(candidate.id)) continue;
    if (!candidate.discovery_enabled) continue;

    const features = extractFeatures(
      currentUser.id,
      candidate.id,
      graph,
      interests,
      skills,
      ctx.feedbackMap,
    );

    const contributions = buildContributions(features, config, hasFeedbackData);
    const ruleScore = contributions.reduce((s, c) => s + c.contribution, 0);

    const existingFeedback = ctx.feedbackMap.get(candidate.id) ?? null;

    const sharedInterests = (interests.get(candidate.id) ?? []).filter((i) =>
      (interests.get(currentUser.id) ?? []).some((mi) => mi.id === i.id),
    );
    const sharedSkills = (skills.get(candidate.id) ?? []).filter((s) =>
      (skills.get(currentUser.id) ?? []).some((ms) => ms.id === s.id),
    );

    const rules = evaluateRules(
      features,
      ctx.blockedIds.has(candidate.id),
      ctx.dismissedIds.has(candidate.id),
      ctx.acceptedFriendIds.has(candidate.id),
    );
    const triggeredRules = rules.filter((r) => r.triggered).map((r) => `${r.ruleId}: ${r.label}`);

    let mlProbability: number | null = null;
    let hybridScore = ruleScore;

    if (config.mode === 'ml' || config.mode === 'hybrid') {
      if (ctx.mlModel?.trained) {
        mlProbability = ctx.mlModel.predict(features);
        if (config.mode === 'hybrid') {
          hybridScore = config.hybrid_blend * ruleScore + (1 - config.hybrid_blend) * mlProbability;
        } else {
          hybridScore = mlProbability;
        }
      }
    }

    const finalScore = Math.round(clamp01(hybridScore) * 100);
    const mode: RecommendationMode = ctx.mlModel?.trained && config.mode !== 'rule_based' ? config.mode : 'rule_based';

    recs.push({
      candidate,
      candidate_id: candidate.id,
      features,
      score: finalScore,
      rule_score: Math.round(clamp01(ruleScore) * 100),
      ml_probability: mlProbability !== null ? Math.round(mlProbability * 100) : null,
      hybrid_score: Math.round(clamp01(hybridScore) * 100),
      mode,
      shared_interests: sharedInterests,
      shared_skills: sharedSkills,
      mutual_friend_count: features.mutual_friends,
      connection_distance: features.connection_distance,
      explanation: buildExplanation(features, sharedInterests.map((i) => i.name), candidate.display_name),
      contributions,
      triggered_rules: triggeredRules,
      feedback: existingFeedback,
    });
  }

  return recs.sort((a, b) => b.score - a.score);
}

export type RecommendationModeAlias = RecommendationMode;
