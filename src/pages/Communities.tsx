import { useCallback, useEffect, useState } from 'react';
import { Search, BookOpen, Users, Plus, Check } from 'lucide-react';
import { Card, Button, Spinner, EmptyState, PageHeader, Badge, Modal } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import { loadCommunities } from '../lib/data';
import type { Community } from '../lib/types';

export function Communities() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState('technology');

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const comms = await loadCommunities(profile.id);
    setCommunities(comms);
    setLoading(false);
  }, [profile]);

  useEffect(() => { void load(); }, [load]);

  const toggleJoin = async (c: Community) => {
    if (!profile) return;
    if (c.is_member) {
      await supabase.from('community_memberships').delete().eq('community_id', c.id).eq('user_id', profile.id);
    } else {
      await supabase.from('community_memberships').insert({ community_id: c.id, user_id: profile.id });
    }
    load();
  };

  const createCommunity = async () => {
    if (!profile || !newName.trim()) return;
    await supabase.from('communities').insert({ name: newName, description: newDesc, category: newCat, created_by: profile.id });
    setNewName(''); setNewDesc(''); setShowCreate(false);
    load();
  };

  const filtered = communities.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Communities"
        subtitle="Join interest groups and meet people who share your passions."
        action={<Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Create</Button>}
      />

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-9"
          placeholder="Search communities..."
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner className="w-8 h-8" /></div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={28} />} title="No communities found" /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className="p-5 hover:shadow-elevated transition-all">
              <div className="flex items-start justify-between mb-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <Badge color="navy">{c.category}</Badge>
              </div>
              <h3 className="font-semibold text-navy-900">{c.name}</h3>
              <p className="text-sm text-muted mt-1 line-clamp-2">{c.description}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-navy-50">
                <span className="text-xs text-muted flex items-center gap-1">
                  <Users size={12} /> {c.member_count ?? 0} members
                </span>
                <Button
                  size="sm"
                  variant={c.is_member ? 'secondary' : 'primary'}
                  onClick={() => toggleJoin(c)}
                >
                  {c.is_member ? <><Check size={12} /> Joined</> : 'Join'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Community">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-navy-700">Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field mt-1" placeholder="Community name" />
            </div>
            <div>
              <label className="text-sm font-medium text-navy-700">Description</label>
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="input-field mt-1 min-h-[80px] resize-none" placeholder="What's this community about?" />
            </div>
            <div>
              <label className="text-sm font-medium text-navy-700">Category</label>
              <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="input-field mt-1">
                <option value="technology">Technology</option>
                <option value="arts">Arts</option>
                <option value="sports">Sports</option>
                <option value="research">Research</option>
                <option value="education">Education</option>
                <option value="entertainment">Entertainment</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createCommunity}>Create</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
