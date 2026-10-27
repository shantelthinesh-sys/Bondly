import { useEffect, useState, useMemo } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Node, Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Share2, Search } from 'lucide-react';
import { Card, Spinner, EmptyState, PageHeader, Button, Badge, Avatar } from '../components/ui';
import { loadNetwork } from '../lib/data';
import { SocialGraph as NetworkGraph } from '../lib/graph';
import { useAuth } from '../context/useAuth';
import type { Profile, Interest } from '../lib/types';

export function SocialGraph() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [interestsByProfile, setInterestsByProfile] = useState<Map<string, Interest[]>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSecondDegree, setShowSecondDegree] = useState(true);
  const [interestFilter, setInterestFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [availableInterests, setAvailableInterests] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const network = await loadNetwork(profile?.id);
      const g = new NetworkGraph();
      for (const p of network.profiles) {
        g.addNode({ id: p.id, label: p.display_name, interests: [], skills: [] });
      }
      for (const c of network.connections) g.addEdge(c.user_a, c.user_b);
      setGraph(g);
      setProfiles(network.profiles);
      setInterestsByProfile(network.interestsByProfile);
      const allInterests = new Set<string>();
      network.interestsByProfile.forEach((list) => list.forEach((i) => allInterests.add(i.name)));
      setAvailableInterests([...allInterests].sort());
      setLoading(false);
    })();
  }, [profile]);

  const { nodes, edges } = useMemo(() => {
    if (!graph || !profile) return { nodes: [], edges: [] };
    const directFriends = graph.getNeighbors(profile.id);
    const secondDegree = graph.friendsOfFriends(profile.id);

    // Build the visible subgraph
    const visibleIds = new Set<string>([profile.id, ...directFriends]);
    if (showSecondDegree) {
      for (const id of secondDegree) visibleIds.add(id);
    }

    // Apply interest filter
    if (interestFilter) {
      for (const id of [...visibleIds]) {
        if (id === profile.id) continue;
        const ints = interestsByProfile.get(id) ?? [];
        if (!ints.some((i) => i.name === interestFilter)) {
          visibleIds.delete(id);
        }
      }
    }

    // Apply search
    if (search) {
      const q = search.toLowerCase();
      for (const id of [...visibleIds]) {
        const p = profiles.find((p) => p.id === id);
        if (p && !p.display_name.toLowerCase().includes(q)) {
          visibleIds.delete(id);
        }
      }
    }

    // Limit for performance
    const limitedIds = new Set([...visibleIds].slice(0, 80));

    // Layout: simple radial — current user center, friends inner ring, fof outer ring
    const cx = 400, cy = 300;
    const friendArr = [...directFriends].filter((id) => limitedIds.has(id));
    const fofArr = [...secondDegree].filter((id) => limitedIds.has(id));

    const nodes: Node[] = [];
    nodes.push({
      id: profile.id,
      position: { x: cx, y: cy },
      data: {
        label: (
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold border-2 border-white shadow-md">
              You
            </div>
          </div>
        ),
      },
      style: { background: 'transparent', border: 'none' },
    });

    friendArr.forEach((id, i) => {
      const angle = (i / Math.max(friendArr.length, 1)) * 2 * Math.PI;
      const r = 180;
      nodes.push({
        id,
        position: { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) },
        data: {
          label: (
            <NodeLabel profile={profiles.find((p) => p.id === id)!} color="#239B73" />
          ),
        },
        style: { background: 'transparent', border: 'none' },
      });
    });

    fofArr.forEach((id, i) => {
      const angle = (i / Math.max(fofArr.length, 1)) * 2 * Math.PI;
      const r = 320;
      nodes.push({
        id,
        position: { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) },
        data: {
          label: (
            <NodeLabel profile={profiles.find((p) => p.id === id)!} color="#A99BF7" />
          ),
        },
        style: { background: 'transparent', border: 'none' },
      });
    });

    // Edges: only between visible nodes
    const edges: Edge[] = [];
    for (const id of limitedIds) {
      for (const neighbor of graph.getNeighbors(id)) {
        if (limitedIds.has(neighbor) && id < neighbor) {
          const isFriendEdge = directFriends.has(id) && directFriends.has(neighbor);
          edges.push({
            id: `${id}-${neighbor}`,
            source: id,
            target: neighbor,
            style: {
              stroke: isFriendEdge ? '#A99BF7' : '#D6DEF2',
              strokeWidth: isFriendEdge ? 2 : 1,
            },
          });
        }
      }
    }

    // Highlight selected node's neighbors
    if (selectedId) {
      edges.forEach((e) => {
        if (e.source === selectedId || e.target === selectedId) {
          e.style = { ...e.style, stroke: '#6257F5', strokeWidth: 3 };
        }
      });
    }

    return { nodes, edges };
  }, [graph, profile, profiles, selectedId, showSecondDegree, interestFilter, search, interestsByProfile]);

  const selectedProfile = selectedId ? profiles.find((p) => p.id === selectedId) : null;
  const selectedInterests = selectedId ? interestsByProfile.get(selectedId) ?? [] : [];
  const mutualCount = graph && profile && selectedId && selectedId !== profile.id
    ? graph.mutualFriends(profile.id, selectedId).length
    : 0;
  const distance = graph && profile && selectedId && selectedId !== profile.id
    ? graph.connectionDistance(profile.id, selectedId)
    : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Social Graph Explorer"
        subtitle="Visualize your network as a graph. Drag nodes, zoom, and click to inspect."
      />

      <div className="grid lg:grid-cols-4 gap-4 mb-4">
        <Card className="p-3 flex items-center gap-2">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            placeholder="Search by name..."
          />
        </Card>
        <select
          value={interestFilter}
          onChange={(e) => setInterestFilter(e.target.value)}
          className="input-field lg:col-span-1"
        >
          <option value="">All interests</option>
          {availableInterests.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <Button
          variant={showSecondDegree ? 'primary' : 'secondary'}
          onClick={() => setShowSecondDegree(!showSecondDegree)}
        >
          {showSecondDegree ? '2nd degree ON' : '2nd degree OFF'}
        </Button>
        <div className="flex items-center gap-3 text-xs">
          <Legend color="#6257F5" label="You" />
          <Legend color="#239B73" label="Friends" />
          <Legend color="#A99BF7" label="Friends-of-friends" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-0 overflow-hidden h-[500px]">
          {nodes.length === 0 ? (
            <EmptyState icon={<Share2 size={28} />} title="Your graph is getting started" description="Your real connections will appear here as you connect with other Bondly members." />
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesDraggable
              zoomOnScroll
              panOnDrag
            >
              <Background color="#EEEBFF" gap={20} />
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  if (n.id === profile?.id) return '#6257F5';
                  return '#A99BF7';
                }}
                maskColor="rgba(238, 235, 255, 0.5)"
              />
            </ReactFlow>
          )}
        </Card>

        {/* Detail panel */}
        <div>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-navy-700 mb-3">Node Details</h3>
            {!selectedProfile ? (
              <p className="text-sm text-muted">Click a node to see details.</p>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Avatar src={selectedProfile.avatar_url} name={selectedProfile.display_name} size="lg" />
                  <div>
                    <p className="font-semibold text-navy-900">{selectedProfile.display_name}</p>
                    <p className="text-xs text-muted">{selectedProfile.organization}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Connection status</span>
                    <span>
                      {selectedProfile.id === profile?.id ? 'You' :
                        graph?.isConnected(profile!.id, selectedProfile.id) ? 'Direct friend' :
                        distance === Infinity ? 'Not connected' : `${distance} hops away`}
                    </span>
                  </div>
                  {selectedProfile.id !== profile?.id && (
                    <div className="flex justify-between">
                      <span className="text-muted">Mutual friends</span>
                      <span className="font-medium">{mutualCount}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted">Graph degree</span>
                    <span className="font-medium">{graph?.getNeighbors(selectedProfile.id).size ?? 0}</span>
                  </div>
                </div>
                {selectedInterests.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted mb-1.5">Interests</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedInterests.map((i) => <Badge key={i.id} color="indigo">{i.name}</Badge>)}
                    </div>
                  </div>
                )}
                {selectedProfile.id !== profile?.id && (
                  <a href={`/app/profile/${selectedProfile.id}`} className="block mt-4">
                    <Button variant="secondary" size="sm" className="w-full">View full profile</Button>
                  </a>
                )}
              </div>
            )}
          </Card>

          <Card className="p-4 mt-3">
            <h3 className="text-sm font-semibold text-navy-700 mb-2">Graph Stats</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted">Visible nodes</span><span className="font-medium">{nodes.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">Visible edges</span><span className="font-medium">{edges.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">Your degree</span><span className="font-medium">{graph?.getNeighbors(profile?.id ?? '').size ?? 0}</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NodeLabel({ profile, color }: { profile: Profile; color: string }) {
  if (!profile) return null;
  return (
    <div className="flex flex-col items-center cursor-pointer">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow-md"
        style={{ backgroundColor: color }}
      >
        {profile.display_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
      </div>
      <span className="text-[10px] text-navy-700 mt-0.5 max-w-[80px] truncate">{profile.display_name.split(' ')[0]}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-navy-600">{label}</span>
    </div>
  );
}
