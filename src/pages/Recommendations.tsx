import { useEffect, useState } from 'react';
import { Sparkles, SlidersHorizontal, RotateCcw, Info } from 'lucide-react';
import { Card, Spinner, EmptyState, PageHeader, Button, Badge } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useRecommendationEngine } from '../hooks/useRecommendationEngine';
import { RecommendationCard } from '../components/RecommendationCard';
import { supabase } from '../lib/supabase';
import type { RecommendationMode } from '../lib/types';

export function Recommendations() {
  const { profile } = useAuth();
  const { state, refresh, setMode } = useRecommendationEngine();
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    if (profile) refresh(profile.id);
  }, [profile, refresh]);

  const resetFeedback = async () => {
    if (!profile) return;
    await supabase.from('recommendation_feedback').delete().eq('user_id', profile.id);
    await refresh(profile.id);
  };

  if (state.loading || !profile) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="AI Recommendations"
        subtitle="Explainable friend recommendations powered by graph algorithms and machine learning."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowConfig(!showConfig)}>
              <SlidersHorizontal size={14} /> Settings
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFeedback}>
              <RotateCcw size={14} /> Reset feedback
            </Button>
          </div>
        }
      />

      {/* Mode selector */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-navy-800">Recommendation Engine Mode</p>
              <p className="text-xs text-muted">Switch between rule-based, ML, and hybrid modes.</p>
            </div>
          </div>
          <div className="flex gap-2">
            {(['rule_based', 'ml', 'hybrid'] as RecommendationMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={m !== 'rule_based' && !state.mlTrained}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  state.mode === m ? 'bg-indigo-500 text-white shadow-sm' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                }`}
              >
                {m === 'rule_based' ? 'Rule-Based' : m === 'ml' ? 'ML Model' : 'Hybrid'}
              </button>
            ))}
          </div>
        </div>
        {!state.mlTrained && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted bg-navy-50 rounded-lg p-2.5">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            The ML model trains on synthetic data once enough profiles exist in the network. Currently running in rule-based mode.
          </div>
        )}
      </Card>

      {/* Recommendations */}
      {state.recommendations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={32} />}
            title="No recommendations available"
            description="Add interests to your profile or load the demo network to generate recommendations."
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 text-sm">
            <Badge color={state.mode === 'hybrid' ? 'indigo' : state.mode === 'ml' ? 'success' : 'navy'}>
              {state.mode === 'hybrid' ? 'Hybrid mode active' : state.mode === 'ml' ? 'ML mode active' : 'Rule-based mode active'}
            </Badge>
            <span className="text-muted">· {state.recommendations.length} candidates</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.recommendations.map((rec) => (
              <RecommendationCard key={rec.candidate_id} rec={rec} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
