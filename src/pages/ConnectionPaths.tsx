import { useEffect, useState } from 'react';
import { GitBranch, ArrowRight, AlertCircle, Info } from 'lucide-react';
import { Card, Button, Spinner, EmptyState, PageHeader, Badge } from '../components/ui';
import { loadNetwork } from '../lib/data';
import { SocialGraph } from '../lib/graph';
import { useAuth } from '../context/useAuth';
import type { Profile } from '../lib/types';

export function ConnectionPaths() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<SocialGraph | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [path, setPath] = useState<string[] | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    (async () => {
      const network = await loadNetwork(profile?.id);
      const g = new SocialGraph();
      for (const p of network.profiles) g.addNode({ id: p.id, label: p.display_name, interests: [], skills: [] });
      for (const c of network.connections) g.addEdge(c.user_a, c.user_b);
      setGraph(g);
      setProfiles(network.profiles);
      if (profile) setSourceId(profile.id);
      setLoading(false);
    })();
  }, [profile]);

  const findPath = () => {
    if (!graph || !sourceId || !targetId) return;
    setSearched(true);
    const result = graph.shortestPath(sourceId, targetId, 6);
    setPath(result);
  };

  const pathProfiles = path?.map((id) => profiles.find((p) => p.id === id)).filter(Boolean) as Profile[];

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Connection Path Finder" subtitle="Find the shortest friendship path between two people using BFS." />

      <Card className="p-5 mb-6">
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-navy-700">From</label>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="input-field mt-1">
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.id === profile?.id ? ' (You)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-navy-700">To</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="input-field mt-1">
              <option value="">Select a person...</option>
              {profiles.filter((p) => p.id !== sourceId).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
        </div>
        <Button onClick={findPath} disabled={!sourceId || !targetId}>
          <GitBranch size={16} /> Find Shortest Path
        </Button>
      </Card>

      {searched && (
        <Card className="p-6">
          {sourceId === targetId ? (
            <EmptyState title="Same person" description="Source and target are the same user." />
          ) : path ? (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <Badge color="success">Path found</Badge>
                <span className="text-sm text-muted">{path.length - 1} friendship edge{path.length - 1 === 1 ? '' : 's'} · {path.length} people</span>
              </div>

              {/* Path visualization */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {pathProfiles.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex flex-col items-center min-w-[100px]">
                      <div className={`w-14 h-14 rounded-full ${i === 0 ? 'bg-indigo-500' : i === pathProfiles.length - 1 ? 'bg-success-400' : 'bg-navy-300'} text-white flex items-center justify-center font-bold text-sm`}>
                        {p.display_name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </div>
                      <span className="text-xs text-navy-700 mt-1 text-center max-w-[100px] truncate">
                        {p.id === profile?.id ? 'You' : p.display_name.split(' ')[0]}
                      </span>
                    </div>
                    {i < pathProfiles.length - 1 && (
                      <ArrowRight size={20} className="text-indigo-300 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-navy-50 rounded-xl text-sm text-navy-600">
                <Info size={14} className="inline mr-1.5 text-muted" />
                The shortest path is the <strong>fewest friendship edges</strong> between the two users, found via Breadth-First Search. It doesn't necessarily indicate the strongest friendship.
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <AlertCircle size={32} className="mx-auto text-muted mb-3" />
              <h3 className="font-semibold text-navy-800">No path found</h3>
              <p className="text-sm text-muted mt-1 max-w-md mx-auto">
                These two people are not connected within 6 hops. This can happen if they belong to disconnected parts of the network or one is an isolated node.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Explanation */}
      <Card className="p-5 mt-6">
        <h3 className="font-semibold text-navy-900 mb-2">How it works</h3>
        <p className="text-sm text-muted leading-relaxed">
          Bondly uses Breadth-First Search (BFS) to find the shortest path because all friendship edges have equal weight.
          BFS explores the graph level by level — first direct friends, then friends-of-friends, and so on — guaranteeing
          the first path discovered is the shortest in terms of edge count. The algorithm runs in <strong>O(V + E)</strong> time.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="bg-navy-50 rounded-xl p-3">
            <p className="text-xs text-muted">Direct connection</p>
            <p className="font-semibold text-navy-900">1 hop</p>
          </div>
          <div className="bg-navy-50 rounded-xl p-3">
            <p className="text-xs text-muted">Two-hop</p>
            <p className="font-semibold text-navy-900">through a mutual friend</p>
          </div>
          <div className="bg-navy-50 rounded-xl p-3">
            <p className="text-xs text-muted">Three+ hops</p>
            <p className="font-semibold text-navy-900">extended network</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
