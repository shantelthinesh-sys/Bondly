import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadNetwork, loadUserNetworkData } from '../lib/data';
import { SocialGraph } from '../lib/graph';
import {
  generateRecommendations,
  LogisticRegression,
  generateSyntheticDataset,
} from '../lib/recommendation';
import {
  DEFAULT_CONFIG,
  Recommendation,
  RecommendationConfig,
  RecommendationMode,
  Profile,
  Interest,
  Skill,
} from '../lib/types';

export interface EngineState {
  loading: boolean;
  recommendations: Recommendation[];
  graph: SocialGraph | null;
  profiles: Profile[];
  interestsByProfile: Map<string, Interest[]>;
  skillsByProfile: Map<string, Skill[]>;
  mlModel: LogisticRegression | null;
  mlTrained: boolean;
  mode: RecommendationMode;
  config: RecommendationConfig;
  error: string | null;
}

export function useRecommendationEngine() {
  const [state, setState] = useState<EngineState>({
    loading: false,
    recommendations: [],
    graph: null,
    profiles: [],
    interestsByProfile: new Map(),
    skillsByProfile: new Map(),
    mlModel: null,
    mlTrained: false,
    mode: DEFAULT_CONFIG.mode,
    config: DEFAULT_CONFIG,
    error: null,
  });

  const buildGraph = useCallback(async (uid: string): Promise<EngineState> => {
    const network = await loadNetwork();
    const userData = await loadUserNetworkData(uid);

    const graph = new SocialGraph();
    for (const p of network.profiles) {
      graph.addNode({
        id: p.id,
        label: p.display_name,
        interests: (network.interestsByProfile.get(p.id) ?? []).map((i) => i.name),
        skills: (network.skillsByProfile.get(p.id) ?? []).map((s) => s.name),
      });
    }
    for (const c of network.connections) {
      graph.addEdge(c.user_a, c.user_b);
    }

    // ML model — train on synthetic data if enough profiles exist
    const mlModel = new LogisticRegression();
    if (network.profiles.length >= 6 && !mlModel.trained) {
      const samples = generateSyntheticDataset(
        graph,
        network.interestsByProfile,
        network.skillsByProfile,
        network.profiles,
      );
      if (samples.length >= 20) {
        mlModel.train(samples);
      }
    }

    // Candidates: all other discoverable, non-blocked, non-friend, non-dismissed users
    const candidates = network.profiles.filter((p) => {
      if (p.id === uid) return false;
      if (userData.blockedIds.has(p.id)) return false;
      if (userData.acceptedFriendIds.has(p.id)) return false;
      if (userData.outgoingRequestIds.has(p.id)) return false;
      if (!p.discovery_enabled) return false;
      const dismissed = ['dismiss', 'not_interested', 'not_relevant'].includes(
        userData.feedbackMap.get(p.id) ?? '',
      );
      if (dismissed) return false;
      return true;
    });

    const config: RecommendationConfig = {
      ...DEFAULT_CONFIG,
      mode: mlModel.trained ? DEFAULT_CONFIG.mode : 'rule_based',
    };

    const recs = generateRecommendations({
      currentUser: network.profiles.find((p) => p.id === uid)!,
      candidates,
      graph,
      interests: network.interestsByProfile,
      skills: network.skillsByProfile,
      blockedIds: userData.blockedIds,
      dismissedIds: new Set(
        [...userData.feedbackMap.entries()]
          .filter(([, f]) => f === 'dismiss' || f === 'not_interested' || f === 'not_relevant')
          .map(([id]) => id),
      ),
      feedbackMap: userData.feedbackMap,
      acceptedFriendIds: userData.acceptedFriendIds,
      outgoingRequestIds: userData.outgoingRequestIds,
      savedIds: userData.savedIds,
      config,
      mlModel,
    });

    // Log impressions
    if (recs.length > 0) {
      supabase.from('recommendation_events').insert(
        recs.slice(0, 12).map((r) => ({
          viewer_id: uid,
          candidate_id: r.candidate_id,
          event_type: 'impression',
          score: r.score,
        })),
      ).then(() => {});
    }

    return {
      loading: false,
      recommendations: recs,
      graph,
      profiles: network.profiles,
      interestsByProfile: network.interestsByProfile,
      skillsByProfile: network.skillsByProfile,
      mlModel,
      mlTrained: mlModel.trained,
      mode: config.mode,
      config,
      error: null,
    };
  }, []);

  const refresh = useCallback(
    async (uid: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const next = await buildGraph(uid);
        setState(next);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load recommendations';
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    },
    [buildGraph],
  );

  const setMode = useCallback((mode: RecommendationMode) => {
    setState((s) => ({ ...s, mode, config: { ...s.config, mode } }));
  }, []);

  const setWeights = useCallback((weights: Partial<RecommendationConfig['weights']>) => {
    setState((s) => ({ ...s, config: { ...s.config, weights: { ...s.config.weights, ...weights } } }));
  }, []);

  return { state, refresh, setMode, setWeights };
}
