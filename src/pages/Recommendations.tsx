import { useEffect, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { Card, Spinner, EmptyState, PageHeader, Button } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useRecommendationEngine } from '../hooks/useRecommendationEngine';
import { RecommendationCard } from '../components/RecommendationCard';
import { supabase } from '../lib/supabase';

export function Recommendations() {
  const { profile } = useAuth();
  const { state, refresh } = useRecommendationEngine();
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) void refresh(profile.id);
  }, [profile, refresh]);

  const resetFeedback = async () => {
    if (!profile) return;
    setFeedbackError(null);
    const { error } = await supabase
      .from('recommendation_feedback')
      .delete()
      .eq('user_id', profile.id);
    if (error) {
      setFeedbackError(`Could not reset recommendation feedback: ${error.message}`);
      return;
    }
    await refresh(profile.id);
  };

  if (state.loading || !profile) {
    return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;
  }

  const ownInterestCount = state.interestsByProfile.get(profile.id)?.length ?? 0;
  const otherMemberCount = state.profiles.filter((member) => member.id !== profile.id).length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Interest-based recommendations"
        subtitle="Discover real Bondly members through interests they have chosen to share."
        action={
          <Button variant="ghost" size="sm" onClick={resetFeedback}>
            <RotateCcw size={14} /> Reset feedback
          </Button>
        }
      />

      {(state.error || feedbackError) && (
        <p role="alert" className="mb-4 text-sm text-error-400">{state.error ?? feedbackError}</p>
      )}

      <p className="mb-4 text-xs text-muted">
        Compatibility is an estimate based on shared profile information, not a prediction of friendship.
      </p>

      {state.recommendations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={32} />}
            title="No recommendations available"
            description={
              ownInterestCount === 0
                ? 'Add interests to your profile so Bondly can look for real members with similar interests.'
                : otherMemberCount === 0
                  ? 'Bondly is waiting for more members to join and share their interests.'
                  : 'No discoverable members currently share your interests. Check back as the community grows.'
            }
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.recommendations.map((rec) => (
            <RecommendationCard key={rec.candidate_id} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
