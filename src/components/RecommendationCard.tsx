import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Bookmark, X, Check, Info, Sparkles, ThumbsUp } from 'lucide-react';
import { Card, Avatar, ScoreRing, Button, Toast, Modal } from './ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import type { Recommendation, FeedbackType } from '../lib/types';

export function RecommendationCard({ rec, compact = false }: { rec: Recommendation; compact?: boolean }) {
  const { profile } = useAuth();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requested, setRequested] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackType | null>(rec.feedback);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const sendRequest = async () => {
    if (!profile) return;
    // Cancel any existing pending request first (idempotent)
    await supabase
      .from('connection_requests')
      .delete()
      .eq('sender_id', profile.id)
      .eq('receiver_id', rec.candidate_id)
      .eq('status', 'pending');
    const { error } = await supabase.from('connection_requests').insert({
      sender_id: profile.id,
      receiver_id: rec.candidate_id,
      status: 'pending',
      message: `Hi ${rec.candidate.display_name}, I'd love to connect!`,
    });
    if (error) {
      showToast('Could not send request: ' + error.message, 'error');
    } else {
      setRequested(true);
      // Log event
      await supabase.from('recommendation_events').insert({
        viewer_id: profile.id,
        candidate_id: rec.candidate_id,
        event_type: 'request_sent',
        score: rec.score,
      });
      showToast('Connection request sent!', 'success');
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    if (saved) {
      await supabase.from('saved_profiles').delete().eq('user_id', profile.id).eq('saved_profile_id', rec.candidate_id);
      setSaved(false);
      showToast('Removed from saved', 'info');
    } else {
      await supabase.from('saved_profiles').insert({ user_id: profile.id, saved_profile_id: rec.candidate_id });
      setSaved(true);
      showToast('Profile saved', 'success');
    }
  };

  const submitFeedback = async (type: FeedbackType) => {
    if (!profile) return;
    setFeedback(type);
    await supabase.from('recommendation_feedback').upsert(
      { user_id: profile.id, candidate_id: rec.candidate_id, feedback_type: type },
      { onConflict: 'user_id,candidate_id' },
    );
    await supabase.from('recommendation_events').insert({
      viewer_id: profile.id,
      candidate_id: rec.candidate_id,
      event_type: 'feedback',
      score: rec.score,
    });
    showToast(type === 'interested' ? 'Marked as interested' : 'Got it — we\'ll adjust', 'info');
  };

  const c = rec.candidate;

  return (
    <>
      <Card className={`p-4 hover:shadow-elevated transition-all ${compact ? '' : 'hover:-translate-y-0.5'}`}>
        <div className="flex items-start gap-3">
          <Link to={`/app/profile/${c.id}`}>
            <Avatar src={c.avatar_url} name={c.display_name} size={compact ? 'md' : 'lg'} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/app/profile/${c.id}`}>
                  <h3 className="font-semibold text-navy-900 text-sm truncate hover:text-indigo-600 transition-colors">
                    {c.display_name}
                  </h3>
                </Link>
                <p className="text-xs text-muted truncate">
                  {c.headline || (c.visibility.organization && c.organization) || ''}
                </p>
              </div>
              <ScoreRing score={rec.score} size={48} />
            </div>

            {!compact && c.bio && (
              <p className="text-xs text-navy-600 mt-2 line-clamp-2">{c.bio}</p>
            )}

            {/* Shared interests */}
            {rec.shared_interests.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {rec.shared_interests.slice(0, compact ? 2 : 4).map((i) => (
                  <span key={i.id} className="badge-indigo text-[10px]">{i.name}</span>
                ))}
              </div>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted">
              <span className="flex items-center gap-1"><UserPlus size={12} /> {rec.mutual_friend_count} mutual</span>
              <span className="flex items-center gap-1"><Sparkles size={12} /> {rec.connection_distance === -1 ? 'far' : `${rec.connection_distance} hop${rec.connection_distance === 1 ? '' : 's'}`}</span>
            </div>

            {/* Explanation */}
            {!compact && (
              <p className="text-xs text-navy-600 bg-navy-50/50 rounded-lg p-2 mt-2.5 line-clamp-2">
                {rec.explanation}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {requested ? (
                <span className="badge-success text-[10px]"><Check size={10} /> Request sent</span>
              ) : (
                <Button size="sm" className="text-xs px-2.5 py-1.5" onClick={sendRequest}>
                  <UserPlus size={12} /> Connect
                </Button>
              )}
              <Button variant="secondary" size="sm" className="text-xs px-2.5 py-1.5" onClick={saveProfile}>
                <Bookmark size={12} /> {saved ? 'Saved' : 'Save'}
              </Button>
              {!compact && (
                <Button variant="ghost" size="sm" className="text-xs px-2.5 py-1.5" onClick={() => setShowExplain(true)}>
                  <Info size={12} /> Why?
                </Button>
              )}
              {!compact && !feedback && (
                <div className="flex gap-0.5">
                  <button
                    onClick={() => submitFeedback('interested')}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-success-400 hover:bg-success-50 transition-colors"
                    title="Interested"
                  >
                    <ThumbsUp size={14} />
                  </button>
                  <button
                    onClick={() => submitFeedback('not_interested')}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-navy-50 transition-colors"
                    title="Not interested"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {feedback && (
                <span className="badge-muted text-[10px]">{feedback.replace('_', ' ')}</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {showExplain && (
        <Modal open={showExplain} onClose={() => setShowExplain(false)} title="Why was this recommended?">
          <ExplainBreakdown rec={rec} />
        </Modal>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </>
  );
}

export function ExplainBreakdown({ rec }: { rec: Recommendation }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-navy-50">
        <ScoreRing score={rec.score} size={56} />
        <div>
          <p className="font-semibold text-navy-900">{rec.candidate.display_name}</p>
          <p className="text-xs text-muted">Estimated profile compatibility</p>
        </div>
      </div>

      <p className="text-sm text-navy-600 bg-indigo-50 rounded-xl p-3">{rec.explanation}</p>

      <div>
        <h4 className="text-sm font-semibold text-navy-700 mb-2">Score breakdown</h4>
        <div className="space-y-2">
          {rec.contributions.map((c) => (
            <div key={c.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-navy-700">{c.label}</span>
                <span className="text-muted">
                  {Math.round(c.contribution * 100)}% · {c.level}
                </span>
              </div>
              <div className="w-full h-1.5 bg-navy-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400 rounded-full transition-all"
                  style={{ width: `${Math.min(100, c.normalized * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {rec.triggered_rules.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-navy-700 mb-2">Rules triggered</h4>
          <div className="flex flex-wrap gap-1.5">
            {rec.triggered_rules.map((r) => (
              <span key={r} className="badge-navy text-[10px]">{r}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted pt-2 border-t border-navy-50">
        This score is an estimate of profile overlap and network proximity, not a prediction that a friendship will succeed.
      </p>
    </div>
  );
}
