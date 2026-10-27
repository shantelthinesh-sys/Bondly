import { useEffect, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { Info } from 'lucide-react';
import { Card, Spinner, PageHeader, Badge } from '../components/ui';
import { loadNetwork } from '../lib/data';
import { SocialGraph } from '../lib/graph';
import { useAuth } from '../context/useAuth';
import { INTEREST_CATEGORIES } from '../lib/catalog';

const PIE_COLORS = ['#6257F5', '#239B73', '#14213D', '#E89914', '#C12F2F', '#4C65B8'];

export function Analytics() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    nodes: 0,
    edges: 0,
    avgDegree: 0,
    isolated: 0,
    secondDegree: 0,
    degreeDist: [] as { range: string; count: number }[],
    interestDist: [] as { name: string; value: number }[],
    degreeCentrality: [] as { name: string; value: number }[],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const network = await loadNetwork(profile?.id);
        const g = new SocialGraph();
        for (const p of network.profiles) g.addNode({ id: p.id, label: p.display_name, interests: [], skills: [] });
        for (const c of network.connections) g.addEdge(c.user_a, c.user_b);
        const nodes = g.nodeCount();
        const edges = g.edgeCount();
        const avgDegree = g.averageDegree();
        const isolated = g.isolatedNodes().length;

        const degreeCounts = new Map<number, number>();
        for (const id of g.allNodes()) {
          const degree = g.getNeighbors(id).size;
          degreeCounts.set(degree, (degreeCounts.get(degree) ?? 0) + 1);
        }
        const degreeDist = [...degreeCounts.entries()]
          .sort((a, b) => a[0] - b[0])
          .slice(0, 10)
          .map(([degree, count]) => ({ range: `${degree}`, count }));

        const interestByCategory = new Map<string, number>();
        for (const interests of network.interestsByProfile.values()) {
          for (const interest of interests) {
            interestByCategory.set(interest.category, (interestByCategory.get(interest.category) ?? 0) + 1);
          }
        }
        const interestDist = [...interestByCategory.entries()].map(([category, count]) => ({
          name: INTEREST_CATEGORIES.find((item) => item.value === category)?.label ?? category,
          value: count,
        }));

        const centrality = g.allNodes()
          .map((id) => ({
            name: network.profiles.find((person) => person.id === id)?.display_name ?? id.slice(0, 6),
            value: g.degreeCentrality(id),
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);

        const secondDegree = profile ? g.secondDegreeCount(profile.id) : 0;
        setStats({ nodes, edges, avgDegree, isolated, secondDegree, degreeDist, interestDist, degreeCentrality: centrality });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load network analytics.');
      } finally {
        setLoading(false);
      }
    })();
  }, [profile]);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Network Analytics" subtitle="Real graph metrics computed from the persistent database." />
      {error && <p role="alert" className="mb-4 text-sm text-error-400">{error}</p>}

      <div className="flex items-center gap-2 mb-4">
        <Badge color="success">Real data</Badge>
        <span className="text-xs text-muted">All metrics computed from the stored network graph.</span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Visible nodes" value={stats.nodes} />
        <Stat label="Friendship edges" value={stats.edges} />
        <Stat label="Avg degree" value={stats.avgDegree.toFixed(2)} />
        <Stat label="Isolated nodes" value={stats.isolated} />
        <Stat label="2nd-degree" value={stats.secondDegree} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Degree distribution */}
        <Card className="p-5">
          <h3 className="font-semibold text-navy-900 mb-4">Degree Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.degreeDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEEBFF" />
              <XAxis dataKey="range" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#6257F5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted mt-2">How many users have each number of friends (0 through 9+).</p>
        </Card>

        {/* Interest distribution */}
        <Card className="p-5">
          <h3 className="font-semibold text-navy-900 mb-4">Interest Category Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={stats.interestDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={{ fontSize: 11 }}>
                {stats.interestDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Degree centrality */}
        <Card className="p-5">
          <h3 className="font-semibold text-navy-900 mb-4">Degree Centrality (Top 10)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.degreeCentrality} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#EEEBFF" />
              <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip />
              <Bar dataKey="value" fill="#239B73" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted mt-2">Degree centrality = degree / (n-1). Higher means more connected.</p>
        </Card>

      </div>

      <Card className="p-5 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Info size={16} className="text-indigo-500" />
          <h3 className="font-semibold text-navy-900">Metric Definitions</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Def term="Nodes" desc="Users in the visible network graph." />
          <Def term="Edges" desc="Accepted friendships (undirected edges)." />
          <Def term="Average degree" desc="Mean number of friends per user." />
          <Def term="Isolated nodes" desc="Users with zero connections." />
          <Def term="2nd-degree connections" desc="Users exactly 2 friendship hops away from you." />
          <Def term="Degree centrality" desc="Normalized measure of how connected a node is." />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-2xl font-bold text-indigo-500">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </Card>
  );
}

function Def({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="bg-navy-50/50 rounded-xl p-3">
      <p className="font-medium text-navy-800 text-xs">{term}</p>
      <p className="text-xs text-muted mt-0.5">{desc}</p>
    </div>
  );
}
