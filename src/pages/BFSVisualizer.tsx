import { useEffect, useState, useRef } from 'react';
import { Play, Pause, SkipForward, RotateCcw, Code, Info } from 'lucide-react';
import { Card, Button, Spinner, PageHeader, Badge } from '../components/ui';
import { loadNetwork } from '../lib/data';
import { SocialGraph } from '../lib/graph';
import { useAuth } from '../context/useAuth';
import type { Profile, BFSResult } from '../lib/types';

export function BFSVisualizer() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<SocialGraph | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [startId, setStartId] = useState('');
  const [maxDepth, setMaxDepth] = useState(3);
  const [result, setResult] = useState<BFSResult | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const network = await loadNetwork(profile?.id);
      const g = new SocialGraph();
      for (const p of network.profiles) g.addNode({ id: p.id, label: p.display_name, interests: [], skills: [] });
      for (const c of network.connections) g.addEdge(c.user_a, c.user_b);
      setGraph(g);
      setProfiles(network.profiles);
      setProfileMap(new Map(network.profiles.map((p) => [p.id, p])));
      if (profile) setStartId(profile.id);
      setLoading(false);
    })();
  }, [profile]);

  const runBFS = () => {
    if (!graph || !startId) return;
    const res = graph.bfsWithSteps(startId, maxDepth);
    setResult(res);
    setStepIdx(0);
    setPlaying(true);
  };

  // Animation loop
  useEffect(() => {
    if (playing && result && stepIdx < result.steps.length - 1) {
      intervalRef.current = window.setTimeout(() => {
        setStepIdx((i) => i + 1);
      }, speed);
      return () => {
        if (intervalRef.current) clearTimeout(intervalRef.current);
      };
    } else if (result && stepIdx >= result.steps.length - 1) {
      setPlaying(false);
    }
  }, [playing, result, stepIdx, speed]);

  const reset = () => {
    setResult(null);
    setStepIdx(0);
    setPlaying(false);
  };

  const labelOf = (id: string) => {
    if (id === profile?.id) return 'You';
    return profileMap.get(id)?.display_name ?? id.slice(0, 8);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  const currentStep = result?.steps[stepIdx];
  const visitedSet = new Set(currentStep?.visited ?? []);
  const queue = currentStep?.queue ?? [];
  const currentNode = currentStep?.currentNode;
  const levels = currentStep?.levels ?? {};

  // Color for nodes
  const nodeColor = (id: string) => {
    if (id === currentNode) return '#6257F5';
    if (visitedSet.has(id)) return '#239B73';
    return '#D6DEF2';
  };

  // Build node positions (radial)
  const visibleIds = result ? Array.from(Object.keys(result.levels)) : profiles.slice(0, 30).map((p) => p.id);
  const cx = 300, cy = 250;
  const maxLevel = Math.max(0, ...(Object.values(levels).map(Number)));
  const nodePos = new Map<string, { x: number; y: number }>();
  const byLevel = new Map<number, string[]>();
  for (const [id, lvl] of Object.entries(levels)) {
    const arr = byLevel.get(lvl) ?? [];
    arr.push(id);
    byLevel.set(lvl, arr);
  }
  if (result) {
    for (const [lvl, ids] of byLevel) {
      const r = (lvl / Math.max(maxLevel, 1)) * 200;
      ids.forEach((id, i) => {
        const angle = (i / Math.max(ids.length, 1)) * 2 * Math.PI + (lvl * 0.3);
        nodePos.set(id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      });
    }
  } else {
    visibleIds.forEach((id, i) => {
      const angle = (i / Math.max(visibleIds.length, 1)) * 2 * Math.PI;
      nodePos.set(id, { x: cx + 150 * Math.cos(angle), y: cy + 150 * Math.sin(angle) });
    });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="BFS Search Visualizer" subtitle="Watch Breadth-First Search explore the graph one step at a time." />

      {/* Controls */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-navy-700">Starting user</label>
            <select value={startId} onChange={(e) => setStartId(e.target.value)} className="input-field mt-1 w-auto">
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.id === profile?.id ? ' (You)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-700">Max depth</label>
            <select value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value))} className="input-field mt-1 w-auto">
              {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <Button onClick={runBFS}><Play size={14} /> Run BFS</Button>
          {result && (
            <>
              <Button variant="secondary" onClick={() => setPlaying(!playing)}>
                {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="secondary" onClick={() => setStepIdx(Math.min(stepIdx + 1, result.steps.length - 1))}>
                <SkipForward size={14} /> Step
              </Button>
              <Button variant="ghost" onClick={reset}><RotateCcw size={14} /> Reset</Button>
            </>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-muted">Speed</label>
            <input
              type="range" min="200" max="2000" step="100" value={2200 - speed}
              onChange={(e) => setSpeed(2200 - Number(e.target.value))}
              className="w-24"
            />
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Graph visualization */}
        <Card className="lg:col-span-2 p-0 overflow-hidden h-[400px]">
          <svg viewBox="0 0 600 500" className="w-full h-full">
            {/* Edges */}
            {graph && visibleIds.map((id) => {
              const pos = nodePos.get(id);
              if (!pos) return null;
              return Array.from(graph.getNeighbors(id)).map((neighbor) => {
                if (!visibleIds.includes(neighbor) || id >= neighbor) return null;
                const npos = nodePos.get(neighbor);
                if (!npos) return null;
                return <line key={`${id}-${neighbor}`} x1={pos.x} y1={pos.y} x2={npos.x} y2={npos.y} stroke="#D6DEF2" strokeWidth="1" />;
              });
            })}
            {/* Nodes */}
            {visibleIds.map((id) => {
              const pos = nodePos.get(id);
              if (!pos) return null;
              const color = nodeColor(id);
              const lvl = levels[id];
              return (
                <g key={id} onClick={() => setStartId(id)} style={{ cursor: 'pointer' }}>
                  <circle cx={pos.x} cy={pos.y} r={id === startId ? 18 : 14} fill={color} stroke="white" strokeWidth="2" />
                  <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill="white" fontSize="9" fontWeight="600">
                    {labelOf(id).slice(0, 2)}
                  </text>
                  {lvl !== undefined && (
                    <text x={pos.x} y={pos.y - 22} textAnchor="middle" fill="#6257F5" fontSize="10" fontWeight="600">
                      L{lvl}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </Card>

        {/* Execution log & queue */}
        <div className="space-y-3">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-navy-700 mb-2">Queue</h3>
            {queue.length === 0 ? (
              <p className="text-xs text-muted">Empty</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {queue.map((id, i) => (
                  <Badge key={`${id}-${i}`} color="indigo">{labelOf(id)}</Badge>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-navy-700 mb-2">Visited ({visitedSet.size})</h3>
            <div className="flex flex-wrap gap-1">
              {[...visitedSet].map((id) => (
                <Badge key={id} color="success">{labelOf(id)}</Badge>
              ))}
            </div>
          </Card>

          {currentStep && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-navy-700">Execution Log</h3>
                <Badge color="navy">Step {stepIdx + 1}/{result?.steps.length}</Badge>
              </div>
              <p className="text-xs text-navy-600 bg-navy-50 rounded-lg p-2.5">{currentStep.description}</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-muted">Action:</span>
                <Badge color={currentStep.action === 'complete' ? 'success' : 'indigo'}>{currentStep.action}</Badge>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Code & explanation */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Code size={18} className="text-indigo-500" />
            <h3 className="font-semibold text-navy-900">BFS Implementation</h3>
          </div>
          <pre className="text-xs bg-navy-900 text-navy-100 rounded-xl p-4 overflow-x-auto font-mono leading-relaxed">{`def bfs(graph, start, max_depth):
    queue = [start]
    visited = {start}
    levels = {start: 0}
    while queue:
        current = queue.pop(0)
        if levels[current] >= max_depth:
            continue
        for neighbor in graph[current]:
            if neighbor not in visited:
                visited.add(neighbor)
                levels[neighbor] = levels[current] + 1
                queue.append(neighbor)
    return visited, levels`}</pre>
          <div className="mt-3 space-y-1 text-xs text-muted">
            <p><strong className="text-navy-700">Time:</strong> O(V + E) — visits each node and edge once.</p>
            <p><strong className="text-navy-700">Space:</strong> O(V) — queue and visited set.</p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info size={18} className="text-indigo-500" />
            <h3 className="font-semibold text-navy-900">Why BFS?</h3>
          </div>
          <div className="space-y-3 text-sm text-navy-600">
            <p><strong className="text-navy-700">FIFO queue:</strong> BFS uses a First-In-First-Out queue so nodes are explored in the order they're discovered — guaranteeing level-by-level traversal.</p>
            <p><strong className="text-navy-700">Visited set:</strong> Prevents revisiting nodes and infinite loops. Without it, cycles would cause the search to never terminate.</p>
            <p><strong className="text-navy-700">Distance discovery:</strong> In an unweighted graph, BFS finds the shortest path (fewest edges) because it explores all nodes at distance <em>d</em> before any at distance <em>d+1</em>.</p>
            <p><strong className="text-navy-700">Friend recommendations:</strong> BFS discovers friends-of-friends in order of proximity — closer connections (fewer hops) are typically stronger recommendations.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
