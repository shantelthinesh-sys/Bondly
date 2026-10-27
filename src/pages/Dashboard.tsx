import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, UserPlus, UserCheck, Sparkles, Heart,
  ArrowRight, Network, Share2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, Avatar, Spinner, EmptyState, PageHeader, Button } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';
import { useRecommendationEngine } from '../hooks/useRecommendationEngine';
import type { Connection, Profile } from '../lib/types';
import { RecommendationCard } from '../components/RecommendationCard';

export function Dashboard() {
  const { profile } = useAuth();
  const { state, refresh } = useRecommendationEngine();
  const [incomingCount, setIncomingCount] = useState(0);
  const [outgoingCount, setOutgoingCount] = useState(0);
  const [connectionCount, setConnectionCount] = useState(0);
  const [recentConnections, setRecentConnections] = useState<Profile[]>([]);

  useEffect(() => {
    if (!profile) return;
    refresh(profile.id);
    loadStats(profile.id);
  }, [profile, refresh]);

  const loadStats = async (uid: string) => {
    const [connRes, inRes, outRes] = await Promise.all([
      supabase.from('connections').select('*').or(`user_a.eq.${uid},user_b.eq.${uid}`),
      supabase.from('connection_requests').select('*', { count: 'exact', head: true }).eq('receiver_id', uid).eq('status', 'pending'),
      supabase.from('connection_requests').select('*', { count: 'exact', head: true }).eq('sender_id', uid).eq('status', 'pending'),
    ]);
    setConnectionCount(connRes.data?.length ?? 0);
    setIncomingCount(inRes.count ?? 0);
    setOutgoingCount(outRes.count ?? 0);
    // Load recent connections' profiles
    const friendIds = ((connRes.data ?? []) as Connection[])
      .map((c) => (c.user_a === uid ? c.user_b : c.user_a))
      .slice(0, 5);
    if (friendIds.length > 0) {
      const { data: friendProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', friendIds)
        .eq('is_demo', false);
      setRecentConnections(friendProfiles ?? []);
    }
  };

  if (state.loading || !profile) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner className="w-10 h-10" />
      </div>
    );
  }

  const topRecs = state.recommendations.slice(0, 4);
  const secondDegree = state.graph?.secondDegreeCount(profile.id) ?? 0;
  const interestCount = state.interestsByProfile.get(profile.id)?.length ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`Welcome back, ${profile.display_name.split(' ')[0]}!`}
        subtitle="Here's what's happening in your network."
      />
      {state.error && <p role="alert" className="mb-4 text-sm text-error-400">{state.error}</p>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={UserCheck} label="Connections" value={connectionCount} color="indigo" />
        <StatCard icon={UserPlus} label="Incoming requests" value={incomingCount} color="success" />
        <StatCard icon={ArrowRight} label="Sent requests" value={outgoingCount} color="warning" />
        <StatCard icon={Sparkles} label="Recommended" value={state.recommendations.length} color="navy" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* People You May Know */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-navy-900">People You May Know</h2>
            <Link to="/app/recommendations" className="text-sm text-indigo-500 hover:text-indigo-600 font-medium">
              View all →
            </Link>
          </div>
          {topRecs.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users size={32} />}
                title="No recommendations yet"
                description={
                  interestCount === 0
                    ? 'Add interests to your profile to find real members who share them.'
                    : state.profiles.length <= 1
                      ? 'Bondly is waiting for more members to join and share their interests.'
                      : 'No discoverable members currently share your interests. Check back as the community grows.'
                }
              />
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {topRecs.map((rec) => (
                <RecommendationCard key={rec.candidate_id} rec={rec} compact />
              ))}
            </div>
          )}
        </div>

        {/* Network at a glance */}
        <div>
          <h2 className="text-lg font-semibold text-navy-900 mb-4">Your Network at a Glance</h2>
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network size={18} className="text-indigo-500" />
                <span className="text-sm text-navy-700">Network size</span>
              </div>
              <span className="font-bold text-navy-900">{connectionCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 size={18} className="text-success-400" />
                <span className="text-sm text-navy-700">2nd-degree connections</span>
              </div>
              <span className="font-bold text-navy-900">{secondDegree}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart size={18} className="text-error-300" />
                <span className="text-sm text-navy-700">Interest categories</span>
              </div>
              <span className="font-bold text-navy-900">{interestCount}</span>
            </div>
            <div className="pt-3 border-t border-navy-50">
              <Link to="/app/graph">
                <Button variant="secondary" className="w-full">
                  <Network size={16} /> View Graph
                </Button>
              </Link>
            </div>
          </Card>

          {/* Recent connections */}
          {recentConnections.length > 0 && (
            <Card className="p-5 mt-4">
              <h3 className="text-sm font-semibold text-navy-700 mb-3">Recent connections</h3>
              <div className="space-y-2">
                {recentConnections.map((c) => (
                  <Link key={c.id} to={`/app/profile/${c.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-navy-50 transition-colors">
                    <Avatar src={c.avatar_url} name={c.display_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-800 truncate">{c.display_name}</p>
                      <p className="text-xs text-muted truncate">{c.headline || (c.visibility.organization ? c.organization : '')}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Why these recommendations */}
      {topRecs.length > 0 && (
        <Card className="p-5 mt-6">
          <h2 className="text-lg font-semibold text-navy-900 mb-3">Why These Recommendations?</h2>
          <p className="text-sm text-muted mb-4">
            Bondly's transparent recommendation score prioritizes shared interests and only uses profile information members have chosen to share:
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topRecs[0].contributions.map((c) => (
              <div key={c.label} className="flex items-center justify-between p-3 bg-navy-50/50 rounded-xl">
                <span className="text-sm text-navy-700">{c.label}</span>
                <span className={`badge-${c.level === 'strong' ? 'success' : c.level === 'high' ? 'indigo' : c.level === 'moderate' ? 'warning' : 'muted'} capitalize`}>
                  {c.level}
                </span>
              </div>
            ))}
          </div>
          <Link to="/app/insights" className="inline-block mt-4">
            <Button variant="ghost" size="sm">
              Explore recommendation insights <ArrowRight size={14} />
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  color: 'indigo' | 'success' | 'warning' | 'navy';
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-500',
    success: 'bg-success-50 text-success-400',
    warning: 'bg-warning-50 text-warning-500',
    navy: 'bg-navy-50 text-navy-500',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-2xl font-bold text-navy-900">{value}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </div>
    </Card>
  );
}
