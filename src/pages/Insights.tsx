import { useEffect, useState } from 'react';
import { Brain, Info } from 'lucide-react';
import { Card, Spinner, EmptyState, PageHeader, ScoreRing } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useRecommendationEngine } from '../hooks/useRecommendationEngine';
import { ExplainBreakdown } from '../components/RecommendationCard';

export function Insights() {
  const { profile } = useAuth();
  const { state, refresh } = useRecommendationEngine();
  const [selectedRec, setSelectedRec] = useState(0);

  useEffect(() => {
    if (profile) void refresh(profile.id);
  }, [profile, refresh]);

  if (state.loading || !profile) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  const recommendations = state.recommendations.slice(0, 10);
  const selected = recommendations[selectedRec];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Recommendation insights"
        subtitle="See the real profile signals behind each interest-based suggestion."
      />

      {state.error && <p role="alert" className="mb-4 text-sm text-error-400">{state.error}</p>}

      <Card className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <Brain size={20} className="mt-0.5 text-indigo-500" />
          <div>
            <h2 className="font-semibold text-navy-900">Transparent compatibility estimate</h2>
            <p className="mt-1 text-sm text-navy-600">
              Bondly uses a deterministic score, not a trained AI model. Shared interests are the primary signal.
              Available secondary signals include mutual connections, optional skills, network overlap, and your
              explicit recommendation feedback. Missing optional profile information is excluded and the remaining
              weights are renormalized.
            </p>
            <p className="mt-2 text-xs text-muted">
              Scores are not scientifically validated and do not predict whether a friendship will succeed.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
          <Weight label="Shared interests" value={state.config.weights.interest_similarity} />
          <Weight label="Mutual connections" value={state.config.weights.mutual_friends} />
          <Weight label="Other available signals" value={
            state.config.weights.skill_similarity +
            state.config.weights.jaccard +
            state.config.weights.proximity +
            state.config.weights.feedback
          } />
        </div>
      </Card>

      {recommendations.length === 0 ? (
        <Card><EmptyState icon={<Info size={28} />} title="No recommendation signals yet" description="As real members share interests, Bondly will show the evidence used for each recommendation here." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-navy-900">Recommendations</h2>
            <div className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <button
                  key={recommendation.candidate_id}
                  onClick={() => setSelectedRec(index)}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${
                    index === selectedRec ? 'border-indigo-300 bg-indigo-50/50' : 'border-navy-50 bg-white hover:border-navy-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ScoreRing score={recommendation.score} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900">{recommendation.candidate.display_name}</p>
                      <p className="text-xs text-muted">
                        {recommendation.shared_interests.length} shared interest{recommendation.shared_interests.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-navy-900">Evidence and score breakdown</h2>
            {selected ? <Card className="p-5"><ExplainBreakdown rec={selected} /></Card> : null}
          </section>
        </div>
      )}
    </div>
  );
}

function Weight({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-navy-50/50 p-3">
      <p className="text-lg font-bold text-navy-900">{Math.round(value * 100)}%</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
