import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Search, Trash2, Pencil } from 'lucide-react';
import { Card, Avatar, Button, Spinner, EmptyState, PageHeader, Modal } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import type { Profile } from '../lib/types';

interface SavedProfileRow {
  saved_profile_id: string;
  note: string | null;
}

export function SavedProfiles() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<{ profile: Profile; note: string; id: string }[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('saved_profiles')
      .select('saved_profile_id, note, created_at')
      .eq('user_id', profile.id);
    if (data && data.length > 0) {
      const savedRows = data as SavedProfileRow[];
      const ids = savedRows.map((d) => d.saved_profile_id);
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids).eq('is_demo', false);
      const profileMap = new Map(
        ((profiles ?? []) as Profile[]).map((person) => [person.id, person]),
      );
      const savedProfiles = savedRows.flatMap((row) => {
        const person = profileMap.get(row.saved_profile_id);
        return person
          ? [{ id: row.saved_profile_id, profile: person, note: row.note ?? '' }]
          : [];
      });
      setSaved(savedProfiles);
    } else {
      setSaved([]);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { void load(); }, [load]);

  const removeSaved = async (id: string) => {
    if (!profile) return;
    await supabase.from('saved_profiles').delete().eq('user_id', profile.id).eq('saved_profile_id', id);
    load();
  };

  const saveNote = async (id: string) => {
    if (!profile) return;
    await supabase.from('saved_profiles').update({ note: noteText }).eq('user_id', profile.id).eq('saved_profile_id', id);
    setEditing(null);
    load();
  };

  const filtered = saved.filter((s) =>
    !search || s.profile.display_name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Spinner className="w-8 h-8" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Saved Profiles" subtitle="People you've bookmarked for later." />

      {saved.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9"
            placeholder="Search saved profiles..."
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card><EmptyState
          icon={<Bookmark size={28} />}
          title="No saved profiles yet"
          description="Save interesting people from the Discover page to find them here."
        /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Link to={`/app/profile/${s.id}`}><Avatar src={s.profile.avatar_url} name={s.profile.display_name} /></Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/app/profile/${s.id}`} className="text-sm font-medium text-navy-900 hover:text-indigo-600 truncate block">
                    {s.profile.display_name}
                  </Link>
                  <p className="text-xs text-muted truncate">{s.profile.headline || s.profile.organization}</p>
                </div>
              </div>
              {s.note && <p className="text-xs text-navy-600 bg-navy-50 rounded-lg p-2 mb-2">{s.note}</p>}
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => { setEditing(s.id); setNoteText(s.note); }}>
                  <Pencil size={12} /> Note
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeSaved(s.id)} className="text-error-300 hover:bg-error-50">
                  <Trash2 size={12} /> Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit note">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="input-field min-h-[100px] resize-none"
            placeholder="Add a personal note about this person..."
          />
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveNote(editing)}>Save note</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
