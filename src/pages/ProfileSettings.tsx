import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Card, PageHeader } from '../components/ui';
import { useAuth } from '../context/useAuth';

export function ProfileSettings() {
  const { profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [education, setEducation] = useState('');
  const [organization, setOrganization] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setHeadline(profile.headline);
    setBio(profile.bio);
    setEducation(profile.education);
    setOrganization(profile.organization);
    setLocationCity(profile.location_city);
  }, [profile]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateProfile({
        display_name: displayName.trim(),
        headline: headline.trim(),
        bio: bio.trim(),
        education: education.trim(),
        organization: organization.trim(),
        location_city: locationCity.trim(),
      });
      if (result.error) setError(result.error);
      else setMessage('Your profile has been saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Profile Settings" subtitle="Keep your profile information up to date." />
      <Card className="p-6 max-w-2xl">
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-medium text-navy-700">
            Display name
            <input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="input-field mt-1" />
          </label>
          <label className="block text-sm font-medium text-navy-700">
            Headline
            <input maxLength={120} value={headline} onChange={(event) => setHeadline(event.target.value)} className="input-field mt-1" />
          </label>
          <label className="block text-sm font-medium text-navy-700">
            Biography
            <textarea maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} className="input-field mt-1 min-h-28 resize-y" />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-navy-700">
              Education
              <input value={education} onChange={(event) => setEducation(event.target.value)} className="input-field mt-1" />
            </label>
            <label className="block text-sm font-medium text-navy-700">
              Organization
              <input value={organization} onChange={(event) => setOrganization(event.target.value)} className="input-field mt-1" />
            </label>
          </div>
          <label className="block text-sm font-medium text-navy-700">
            City
            <input value={locationCity} onChange={(event) => setLocationCity(event.target.value)} className="input-field mt-1" />
          </label>
          {error && <p role="alert" className="flex items-center gap-2 text-sm text-error-400"><AlertCircle size={16} />{error}</p>}
          {message && <p role="status" className="flex items-center gap-2 text-sm text-success-400"><CheckCircle2 size={16} />{message}</p>}
          <Button type="submit" disabled={saving || !displayName.trim()}>{saving ? 'Saving...' : 'Save changes'}</Button>
        </form>
      </Card>
    </div>
  );
}
