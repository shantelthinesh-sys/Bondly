import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, UserPlus, Trash2, ArrowRight, X, Check } from 'lucide-react';
import { Card, Avatar, Button, Spinner, EmptyState, PageHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import type { Profile, ConnectionRequest, Connection } from '../lib/types';

type Tab = 'all' | 'pending' | 'sent' | 'suggested' | 'recent';

export function MyNetwork() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Profile[]>([]);
  const [incoming, setIncoming] = useState<(ConnectionRequest & { sender?: Profile })[]>([]);
  const [sent, setSent] = useState<(ConnectionRequest & { receiver?: Profile })[]>([]);
  const [suggested, setSuggested] = useState<Profile[]>([]);
  const [recent, setRecent] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    setActionError(null);
    try {
      const [connRes, inRes, outRes] = await Promise.all([
        supabase.from('connections').select('*').or(`user_a.eq.${uid},user_b.eq.${uid}`),
        supabase.from('connection_requests').select('*, sender:profiles!connection_requests_sender_id_fkey(*)').eq('receiver_id', uid).eq('status', 'pending'),
        supabase.from('connection_requests').select('*, receiver:profiles!connection_requests_receiver_id_fkey(*)').eq('sender_id', uid).eq('status', 'pending'),
      ]);
      const requestError = connRes.error ?? inRes.error ?? outRes.error;
      if (requestError) throw requestError;

      const connections = (connRes.data ?? []) as Connection[];
      const outgoingRequests = (outRes.data ?? []) as ConnectionRequest[];
      const incomingRequests = (inRes.data ?? []) as (ConnectionRequest & { sender?: Profile })[];
      const friendIds = connections.map((c) => (c.user_a === uid ? c.user_b : c.user_a));
      let friendProfiles: Profile[] = [];
      if (friendIds.length > 0) {
        const { data, error } = await supabase.from('profiles').select('*').in('id', friendIds);
        if (error) throw error;
        friendProfiles = (data ?? []) as Profile[];
      }
      setConnections(friendProfiles);

      const sorted = [...connections].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      const recentIds = sorted.slice(0, 5).map((c) => (c.user_a === uid ? c.user_b : c.user_a));
      if (recentIds.length > 0) {
        const { data, error } = await supabase.from('profiles').select('*').in('id', recentIds);
        if (error) throw error;
        setRecent((data ?? []) as Profile[]);
      } else {
        setRecent([]);
      }

      setIncoming(incomingRequests);
      setSent(outgoingRequests as (ConnectionRequest & { receiver?: Profile })[]);

      const connectedSet = new Set(friendIds);
      const sentIds = new Set(outgoingRequests.map((r) => r.receiver_id));
      const { data: allProfiles, error } = await supabase.from('profiles').select('*').neq('id', uid).limit(30);
      if (error) throw error;
      setSuggested(
        ((allProfiles ?? []) as Profile[])
          .filter((p) => !connectedSet.has(p.id) && !sentIds.has(p.id))
          .slice(0, 8),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to load your network.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) load(profile.id);
  }, [profile, load]);

  const acceptRequest = async (req: ConnectionRequest) => {
    if (!profile) return;
    setActionError(null);
    const { error } = await supabase.rpc('accept_connection_request', { request_id: req.id });
    if (error) {
      setActionError(error.message);
      return;
    }
    await load(profile.id);
  };

  const declineRequest = async (req: ConnectionRequest) => {
    if (!profile) return;
    setActionError(null);
    const { error } = await supabase.from('connection_requests').update({ status: 'declined' }).eq('id', req.id);
    if (error) {
      setActionError(error.message);
      return;
    }
    await load(profile.id);
  };

  const cancelRequest = async (req: ConnectionRequest) => {
    if (!profile) return;
    setActionError(null);
    const { error } = await supabase.from('connection_requests').delete().eq('id', req.id);
    if (error) {
      setActionError(error.message);
      return;
    }
    await load(profile.id);
  };

  const removeConnection = async (friendId: string) => {
    if (!profile) return;
    const [lo, hi] = profile.id < friendId ? [profile.id, friendId] : [friendId, profile.id];
    setActionError(null);
    const { error } = await supabase.from('connections').delete().eq('user_a', lo).eq('user_b', hi);
    if (error) {
      setActionError(error.message);
      return;
    }
    await load(profile.id);
  };

  const sendRequest = async (receiverId: string) => {
    if (!profile) return;
    setActionError(null);
    const { error } = await supabase.from('connection_requests').insert({ sender_id: profile.id, receiver_id: receiverId, status: 'pending' });
    if (error) {
      setActionError(error.message);
      return;
    }
    await load(profile.id);
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All Connections', count: connections.length },
    { key: 'pending', label: 'Pending Requests', count: incoming.length },
    { key: 'sent', label: 'Sent Requests', count: sent.length },
    { key: 'suggested', label: 'Suggested', count: suggested.length },
    { key: 'recent', label: 'Recently Added', count: recent.length },
  ];

  let display: Profile[] = [];
  if (tab === 'all') display = connections;
  if (tab === 'recent') display = recent;
  if (tab === 'suggested') display = suggested;

  const filtered = display.filter((p) =>
    !query || p.display_name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="animate-fade-in">
      {actionError && <p role="alert" className="mb-4 text-sm text-error-400">{actionError}</p>}
      <PageHeader title="My Network" subtitle="Manage your connections, requests, and suggestions." />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-navy-600 hover:bg-navy-50'
            }`}
          >
            {t.label} <span className="opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      {tab !== 'pending' && tab !== 'sent' && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field pl-9"
            placeholder="Search connections..."
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner className="w-8 h-8" /></div>
      ) : tab === 'pending' ? (
        incoming.length === 0 ? (
          <Card><EmptyState icon={<UserPlus size={28} />} title="No pending requests" description="Incoming connection requests will appear here." /></Card>
        ) : (
          <div className="space-y-2">
            {incoming.map((req) => (
              <Card key={req.id} className="p-3 flex items-center gap-3">
                <Avatar src={req.sender?.avatar_url} name={req.sender?.display_name ?? 'User'} />
                <div className="flex-1 min-w-0">
                  <Link to={`/app/profile/${req.sender_id}`} className="text-sm font-medium text-navy-900 hover:text-indigo-600">
                    {req.sender?.display_name}
                  </Link>
                  <p className="text-xs text-muted truncate">{req.message || 'Wants to connect'}</p>
                </div>
                <Button size="sm" onClick={() => acceptRequest(req)}><Check size={14} /> Accept</Button>
                <Button variant="ghost" size="sm" onClick={() => declineRequest(req)}><X size={14} /></Button>
              </Card>
            ))}
          </div>
        )
      ) : tab === 'sent' ? (
        sent.length === 0 ? (
          <Card><EmptyState icon={<ArrowRight size={28} />} title="No sent requests" description="Outgoing connection requests will appear here." /></Card>
        ) : (
          <div className="space-y-2">
            {sent.map((req) => (
              <Card key={req.id} className="p-3 flex items-center gap-3">
                <Avatar src={req.receiver?.avatar_url} name={req.receiver?.display_name ?? 'User'} />
                <div className="flex-1 min-w-0">
                  <Link to={`/app/profile/${req.receiver_id}`} className="text-sm font-medium text-navy-900 hover:text-indigo-600">
                    {req.receiver?.display_name}
                  </Link>
                  <p className="text-xs text-muted">Pending · sent {new Date(req.created_at).toLocaleDateString()}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => cancelRequest(req)}>Cancel</Button>
              </Card>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<Users size={28} />} title="No connections found" /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-center gap-3">
                <Link to={`/app/profile/${p.id}`}>
                  <Avatar src={p.avatar_url} name={p.display_name} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/app/profile/${p.id}`} className="text-sm font-medium text-navy-900 hover:text-indigo-600 truncate block">
                    {p.display_name}
                    {p.is_demo && <span className="badge-muted ml-1 text-[10px]">demo</span>}
                  </Link>
                  <p className="text-xs text-muted truncate">{p.headline || p.organization}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <Link to={`/app/profile/${p.id}`}><Button variant="secondary" size="sm">View</Button></Link>
                {tab === 'suggested' ? (
                  <Button size="sm" onClick={() => sendRequest(p.id)}><UserPlus size={12} /> Connect</Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => removeConnection(p.id)} className="text-error-300 hover:bg-error-50">
                    <Trash2 size={12} /> Remove
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
