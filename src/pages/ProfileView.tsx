import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, MapPin, UserPlus, UserCheck, Clock } from 'lucide-react';
import { Avatar, Button, Card, EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';
import type { Connection, Interest, Profile, Skill } from '../lib/types';

type ConnectionState = 'none' | 'connected' | 'sent' | 'received';

export function ProfileView() {
  const { id } = useParams<{ id: string }>();
  const { profile: currentProfile } = useAuth();
  const [person, setPerson] = useState<Profile | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('none');
  const [connectionCount, setConnectionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !currentProfile) return;
    setLoading(true);
    setError(null);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles').select('*').eq('id', id).maybeSingle();
      if (profileError) throw profileError;
      if (!profileData) {
        setPerson(null);
        return;
      }

      const [interestLinks, skillLinks, connectionData, outgoingData, incomingData, countData] = await Promise.all([
        supabase.from('profile_interests').select('interest_id').eq('profile_id', id),
        supabase.from('profile_skills').select('skill_id').eq('profile_id', id),
        supabase.from('connections').select('*').or(`user_a.eq.${currentProfile.id},user_b.eq.${currentProfile.id}`),
        supabase.from('connection_requests').select('*').eq('sender_id', currentProfile.id).eq('receiver_id', id).eq('status', 'pending').maybeSingle(),
        supabase.from('connection_requests').select('*').eq('sender_id', id).eq('receiver_id', currentProfile.id).eq('status', 'pending').maybeSingle(),
        supabase.from('connections').select('*', { count: 'exact', head: true }).or(`user_a.eq.${id},user_b.eq.${id}`),
      ]);
      const queryError = [
        interestLinks.error, skillLinks.error, connectionData.error,
        outgoingData.error, incomingData.error, countData.error,
      ].find(Boolean);
      if (queryError) throw queryError;

      const interestIds = (interestLinks.data ?? []).map((row) => row.interest_id);
      const skillIds = (skillLinks.data ?? []).map((row) => row.skill_id);
      const [interestData, skillData] = await Promise.all([
        interestIds.length
          ? supabase.from('interests').select('*').in('id', interestIds)
          : Promise.resolve({ data: [], error: null }),
        skillIds.length
          ? supabase.from('skills').select('*').in('id', skillIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (interestData.error) throw interestData.error;
      if (skillData.error) throw skillData.error;

      const connections = (connectionData.data ?? []) as Connection[];
      const connected = connections.some((connection) =>
        connection.user_a === id || connection.user_b === id,
      );
      setPerson(profileData as Profile);
      setInterests((interestData.data ?? []) as Interest[]);
      setSkills((skillData.data ?? []) as Skill[]);
      setConnectionCount(countData.count ?? 0);
      setConnectionState(
        connected ? 'connected' : outgoingData.data ? 'sent' : incomingData.data ? 'received' : 'none',
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this profile.');
    } finally {
      setLoading(false);
    }
  }, [currentProfile, id]);

  useEffect(() => { void load(); }, [load]);

  const sendRequest = async () => {
    if (!id || !currentProfile) return;
    setWorking(true);
    setError(null);
    try {
      const { error: requestError } = await supabase.from('connection_requests').insert({
        sender_id: currentProfile.id,
        receiver_id: id,
        status: 'pending',
      });
      if (requestError) throw requestError;
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to send the connection request.');
    } finally {
      setWorking(false);
    }
  };

  const acceptRequest = async () => {
    if (!id || !currentProfile) return;
    setWorking(true);
    setError(null);
    try {
      const { data: request, error: requestError } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('sender_id', id)
        .eq('receiver_id', currentProfile.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (requestError) throw requestError;
      if (!request) throw new Error('This connection request is no longer available.');
      const { error: acceptError } = await supabase
        .rpc('accept_connection_request', { request_id: request.id });
      if (acceptError) throw acceptError;
      await load();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Unable to accept this connection request.');
    } finally {
      setWorking(false);
    }
  };

  const cancelRequest = async () => {
    if (!id || !currentProfile) return;
    setWorking(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('connection_requests')
        .delete()
        .eq('sender_id', currentProfile.id)
        .eq('receiver_id', id)
        .eq('status', 'pending');
      if (deleteError) throw deleteError;
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel the connection request.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner className="w-10 h-10" /></div>;

  if (!person) {
    return (
      <div>
        <Link to="/app" className="inline-flex items-center gap-2 text-sm text-indigo-600 mb-4"><ArrowLeft size={16} />Back to overview</Link>
        <Card><EmptyState title="Profile not found" description="This profile may no longer be available." /></Card>
      </div>
    );
  }

  const isSelf = person.id === currentProfile?.id;

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <Link to="/app/discover" className="inline-flex items-center gap-2 text-sm text-indigo-600 mb-4"><ArrowLeft size={16} />Back to discovery</Link>
      {error && <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-error-400"><AlertCircle size={16} />{error}</p>}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar src={person.avatar_url} name={person.display_name} size="xl" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-navy-900">{person.display_name}</h1>
            {person.headline && <p className="text-indigo-600 mt-1">{person.headline}</p>}
            {person.visibility.location && person.location_city && (
              <p className="mt-2 flex items-center gap-1 text-sm text-muted"><MapPin size={14} />{person.location_city}</p>
            )}
          </div>
          {!isSelf && (
            <div>
              {connectionState === 'none' && <Button onClick={sendRequest} disabled={working}><UserPlus size={16} />Connect</Button>}
              {connectionState === 'sent' && <Button variant="secondary" onClick={cancelRequest} disabled={working}><Clock size={16} />Cancel request</Button>}
              {connectionState === 'received' && <Button onClick={acceptRequest} disabled={working}><UserCheck size={16} />Accept request</Button>}
              {connectionState === 'connected' && <span className="badge-success">Connected</span>}
            </div>
          )}
        </div>
        {person.bio && <p className="mt-6 text-sm leading-6 text-navy-700">{person.bio}</p>}
        {(person.visibility.education && person.education) || person.organization ? (
          <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm">
            {person.visibility.education && person.education && <p><span className="text-muted">Education</span><br />{person.education}</p>}
            {person.organization && <p><span className="text-muted">Organization</span><br />{person.organization}</p>}
          </div>
        ) : null}
        {person.visibility.connections && <p className="mt-4 text-sm text-muted">{connectionCount} connection{connectionCount === 1 ? '' : 's'}</p>}
        {person.visibility.interests && interests.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-navy-800 mb-2">Interests</h2>
            <div className="flex flex-wrap gap-2">{interests.map((interest) => <span key={interest.id} className="badge-indigo">{interest.name}</span>)}</div>
          </section>
        )}
        {person.visibility.skills && skills.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-navy-800 mb-2">Skills</h2>
            <div className="flex flex-wrap gap-2">{skills.map((skill) => <span key={skill.id} className="badge-success">{skill.name}</span>)}</div>
          </section>
        )}
      </Card>
    </div>
  );
}
