import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, ChevronLeft, ChevronRight, Eye, Plus, X } from 'lucide-react';
import { Avatar, Button, Modal, Spinner } from './ui';
import { useAuth } from '../context/useAuth';
import { formatSupabaseError, supabase } from '../lib/supabase';

type StoryAudience = 'discoverable' | 'connections';
type StoryKind = 'text' | 'image' | 'video';
type StoryAuthor = { display_name: string; avatar_url: string | null };
type Story = {
  id: string;
  author_id: string;
  kind: StoryKind;
  body: string | null;
  media_path: string | null;
  audience: StoryAudience;
  created_at: string;
  expires_at: string;
  author: StoryAuthor | null;
  seen: boolean;
};
type StoryGroup = { authorId: string; author: StoryAuthor | null; stories: Story[] };
type StoryViewerState = { stories: Story[]; index: number } | null;
type StoryViewerRow = { viewer_id: string; display_name: string; avatar_url: string | null; viewed_at: string };

const STORY_BUCKET = 'bondly-stories';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm',
]);
const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

function getStoriesError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error.code === 'PGRST205' || error.code === '42P01')
  ) {
    return 'Stories are not set up in Supabase yet. Apply supabase/migrations/20261028210000_phase3_stories_and_social_profiles.sql after the feed migration.';
  }
  return formatSupabaseError(error);
}

function normalizeAuthor(value: StoryAuthor | StoryAuthor[] | null): StoryAuthor | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getMediaKind(file: File): Exclude<StoryKind, 'text'> {
  return file.type.startsWith('image/') ? 'image' : 'video';
}

