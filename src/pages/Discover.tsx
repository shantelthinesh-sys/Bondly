import { useEffect, useState } from 'react';
import { Search, Users, SlidersHorizontal } from 'lucide-react';
import { Card, Spinner, EmptyState, PageHeader, Badge } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useRecommendationEngine } from '../hooks/useRecommendationEngine';
import { RecommendationCard } from '../components/RecommendationCard';

type SortMode = 'recommended' | 'mutual' | 'interests' | 'alphabetical';
type FilterMode = 'all' | 'highest' | 'most_mutual' | 'shared_interests' | 'closest';

export function Discover() {
  const { profile } = useAuth();
  const { state, refresh } = useRecommendationEngine();
  const [sort, setSort] = useState<SortMode>('recommended');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (profile) refresh(profile.id);
  }, [profile, refresh]);

  if (state.loading || !profile) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  let recs = [...state.recommendations];

  // Filter
  if (filter === 'highest') recs = recs.filter((r) => r.score >= 50);
  if (filter === 'most_mutual') recs = recs.filter((r) => r.mutual_friend_count > 0);
  if (filter === 'shared_interests') recs = recs.filter((r) => r.shared_interests.length > 0);
  if (filter === 'closest') recs = recs.filter((r) => r.connection_distance > 0 && r.connection_distance <= 3);

  // Search
  if (query) {
    const q = query.toLowerCase();
    recs = recs.filter(
      (r) =>
        r.candidate.display_name.toLowerCase().includes(q) ||
        r.candidate.bio.toLowerCase().includes(q) ||
        r.shared_interests.some((i) => i.name.toLowerCase().includes(q)),
    );
  }

  // Sort
  if (sort === 'mutual') recs.sort((a, b) => b.mutual_friend_count - a.mutual_friend_count);
  else if (sort === 'interests') recs.sort((a, b) => b.shared_interests.length - a.shared_interests.length);
  else if (sort === 'alphabetical') recs.sort((a, b) => a.candidate.display_name.localeCompare(b.candidate.display_name));
  else recs.sort((a, b) => b.score - a.score);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Discover People" subtitle="Explore potential connections recommended by Bondly AI." />

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-field pl-9"
              placeholder="Search by name, bio, or interest..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterMode)}
              className="input-field w-auto py-2"
            >
              <option value="all">All candidates</option>
              <option value="highest">Highest compatibility</option>
              <option value="most_mutual">Most mutual friends</option>
              <option value="shared_interests">Shared interests</option>
              <option value="closest">Closest connection</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="input-field w-auto py-2"
            >
              <option value="recommended">Recommended</option>
              <option value="mutual">Mutual friends</option>
              <option value="interests">Shared interests</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Mode indicator */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <SlidersHorizontal size={14} className="text-muted" />
        <span className="text-muted">Recommendation mode:</span>
        <Badge color={state.mode === 'hybrid' ? 'indigo' : state.mode === 'ml' ? 'success' : 'navy'}>
          {state.mode === 'hybrid' ? 'Hybrid (Rule + ML)' : state.mode === 'ml' ? 'ML Model' : 'Rule-Based Baseline'}
        </Badge>
        {state.mlTrained && (
          <span className="text-xs text-muted">· ML model active</span>
        )}
      </div>

      {/* Results */}
      {recs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={32} />}
            title="No people found"
            description={query ? "Try a different search or filter." : "Load demo data to see recommended connections."}
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recs.map((rec) => (
            <RecommendationCard key={rec.candidate_id} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
