import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Card, PageHeader } from '../components/ui';
import { useAuth } from '../context/useAuth';
import type { ProfileVisibility } from '../lib/types';

const VISIBILITY_OPTIONS: { key: keyof ProfileVisibility; label: string }[] = [
  { key: 'education', label: 'Education' },
  { key: 'skills', label: 'Skills' },
  { key: 'interests', label: 'Interests' },
  { key: 'location', label: 'City' },
  { key: 'connections', label: 'Connection count' },
];

export function PrivacySettings() {
  const { profile, updateProfile } = useAuth();
  const [visibility, setVisibility] = useState<ProfileVisibility>({
    education: true, skills: true, interests: true, location: true, connections: true,
  });
  const [discoveryEnabled, setDiscoveryEnabled] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setVisibility(profile.visibility);
    setDiscoveryEnabled(profile.discovery_enabled);
  }, [profile]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateProfile({ visibility, discovery_enabled: discoveryEnabled });
      if (result.error) setError(result.error);
      else setMessage('Your privacy preferences have been saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save privacy preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Privacy Settings" subtitle="Choose what other members can see and whether you appear in discovery." />
      <Card className="p-6 max-w-2xl">
        <div className="space-y-4">
          {VISIBILITY_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-4 text-sm text-navy-700">
              <span>Show {label.toLowerCase()} on your profile</span>
              <input
                type="checkbox"
                checked={visibility[key]}
                onChange={(event) => setVisibility((current) => ({ ...current, [key]: event.target.checked }))}
                className="h-4 w-4 accent-indigo-500"
              />
            </label>
          ))}
          <hr className="border-navy-50" />
          <label className="flex items-center justify-between gap-4 text-sm text-navy-700">
            <span>Allow people to find me in discovery and recommendations</span>
            <input
              type="checkbox"
              checked={discoveryEnabled}
              onChange={(event) => setDiscoveryEnabled(event.target.checked)}
              className="h-4 w-4 accent-indigo-500"
            />
          </label>
          {error && <p role="alert" className="flex items-center gap-2 text-sm text-error-400"><AlertCircle size={16} />{error}</p>}
          {message && <p role="status" className="flex items-center gap-2 text-sm text-success-400"><CheckCircle2 size={16} />{message}</p>}
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save preferences'}</Button>
        </div>
      </Card>
    </div>
  );
}