export function Stories() {
  const { profile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [viewer, setViewer] = useState<StoryViewerState>(null);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audience, setAudience] = useState<StoryAudience>(
    profile?.discovery_enabled ? 'discoverable' : 'connections',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const loadStories = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const { data: expired, error: expiredError } = await supabase
        .from('stories')
        .select('id, media_path')
        .eq('author_id', profile.id)
        .lte('expires_at', new Date().toISOString());
      if (expiredError) throw expiredError;

      const expiredRows = expired ?? [];
      const expiredMedia = expiredRows.flatMap((story) => story.media_path ? [story.media_path] : []);
      if (expiredMedia.length) {
        const { error: storageError } = await supabase.storage.from(STORY_BUCKET).remove(expiredMedia);
        if (storageError) throw storageError;
      }
      if (expiredRows.length) {
        const { error: deleteError } = await supabase
          .from('stories')
          .delete()
          .in('id', expiredRows.map((story) => story.id));
        if (deleteError) throw deleteError;
      }

      const { data: rows, error: queryError } = await supabase
        .from('stories')
        .select('id, author_id, kind, body, media_path, audience, created_at, expires_at, author:profiles!stories_author_id_fkey(display_name, avatar_url)')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
      if (queryError) throw queryError;

      const storyRows = rows ?? [];
      if (storyRows.length === 0) {
        setStories([]);
        setLoading(false);
        return;
      }

      const { data: viewRows, error: viewsError } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', profile.id)
        .in('story_id', storyRows.map((story) => story.id));
      if (viewsError) throw viewsError;
      const viewedIds = new Set((viewRows ?? []).map((row) => row.story_id));
      setStories(storyRows.map((story) => ({
        ...story,
        author: normalizeAuthor(story.author),
        seen: story.author_id !== profile.id && viewedIds.has(story.id),
      })));
    } catch (loadError) {
      setStories([]);
      setError(getStoriesError(loadError));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { void loadStories(); }, [loadStories]);

  const groups = stories.reduce<StoryGroup[]>((result, story) => {
    let group = result.find((item) => item.authorId === story.author_id);
    if (!group) {
      group = { authorId: story.author_id, author: story.author, stories: [] };
      result.push(group);
    }
    group.stories.push(story);
    return result;
  }, []);
  groups.forEach((group) => group.stories.sort((left, right) => left.created_at.localeCompare(right.created_at)));
  const ownStories = groups.find((group) => group.authorId === profile?.id);
  const otherGroups = groups.filter((group) => group.authorId !== profile?.id);
  const markStorySeen = useCallback((storyId: string) => {
    setStories((current) => current.map((story) => story.id === storyId ? { ...story, seen: true } : story));
  }, []);

  const publishStory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || posting || (!file && !body.trim())) return;
    setPosting(true);
    setError(null);
    let mediaPath: string | null = null;
    try {
      let kind: StoryKind = 'text';
      if (file) {
        if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
          throw new Error('Choose a JPG, PNG, WebP, GIF, MP4, or WebM file.');
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error('Story media must be 50 MB or smaller.');
        }
        kind = getMediaKind(file);
        const extension = MEDIA_EXTENSIONS[file.type];
        mediaPath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(STORY_BUCKET)
          .upload(mediaPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase.from('stories').insert({
        author_id: profile.id,
        kind,
        body: body.trim() || null,
        media_path: mediaPath,
        audience,
      });
      if (insertError) {
        if (mediaPath) {
          const { error: cleanupError } = await supabase.storage.from(STORY_BUCKET).remove([mediaPath]);
          if (cleanupError) {
            throw new Error(`${getStoriesError(insertError)} Uploaded media cleanup also failed: ${getStoriesError(cleanupError)}`);
          }
        }
        throw insertError;
      }

      setBody('');
      setFile(null);
      setShowComposer(false);
      await loadStories();
    } catch (publishError) {
      setError(getStoriesError(publishError));
    } finally {
      setPosting(false);
    }
  };

  const deleteStory = async (story: Story) => {
    if (!profile || !window.confirm('Delete this story?')) return;
    setError(null);
    const { error: deleteError } = await supabase
      .from('stories')
      .delete()
      .eq('id', story.id)
      .eq('author_id', profile.id);
    if (deleteError) {
      setError(getStoriesError(deleteError));
      return;
    }
    setViewer(null);
    let cleanupWarning: string | null = null;
    if (story.media_path) {
      const { error: storageError } = await supabase.storage.from(STORY_BUCKET).remove([story.media_path]);
      if (storageError) {
        cleanupWarning = `Story deleted, but its media could not be removed from storage: ${getStoriesError(storageError)}`;
      }
    }
    await loadStories();
    if (cleanupWarning) setError(cleanupWarning);
  };

  const openGroup = (group: StoryGroup) => setViewer({ stories: group.stories, index: 0 });

  return (
    <section aria-label="Stories" className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">Stories</h2>
          <p className="text-xs text-muted">Moments disappear after 24 hours</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setShowComposer(true)}>
          <Plus size={14} /> Add story
        </Button>
      </div>

      {error && <p role="alert" className="mb-3 rounded-xl bg-error-50 px-3 py-2 text-sm text-error-400">{error}</p>}

      <div className="flex gap-4 overflow-x-auto rounded-2xl border border-navy-50 bg-white p-4">
        <button type="button" className="flex w-16 shrink-0 flex-col items-center gap-1.5" onClick={() => ownStories ? openGroup(ownStories) : setShowComposer(true)}>
          <span className="relative rounded-full bg-navy-50 p-0.5">
            <Avatar src={profile?.avatar_url} name={profile?.display_name ?? 'You'} size="lg" />
            {!ownStories && <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-indigo-500 text-white"><Plus size={14} /></span>}
          </span>
          <span className="w-full truncate text-center text-xs text-navy-700">{ownStories ? 'Your story' : 'Add story'}</span>
        </button>
        {loading ? (
          <Spinner className="h-16 w-16 shrink-0" />
        ) : otherGroups.map((group) => (
          <button key={group.authorId} type="button" className="flex w-16 shrink-0 flex-col items-center gap-1.5" onClick={() => openGroup(group)}>
            <span className={`rounded-full p-0.5 ${group.stories.every((story) => story.seen) ? 'bg-navy-200' : 'bg-gradient-to-tr from-amber-400 via-pink-500 to-indigo-500'}`}>
              <span className="block rounded-full bg-white p-0.5">
                <Avatar src={group.author?.avatar_url} name={group.author?.display_name ?? 'Bondly member'} size="md" />
              </span>
            </span>
            <span className="w-full truncate text-center text-xs text-navy-700">{group.author?.display_name ?? 'Member'}</span>
          </button>
        ))}
        {!loading && otherGroups.length === 0 && !ownStories && (
          <p className="self-center text-sm text-muted">Stories from your community will appear here.</p>
        )}
      </div>

      <Modal open={showComposer} onClose={() => !posting && setShowComposer(false)} title="Add a story">
        <form className="space-y-4" onSubmit={(event) => void publishStory(event)}>
          <label className="block text-sm font-medium text-navy-700">
            Photo or video (optional for a text story)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
              className="input-field mt-1"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {previewUrl && (file?.type.startsWith('video/') ? (
            <video src={previewUrl} controls muted playsInline className="max-h-64 w-full rounded-xl bg-navy-900 object-contain" />
          ) : (
            <img src={previewUrl} alt="Story preview" className="max-h-64 w-full rounded-xl object-contain" />
          ))}
          <label className="block text-sm font-medium text-navy-700">
            Caption or story text
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} className="input-field mt-1 min-h-24 resize-y" placeholder="Share a moment..." />
          </label>
          <label className="block text-sm font-medium text-navy-700">
            Audience
            <select value={audience} onChange={(event) => setAudience(event.target.value as StoryAudience)} className="input-field mt-1">
              <option value="discoverable" disabled={!profile?.discovery_enabled}>Discoverable community</option>
              <option value="connections">My connections</option>
            </select>
          </label>
          {file && <p className="text-xs text-muted">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowComposer(false)} disabled={posting}>Cancel</Button>
            <Button type="submit" disabled={posting || (!file && !body.trim())}>
              {posting ? <><Spinner className="h-4 w-4" /> Publishing...</> : <><Camera size={15} /> Share story</>}
            </Button>
          </div>
        </form>
      </Modal>

      {viewer && profile && (
        <StoryViewer
          stories={viewer.stories}
          initialIndex={viewer.index}
          viewerId={profile.id}
          isOwner={viewer.stories[0]?.author_id === profile.id}
          onClose={() => setViewer(null)}
          onDelete={deleteStory}
          onError={setError}
          onViewed={markStorySeen}
        />
      )}
    </section>
  );
}

