import { useEffect, useState } from 'react';
import { Users, GitCompare, Heart, Info } from 'lucide-react';
import { Card, Spinner, PageHeader, Badge, Avatar } from '../components/ui';
import { loadNetwork } from '../lib/data';
import { SocialGraph } from '../lib/graph';
import { useAuth } from '../context/useAuth';
import type { Profile, Interest } from '../lib/types';

export function MutualFriends() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<SocialGraph | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [interestsMap, setInterestsMap] = useState<Map<string, Interest[]>>(new Map());
  const [userA, setUserA] = useState('');
  const [userB, setUserB] = useState('');

  useEffect(() => {
    (async () => {
      const network = await loadNetwork(profile?.id);
      const g = new SocialGraph();
      for (const p of network.profiles) g.addNode({ id: p.id, label: p.display_name, interests: [], skills: [] });
      for (const c of network.connections) g.addEdge(c.user_a, c.user_b);
      setGraph(g);
      setProfiles(network.profiles);
      setInterestsMap(network.interestsByProfile);
      if (profile) setUserA(profile.id);
      setLoading(false);
    })();
  }, [profile]);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  const a = profiles.find((p) => p.id === userA);
  const b = profiles.find((p) => p.id === userB);

  let mutual: string[] = [];
  let jaccard = 0;
  let commonNeighbors = 0;
  let neighborsA: string[] = [];
  let neighborsB: string[] = [];
  let distinctA: string[] = [];
  let distinctB: string[] = [];
  let commonInterests: Interest[] = [];

  if (graph && userA && userB && userA !== userB) {
    mutual = graph.mutualFriends(userA, userB);
    jaccard = graph.jaccard(userA, userB);
    commonNeighbors = mutual.length;
    neighborsA = Array.from(graph.getNeighbors(userA)).filter((n) => n !== userB);
    neighborsB = Array.from(graph.getNeighbors(userB)).filter((n) => n !== userA);
    const setA = new Set(neighborsA);
    const setB = new Set(neighborsB);
    distinctA = neighborsA.filter((n) => !setB.has(n));
    distinctB = neighborsB.filter((n) => !setA.has(n));
    const ia = interestsMap.get(userA) ?? [];
    const ib = interestsMap.get(userB) ?? [];
    commonInterests = ia.filter((i) => ib.some((j) => j.id === i.id));
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Mutual Friend Analyzer" subtitle="Compare two users' neighborhoods with common-neighbor and Jaccard similarity." />

      <Card className="p-5 mb-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-navy-700">User A</label>
            <select value={userA} onChange={(e) => setUserA(e.target.value)} className="input-field mt-1">
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.id === profile?.id ? ' (You)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-navy-700">User B</label>
            <select value={userB} onChange={(e) => setUserB(e.target.value)} className="input-field mt-1">
              <option value="">Select...</option>
              {profiles.filter((p) => p.id !== userA).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {userA && userB && userA !== userB && (
        <div className="animate-fade-in space-y-4">
          {/* User cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-4 flex items-center gap-3">
              <Avatar src={a?.avatar_url} name={a?.display_name ?? ''} size="lg" />
              <div>
                <p className="font-semibold text-navy-900">{a?.display_name}</p>
                <p className="text-xs text-muted">{neighborsA.length} friends · {(interestsMap.get(userA) ?? []).length} interests</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <Avatar src={b?.avatar_url} name={b?.display_name ?? ''} size="lg" />
              <div>
                <p className="font-semibold text-navy-900">{b?.display_name}</p>
                <p className="text-xs text-muted">{neighborsB.length} friends · {(interestsMap.get(userB) ?? []).length} interests</p>
              </div>
            </Card>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="p-4 text-center">
              <Users size={20} className="mx-auto text-indigo-500 mb-1" />
              <p className="text-2xl font-bold text-navy-900">{commonNeighbors}</p>
              <p className="text-xs text-muted">Common neighbors</p>
            </Card>
            <Card className="p-4 text-center">
              <GitCompare size={20} className="mx-auto text-success-400 mb-1" />
              <p className="text-2xl font-bold text-navy-900">{(jaccard * 100).toFixed(1)}%</p>
              <p className="text-xs text-muted">Jaccard similarity</p>
            </Card>
            <Card className="p-4 text-center">
              <Heart size={20} className="mx-auto text-error-300 mb-1" />
              <p className="text-2xl font-bold text-navy-900">{commonInterests.length}</p>
              <p className="text-xs text-muted">Common interests</p>
            </Card>
          </div>

          {/* Formulas */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Info size={16} className="text-indigo-500" /><h3 className="font-semibold text-navy-900">Calculations</h3></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-navy-50 rounded-xl p-3">
                <p className="text-sm font-mono text-navy-700">CN(A,B) = |N(A) ∩ N(B)|</p>
                <p className="text-xs text-muted mt-1">= |{neighborsA.length} ∩ {neighborsB.length}| = <strong>{commonNeighbors}</strong></p>
              </div>
              <div className="bg-navy-50 rounded-xl p-3">
                <p className="text-sm font-mono text-navy-700">J(A,B) = |∩| / |∪|</p>
                <p className="text-xs text-muted mt-1">= {commonNeighbors} / {new Set([...neighborsA, ...neighborsB]).size} = <strong>{jaccard.toFixed(3)}</strong></p>
              </div>
            </div>
          </Card>

          {/* Common friends */}
          {mutual.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-navy-900 mb-3">Mutual friends ({mutual.length})</h3>
              <div className="flex flex-wrap gap-2">
                {mutual.map((id) => {
                  const p = profiles.find((p) => p.id === id);
                  if (!p) return null;
                  return <Badge key={id} color="success">{p.display_name}</Badge>;
                })}
              </div>
            </Card>
          )}

          {/* Common vs distinct */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-navy-700 mb-2">Only in A's network ({distinctA.length})</h3>
              <div className="flex flex-wrap gap-1">
                {distinctA.length === 0 ? <span className="text-xs text-muted">None</span> :
                  distinctA.slice(0, 10).map((id) => {
                    const p = profiles.find((p) => p.id === id);
                    return p ? <Badge key={id} color="navy">{p.display_name}</Badge> : null;
                  })}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-navy-700 mb-2">Only in B's network ({distinctB.length})</h3>
              <div className="flex flex-wrap gap-1">
                {distinctB.length === 0 ? <span className="text-xs text-muted">None</span> :
                  distinctB.slice(0, 10).map((id) => {
                    const p = profiles.find((p) => p.id === id);
                    return p ? <Badge key={id} color="navy">{p.display_name}</Badge> : null;
                  })}
              </div>
            </Card>
          </div>

          {commonInterests.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-navy-900 mb-2">Shared interests</h3>
              <div className="flex flex-wrap gap-2">
                {commonInterests.map((i) => <Badge key={i.id} color="indigo">{i.name}</Badge>)}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
