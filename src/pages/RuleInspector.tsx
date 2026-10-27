import { useEffect } from 'react';
import { AlertCircle, ScrollText } from 'lucide-react';
import { Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useRecommendationEngine } from '../hooks/useRecommendationEngine';

export function RuleInspector() {
  const { profile } = useAuth();
  const { state, refresh } = useRecommendationEngine();

  useEffect(() => {
    if (profile) void refresh(profile.id);
  }, [profile, refresh]);

  if (state.loading || !profile) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Recommendation Rule Inspector" subtitle="See which explainable recommendation signals apply to each suggested connection." />
      {state.error && <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-error-400"><AlertCircle size={16} />{state.error}</p>}
      {state.recommendations.length === 0 ? (
        <Card><EmptyState icon={<ScrollText size={28} />} title="No recommendations to inspect" description="Once the network has discoverable profiles, their rule explanations will appear here." /></Card>
      ) : (
        <div className="space-y-4">
          {state.recommendations.slice(0, 20).map((recommendation) => (
            <Card key={recommendation.candidate_id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-navy-900">{recommendation.candidate.display_name}</h2>
                  <p className="text-sm text-muted mt-1">{recommendation.explanation}</p>
                </div>
                <span className="badge-indigo">{Math.round(recommendation.score)} compatibility</span>
              </div>
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recommendation.contributions.map((contribution) => (
                  <div key={contribution.label} className="rounded-lg bg-navy-50 p-3">
                    <p className="text-sm font-medium text-navy-800">{contribution.label}</p>
                    <p className="text-xs text-muted mt-1">
                      {contribution.level} signal · {Math.round(contribution.contribution * 100)} weighted points
                    </p>
                  </div>
                ))}
              </div>
              {recommendation.triggered_rules.length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Rules: {recommendation.triggered_rules.join(', ')}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