function StoryViewer({
  stories,
  initialIndex,
  viewerId,
  isOwner,
  onClose,
  onDelete,
  onError,
  onViewed,
}: {
  stories: Story[];
  initialIndex: number;
  viewerId: string;
  isOwner: boolean;
  onClose: () => void;
  onDelete: (story: Story) => Promise<void>;
  onError: (message: string) => void;
  onViewed: (storyId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [viewers, setViewers] = useState<StoryViewerRow[]>([]);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const story = stories[index];
  const duration = story.kind === 'video' ? 15000 : 6000;

  const next = useCallback(() => {
    if (index >= stories.length - 1) onClose();
    else setIndex((current) => current + 1);
  }, [index, onClose, stories.length]);
  const previous = () => setIndex((current) => Math.max(0, current - 1));

  useEffect(() => {
    let active = true;
    setMediaUrl(null);
    setViewers([]);
    setViewerError(null);
    setVideoProgress(0);
    if (story.author_id !== viewerId) {
      void supabase.from('story_views').upsert(
        { story_id: story.id, viewer_id: viewerId, viewed_at: new Date().toISOString() },
        { onConflict: 'story_id,viewer_id' },
      ).then(({ error: viewError }) => {
        if (viewError && active) {
          setViewerError(getStoriesError(viewError));
          onError(getStoriesError(viewError));
        } else if (active) {
          onViewed(story.id);
        }
      });
    } else {
      void supabase.rpc('get_story_viewers', { target_story_id: story.id }).then(({ data, error: viewersError }) => {
        if (active && viewersError) {
          setViewerError(getStoriesError(viewersError));
          onError(getStoriesError(viewersError));
        }
        if (active && data) setViewers(data as StoryViewerRow[]);
      });
    }

    if (story.media_path) {
      void supabase.storage.from(STORY_BUCKET).createSignedUrl(story.media_path, 3600).then(({ data, error: urlError }) => {
        if (active && urlError) {
          setViewerError(getStoriesError(urlError));
          onError(getStoriesError(urlError));
        }
        if (active && data) setMediaUrl(data.signedUrl);
      });
    }
    return () => { active = false; };
  }, [onError, onViewed, story.author_id, story.id, story.media_path, viewerId]);

  useEffect(() => {
    if (story.kind === 'video') return;
    const timer = window.setTimeout(next, duration);
    return () => window.clearTimeout(timer);
  }, [duration, index, next, story.kind]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Story viewer">
      <button type="button" onClick={onClose} aria-label="Close story" className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white"><X size={22} /></button>
      <div className="relative flex h-[min(90vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-navy-900 text-white shadow-2xl">
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
          {stories.map((item, itemIndex) => (
            <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/40">
            <span
              className={`block h-full bg-white ${itemIndex < index ? 'w-full' : itemIndex === index && story.kind !== 'video' ? 'w-full animate-[story-progress_linear]' : ''}`}
              style={itemIndex === index ? story.kind === 'video'
                ? { width: `${videoProgress}%` }
                : { animationDuration: `${duration}ms` } : undefined}
            />
            </span>
          ))}
        </div>
        <div className="z-10 flex items-center gap-2 px-4 pt-7">
          <Avatar src={story.author?.avatar_url} name={story.author?.display_name ?? 'Bondly member'} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{story.author?.display_name ?? 'Bondly member'}</p>
            <p className="text-xs text-white/70">{new Date(story.created_at).toLocaleString()}</p>
          </div>
          {isOwner && (
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onDelete(story); setBusy(false); }} className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Delete story">
              {busy ? <Spinner className="h-4 w-4" /> : <X size={17} />}
            </button>
          )}
        </div>
        {viewerError && <p role="alert" className="mx-4 mt-2 rounded-lg bg-error-400/90 px-3 py-2 text-xs">{viewerError}</p>}
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
          {!mediaUrl && story.media_path ? <Spinner className="h-10 w-10" /> : null}
          {mediaUrl && story.kind === 'image' && <img src={mediaUrl} alt={story.body ?? 'Shared story'} className="max-h-full max-w-full rounded-lg object-contain" />}
          {mediaUrl && story.kind === 'video' && (
            <video
              src={mediaUrl}
              autoPlay
              muted
              controls
              playsInline
              onEnded={next}
              onTimeUpdate={(event) => {
                const { currentTime, duration: videoDuration } = event.currentTarget;
                if (Number.isFinite(videoDuration) && videoDuration > 0) setVideoProgress((currentTime / videoDuration) * 100);
              }}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          )}
          {story.kind === 'text' && <p className="max-w-sm text-center text-2xl font-semibold leading-relaxed">{story.body}</p>}
          {story.kind !== 'text' && story.body && <p className="absolute bottom-5 left-5 right-5 rounded-xl bg-black/50 p-3 text-center text-sm">{story.body}</p>}
          <button type="button" onClick={previous} aria-label="Previous story" className="absolute left-2 top-1/2 rounded-full bg-black/40 p-2"><ChevronLeft size={22} /></button>
          <button type="button" onClick={next} aria-label="Next story" className="absolute right-2 top-1/2 rounded-full bg-black/40 p-2"><ChevronRight size={22} /></button>
        </div>
        {isOwner && (
          <div className="max-h-28 shrink-0 overflow-y-auto border-t border-white/15 px-4 py-2">
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-white/80"><Eye size={13} /> {viewers.length} viewer{viewers.length === 1 ? '' : 's'}</p>
            <div className="flex gap-3">
              {viewers.map((item) => <span key={item.viewer_id} className="flex items-center gap-1 text-xs text-white/80"><Avatar src={item.avatar_url} name={item.display_name} size="sm" />{item.display_name}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
