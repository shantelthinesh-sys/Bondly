import { useEffect, useState } from 'react';
import { Brain, Scale } from 'lucide-react';
import { Card, Spinner, EmptyState, PageHeader, Badge, ScoreRing } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useRecommendationEngine } from '../hooks/useRecommendationEngine';
import { supabase } from '../lib/supabase';
import { ExplainBreakdown } from '../components/RecommendationCard';
import type { ModelMetadata } from '../lib/types';

export function Insights() {
  const { profile } = useAuth();
  const { state, refresh } = useRecommendationEngine();
  const [modelMeta, setModelMeta] = useState<ModelMetadata | null>(null);
  const [selectedRec, setSelectedRec] = useState(0);

  useEffect(() => {
    if (profile) refresh(profile.id);
    loadModelMeta();
  }, [profile, refresh]);

  const loadModelMeta = async () => {
    const { data } = await supabase.from('model_metadata').select('*').eq('is_active', true).maybeSingle();
    if (data) setModelMeta(data as ModelMetadata);
  };

  if (state.loading || !profile) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  const recs = state.recommendations.slice(0, 10);
  const selected = recs[selectedRec];
  const ml = state.mlModel;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Recommendation Insights"
        subtitle="Inspect exactly how Bondly AI ranks candidates — full transparency, no black boxes."
      />

      {/* AI Model card */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
            <Brain size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-navy-900">Current Model</h2>
            <p className="text-xs text-muted">Logistic Regression · {ml?.trained ? 'Trained on synthetic data' : 'Not yet trained'}</p>
          </div>
          <div className="ml-auto">
            <Badge color={state.mode === 'hybrid' ? 'indigo' : state.mode === 'ml' ? 'success' : 'navy'}>
              {state.mode}
            </Badge>
          </div>
        </div>

        {ml?.trained && ml.metrics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Accuracy" value={`${(ml.metrics.accuracy * 100).toFixed(1)}%`} />
            <Metric label="Precision" value={`${(ml.metrics.precision * 100).toFixed(1)}%`} />
            <Metric label="Recall" value={`${(ml.metrics.recall * 100).toFixed(1)}%`} />
            <Metric label="F1 Score" value={ml.metrics.f1.toFixed(3)} />
            <Metric label="ROC-AUC" value={ml.metrics.roc_auc.toFixed(3)} />
            <Metric label="Train samples" value={ml.metrics.trainSamples.toString()} />
            <Metric label="Test samples" value={ml.metrics.testSamples.toString()} />
            <Metric label="Dataset" value="Synthetic" />
          </div>
        ) : (
          <div className="bg-navy-50 rounded-xl p-4 text-sm text-muted">
            The ML model trains on synthetic data once there are enough profiles. Currently running the rule-based baseline with documented weights.
          </div>
        )}

        {/* Feature importance */}
        {ml?.trained && (
          <div className="mt-4 pt-4 border-t border-navy-50">
            <h3 className="text-sm font-semibold text-navy-700 mb-2">Feature Importance (learned weights)</h3>
            <div className="space-y-1.5">
              {ml.featureImportance().map((f) => (
                <div key={f.feature} className="flex items-center gap-3">
                  <span className="text-xs text-navy-600 w-36 truncate">{f.feature.replace(/_/g, ' ')}</span>
                  <div className="flex-1 h-2 bg-navy-50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${f.weight >= 0 ? 'bg-indigo-400' : 'bg-error-300'}`}
                      style={{ width: `${Math.min(100, Math.abs(f.weight) * 50)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted w-12 text-right">{f.weight.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 p-3 bg-warning-50 rounded-xl text-xs text-warning-600">
          <strong>Important:</strong> {modelMeta?.limitations || 'The ML model is trained on synthetic labels generated from feature-based heuristics. It demonstrates the ML pipeline — not real friendship outcomes. The compatibility score is an estimate, not a probability that a friendship will succeed.'}
        </div>
      </Card>

      {/* Recommendation comparison */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* List */}
        <div>
          <h2 className="text-lg font-semibold text-navy-900 mb-3">Top Recommendations — Detailed</h2>
          {recs.length === 0 ? (
            <Card><EmptyState icon={<Brain size={28} />} title="No recommendations to inspect" /></Card>
          ) : (
            <div className="space-y-2">
              {recs.map((rec, i) => (
                <button
                  key={rec.candidate_id}
                  onClick={() => setSelectedRec(i)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    i === selectedRec ? 'border-indigo-300 bg-indigo-50/50' : 'border-navy-50 bg-white hover:border-navy-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ScoreRing score={rec.score} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-900 truncate">{rec.candidate.display_name}</p>
                      <p className="text-xs text-muted">Rule: {rec.rule_score} · ML: {rec.ml_probability ?? '—'} · Hybrid: {rec.hybrid_score}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div>
          <h2 className="text-lg font-semibold text-navy-900 mb-3">Score Breakdown</h2>
          {selected ? (
            <Card className="p-5">
              <ExplainBreakdown rec={selected} />
            </Card>
          ) : (
            <Card><EmptyState title="Select a recommendation" /></Card>
          )}
        </div>
      </div>

      {/* Rule vs ML vs Hybrid comparison */}
      {selected && (
        <Card className="p-5 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Scale size={18} className="text-indigo-500" />
            <h2 className="font-semibold text-navy-900">Score Comparison: Rule-Based vs ML vs Hybrid</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <ScoreCompare label="Rule-Based" value={selected.rule_score} color="#14213D" />
            <ScoreCompare label="ML Probability" value={selected.ml_probability ?? 0} color="#239B73" />
            <ScoreCompare label="Hybrid Score" value={selected.hybrid_score} color="#6257F5" />
          </div>
          <p className="mt-4 text-xs text-muted">
            Hybrid score = {Math.round(state.config.hybrid_blend * 100)}% rule-based + {Math.round((1 - state.config.hybrid_blend) * 100)}% ML probability, then renormalized to 0–100.
          </p>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-navy-50/50 rounded-xl p-3 text-center">
      <p className="text-lg font-bold text-navy-900">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function ScoreCompare({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center">
        <svg width="80" height="80" className="-rotate-90">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#EEEBFF" strokeWidth="5" />
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={2 * Math.PI * 34}
            strokeDashoffset={2 * Math.PI * 34 - (value / 100) * 2 * Math.PI * 34}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute font-bold text-navy-900 text-lg">{value}</span>
      </div>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}
