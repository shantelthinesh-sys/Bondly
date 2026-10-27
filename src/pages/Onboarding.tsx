import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Check, ArrowRight, ArrowLeft, Camera, MapPin, GraduationCap, Building, Heart, Wrench, Eye, CheckCircle2, Loader2 } from 'lucide-react';
import { Logo, Button, Avatar, Card } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';
import { INTEREST_CATALOG, SKILL_CATALOG, INTEREST_CATEGORIES, avatarFor } from '../lib/catalog';
import { ensureInterest, ensureSkill } from '../lib/data';
import { seedDemoData } from '../lib/seed';

export function Onboarding() {
  const { profile, session, refreshProfile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [education, setEducation] = useState(profile?.education ?? '');
  const [organization, setOrganization] = useState(profile?.organization ?? '');
  const [locationCity, setLocationCity] = useState(profile?.location_city ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState('');
  const [discoveryEnabled, setDiscoveryEnabled] = useState(true);
  const [appearInRecs, setAppearInRecs] = useState(true);
  const [seedingDemo, setSeedingDemo] = useState(false);

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setBio(profile.bio);
      setEducation(profile.education);
      setOrganization(profile.organization);
      setLocationCity(profile.location_city);
      setAvatarUrl(profile.avatar_url ?? '');
    }
  }, [profile]);

  if (!session) return <Navigate to="/signin" replace />;
  if (profile?.onboarding_completed) return <Navigate to="/app" replace />;

  const toggleInterest = (name: string) => {
    setSelectedInterests((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name],
    );
  };

  const addSkill = (name: string) => {
    if (!name.trim() || selectedSkills.includes(name.trim())) return;
    setSelectedSkills((prev) => [...prev, name.trim()]);
    setCustomSkill('');
  };

  const removeSkill = (name: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s !== name));
  };

  const handleSeedDemo = async () => {
    setSeedingDemo(true);
    setFormError(null);
    try {
      await seedDemoData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to load the demo network.');
    } finally {
      setSeedingDemo(false);
    }
  };

  const finish = async () => {
    if (!session) return;
    setLoading(true);
    setFormError(null);
    try {
      if (selectedInterests.length > 0) {
        const interestIds: string[] = [];
        for (const name of selectedInterests) {
          const seed = INTEREST_CATALOG.find((i) => i.name === name);
          const id = await ensureInterest(name, seed?.category ?? 'technology');
          if (id) interestIds.push(id);
        }
        if (interestIds.length > 0) {
          const { error } = await supabase.from('profile_interests').upsert(
            interestIds.map((id) => ({ profile_id: session.user.id, interest_id: id })),
            { onConflict: 'profile_id,interest_id' },
          );
          if (error) throw error;
        }
      }

      if (selectedSkills.length > 0) {
        const skillIds: string[] = [];
        for (const name of selectedSkills) {
          const id = await ensureSkill(name);
          if (id) skillIds.push(id);
        }
        if (skillIds.length > 0) {
          const { error } = await supabase.from('profile_skills').upsert(
            skillIds.map((id) => ({ profile_id: session.user.id, skill_id: id })),
            { onConflict: 'profile_id,skill_id' },
          );
          if (error) throw error;
        }
      }

      await seedDemoData();
      const { error } = await updateProfile({
        display_name: displayName.trim(),
        bio,
        education,
        organization,
        location_city: locationCity,
        avatar_url: avatarUrl || avatarFor(displayName),
        headline: bio.split('\n')[0].slice(0, 80),
        discovery_enabled: discoveryEnabled && appearInRecs,
        onboarding_completed: true,
        visibility: { education: true, skills: true, interests: true, location: true, connections: true },
      });
      if (error) throw new Error(error);

      await refreshProfile();
      navigate('/app');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to complete onboarding.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <span className="text-sm text-muted">Step {step} of {totalSteps}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-navy-100 rounded-full mb-8">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <Card className="p-6 sm:p-8">
          {formError && <p role="alert" className="mb-4 text-sm text-error-400">{formError}</p>}
          {step === 1 && (
            <Step1
              displayName={displayName} setDisplayName={setDisplayName}
              bio={bio} setBio={setBio}
              education={education} setEducation={setEducation}
              organization={organization} setOrganization={setOrganization}
              locationCity={locationCity} setLocationCity={setLocationCity}
              avatarUrl={avatarUrl} setAvatarUrl={(u: string) => setAvatarUrl(u || avatarFor(displayName || 'User'))}
            />
          )}
          {step === 2 && (
            <Step2 selected={selectedInterests} toggle={toggleInterest} />
          )}
          {step === 3 && (
            <Step3
              selected={selectedSkills}
              customSkill={customSkill}
              setCustomSkill={setCustomSkill}
              addSkill={addSkill}
              removeSkill={removeSkill}
            />
          )}
          {step === 4 && (
            <Step4
              discoveryEnabled={discoveryEnabled} setDiscoveryEnabled={setDiscoveryEnabled}
              appearInRecs={appearInRecs} setAppearInRecs={setAppearInRecs}
              selectedInterests={selectedInterests}
            />
          )}
          {step === 5 && (
            <Step5
              displayName={displayName}
              bio={bio}
              education={education}
              organization={organization}
              locationCity={locationCity}
              avatarUrl={avatarUrl}
              selectedInterests={selectedInterests}
              selectedSkills={selectedSkills}
              discoveryEnabled={discoveryEnabled}
              onSeedDemo={handleSeedDemo}
              seedingDemo={seedingDemo}
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-navy-50">
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} /> Back
              </Button>
            ) : (
              <span />
            )}
            {step < totalSteps ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !displayName.trim()}>
                Continue <ArrowRight size={16} />
              </Button>
            ) : (
              <Button onClick={finish} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                {loading ? 'Setting up...' : 'Finish'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

interface Step1Props {
  displayName: string;
  setDisplayName: (value: string) => void;
  bio: string;
  setBio: (value: string) => void;
  education: string;
  setEducation: (value: string) => void;
  organization: string;
  setOrganization: (value: string) => void;
  locationCity: string;
  setLocationCity: (value: string) => void;
  avatarUrl: string;
  setAvatarUrl: (value: string) => void;
}

function Step1(props: Step1Props) {
  const { avatarUrl, setAvatarUrl, displayName } = props;
  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-navy-900 mb-1">Let's set up your profile</h2>
      <p className="text-sm text-muted mb-6">This is how others will see you on Bondly.</p>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center">
          {avatarUrl && <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />}
        </div>
        <div>
          <Button variant="secondary" size="sm" onClick={() => setAvatarUrl(avatarFor(displayName || 'User'))}>
            <Camera size={14} /> Generate avatar
          </Button>
          <p className="text-xs text-muted mt-1.5">We generate a colored initials avatar for you.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-navy-700">Display name</label>
          <input
            type="text"
            required
            value={props.displayName}
            onChange={(e) => props.setDisplayName(e.target.value)}
            className="input-field mt-1"
            placeholder="How should people know you?"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-navy-700">Short biography</label>
          <textarea
            value={props.bio}
            onChange={(e) => props.setBio(e.target.value)}
            className="input-field mt-1 min-h-[80px] resize-none"
            placeholder="A few sentences about you..."
            maxLength={300}
          />
          <p className="text-xs text-muted mt-1">{props.bio.length}/300</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-navy-700">Education</label>
            <div className="relative mt-1">
              <GraduationCap size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={props.education}
                onChange={(e) => props.setEducation(e.target.value)}
                className="input-field pl-9"
                placeholder="BTech, University"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-navy-700">College / Organization</label>
            <div className="relative mt-1">
              <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={props.organization}
                onChange={(e) => props.setOrganization(e.target.value)}
                className="input-field pl-9"
                placeholder="Your org"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-navy-700">Location (optional, city-level)</label>
          <div className="relative mt-1">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={props.locationCity}
              onChange={(e) => props.setLocationCity(e.target.value)}
              className="input-field pl-9"
              placeholder="Your city"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2({ selected, toggle }: { selected: string[]; toggle: (n: string) => void }) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-navy-900 mb-1">Pick your interests</h2>
      <p className="text-sm text-muted mb-6">Select what excites you. We'll match you with people who share these.</p>

      {INTEREST_CATEGORIES.map((cat) => (
        <div key={cat.value} className="mb-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-2">{cat.label}</h3>
          <div className="flex flex-wrap gap-2">
            {INTEREST_CATALOG.filter((i) => i.category === cat.value).map((i) => {
              const isOn = selected.includes(i.name);
              return (
                <button
                  key={i.name}
                  type="button"
                  onClick={() => toggle(i.name)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isOn
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                  }`}
                >
                  {isOn && <Check size={14} className="inline mr-1" />}
                  {i.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Step3Props {
  selected: string[];
  customSkill: string;
  setCustomSkill: (value: string) => void;
  addSkill: (value: string) => void;
  removeSkill: (value: string) => void;
}

function Step3(props: Step3Props) {
  const { selected, customSkill, setCustomSkill, addSkill, removeSkill } = props;
  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-navy-900 mb-1">Add your skills</h2>
      <p className="text-sm text-muted mb-6">What are you good at? Type to add or pick from suggestions.</p>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Wrench size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={customSkill}
            onChange={(e) => setCustomSkill(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill(customSkill))}
            className="input-field pl-9"
            placeholder="e.g. Python, Figma, Public Speaking"
          />
        </div>
        <Button variant="secondary" onClick={() => addSkill(customSkill)}>Add</Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {selected.map((s: string) => (
            <span key={s} className="badge-indigo gap-1.5">
              {s}
              <button onClick={() => removeSkill(s)} className="text-indigo-400 hover:text-indigo-600">×</button>
            </span>
          ))}
        </div>
      )}

      <h3 className="text-sm font-semibold text-navy-700 mb-2">Popular skills</h3>
      <div className="flex flex-wrap gap-2">
        {SKILL_CATALOG.filter((s) => !selected.includes(s)).slice(0, 20).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => addSkill(s)}
            className="px-3 py-1.5 rounded-full text-sm bg-navy-50 text-navy-600 hover:bg-navy-100 transition-colors"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Step4Props {
  discoveryEnabled: boolean;
  setDiscoveryEnabled: (value: boolean) => void;
  appearInRecs: boolean;
  setAppearInRecs: (value: boolean) => void;
  selectedInterests: string[];
}

function Step4(props: Step4Props) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-navy-900 mb-1">Discovery preferences</h2>
      <p className="text-sm text-muted mb-6">Control how people find and connect with you.</p>

      <div className="space-y-4">
        <Card className="p-4 flex items-start gap-3">
          <Eye size={20} className="text-indigo-500 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-navy-800 text-sm">Enable discovery</p>
            <p className="text-xs text-muted mt-0.5">Allow others to discover you in recommendations and search.</p>
          </div>
          <Toggle on={props.discoveryEnabled} onClick={() => props.setDiscoveryEnabled(!props.discoveryEnabled)} />
        </Card>
        <Card className="p-4 flex items-start gap-3">
          <Heart size={20} className="text-indigo-500 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-navy-800 text-sm">Appear in recommendations</p>
            <p className="text-xs text-muted mt-0.5">Be suggested as a potential connection to others.</p>
          </div>
          <Toggle on={props.appearInRecs} onClick={() => props.setAppearInRecs(!props.appearInRecs)} />
        </Card>
        {props.selectedInterests.length > 0 && (
          <Card className="p-4">
            <p className="font-medium text-navy-800 text-sm mb-2">Preferred interest categories</p>
            <div className="flex flex-wrap gap-2">
              {props.selectedInterests.map((i: string) => (
                <span key={i} className="badge-indigo">{i}</span>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-indigo-500' : 'bg-navy-200'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

interface Step5Props {
  avatarUrl: string;
  displayName: string;
  organization: string;
  education: string;
  locationCity: string;
  bio: string;
  selectedInterests: string[];
  selectedSkills: string[];
  discoveryEnabled: boolean;
  onSeedDemo: () => void;
  seedingDemo: boolean;
}

function Step5(props: Step5Props) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-navy-900 mb-1">Review your profile</h2>
      <p className="text-sm text-muted mb-6">Make sure everything looks right. You can change this later.</p>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar src={props.avatarUrl} name={props.displayName} size="xl" />
          <div>
            <h3 className="text-lg font-bold text-navy-900">{props.displayName || 'Your name'}</h3>
            <p className="text-sm text-muted">{props.organization || props.education || 'No org'}</p>
            <p className="text-xs text-muted">{props.locationCity || 'Location not set'}</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-navy-600">{props.bio || 'No bio yet.'}</p>
        {props.selectedInterests.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Interests</p>
            <div className="flex flex-wrap gap-1.5">
              {props.selectedInterests.map((i) => <span key={i} className="badge-indigo">{i}</span>)}
            </div>
          </div>
        )}
        {props.selectedSkills.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {props.selectedSkills.map((s) => <span key={s} className="badge-success">{s}</span>)}
            </div>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-navy-50 flex items-center gap-2">
          <CheckCircle2 size={16} className={props.discoveryEnabled ? 'text-success-400' : 'text-muted'} />
          <span className="text-sm text-navy-600">{props.discoveryEnabled ? 'Discovery enabled' : 'Discovery disabled'}</span>
        </div>
      </Card>

      <div className="mt-4 p-4 bg-indigo-50 rounded-xl">
        <p className="text-sm text-indigo-700">
          When you finish, we'll load a demonstration network of 36 fictional users so you can explore Bondly immediately. You can connect with them to test the recommendation engine.
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={props.onSeedDemo} disabled={props.seedingDemo}>
          {props.seedingDemo ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
          {props.seedingDemo ? 'Loading demo network...' : 'Load demo network now'}
        </Button>
      </div>
    </div>
  );
}
