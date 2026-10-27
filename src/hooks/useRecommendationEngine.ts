import { useCallback, useState } from 'react';
import { loadNetwork, loadUserNetworkData } from '../lib/data';
import { SocialGraph } from '../lib/graph';
import { generateRecommendations } from '../lib/recommendation';
import { DEFAULT_CONFIG } from '../lib/types';
import type { Recommendation, RecommendationConfig, Profile, Interest, Skill } from '../lib/types';

export interface EngineState {
  loading: boolean;
  recommendations: Recommendation[];
  graph: SocialGraph | null;
  profiles: Profile[];
  interestsByProfile: Map<string, Interest[]>;
  skillsByProfile: Map<string, Skill[]>;
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
    config: DEFAULT_CONFIG,
    error: null,
  });

  const buildGraph = useCallback(async (uid: string): Promise<EngineState> => {
    const network = await loadNetwork(uid);
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
    const currentUser = network.profiles.find((p) => p.id === uid);
    if (!currentUser) throw new Error('Your profile could not be found. Please sign in again.');

    // Candidates: all other discoverable, non-blocked, non-friend, non-dismissed users
    const candidates = network.profiles.filter((p) => {
      if (p.id === uid) return false;
      if (p.is_demo || !p.visibility.interests) return false;
      if (userData.blockedIds.has(p.id)) return false;
      if (userData.acceptedFriendIds.has(p.id)) return false;
      if (userData.outgoingRequestIds.has(p.id) || userData.incomingRequestIds.has(p.id)) return false;
      if (!p.discovery_enabled) return false;
      const dismissed = ['dismiss', 'not_interested', 'not_relevant'].includes(
        userData.feedbackMap.get(p.id) ?? '',
      );
      if (dismissed) return false;
      return true;
    });

    const config: RecommendationConfig = DEFAULT_CONFIG;

    const recs = generateRecommendations({
      currentUser,
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
      config,
    });

    return {
      loading: false,
      recommendations: recs,
      graph,
      profiles: network.profiles,
      interestsByProfile: network.interestsByProfile,
      skillsByProfile: network.skillsByProfile,
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

  return { state, refresh };
}
