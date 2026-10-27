import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, MessageCircle, Repeat2, Send, ThumbsUp, Trash2, Users, Globe2, RefreshCw, Pencil, X } from 'lucide-react';
import { Avatar, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { Stories } from '../components/Stories';
import { useAuth } from '../context/useAuth';
import { supabase, formatSupabaseError } from '../lib/supabase';

type Post = {
  id: string;
  author_id: string;
  body: string | null;
  audience: 'discoverable' | 'connections';
  created_at: string;
  author: { display_name: string; avatar_url: string | null } | null;
  reaction_count: number;
  comment_count: number;
  liked_by_viewer: boolean;
  saved_by_viewer: boolean;
  repost_count: number;
  reposted_by_viewer: boolean;
  media: PostMedia[];
};

type PostMedia = {
  id: string;
  media_type: 'image' | 'video';
  media_path: string;
  alt_text: string;
  position: number;
  url: string;
};

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  author: { display_name: string; avatar_url: string | null } | null;
};

const POST_LIMIT = 30;
const MAX_MEDIA_FILES = 10;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const POST_BUCKET = 'bondly-posts';
const ALLOWED_POST_MEDIA = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm',
]);
const POST_MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

function getErrorMessage(error: unknown) {
  const message = formatSupabaseError(error);
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'PGRST205') {
    return 'A required Bondly social-content migration is missing. Apply the migrations listed in supabase/README.md in order, then refresh.';
  }
  return message;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function isValidPostMedia(files: File[]) {
  if (files.length > MAX_MEDIA_FILES) return false;
  if (files.some((file) => !ALLOWED_POST_MEDIA.has(file.type))) return false;
  if (files.some((file) => file.size > MAX_MEDIA_BYTES)) return false;
  if (files.some((file) => file.type.startsWith('video/')) && files.length > 1) return false;
  return true;
}

function DraftMediaPreview({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const nextUrls = files.map((file) => URL.createObjectURL(file));
    setUrls(nextUrls);
    return () => nextUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {files.map((file, index) => (
        <div key={`${file.name}-${file.lastModified}`} className="relative overflow-hidden rounded-xl border border-navy-50">
          {file.type.startsWith('video/')
            ? <video src={urls[index]} controls muted playsInline className="h-28 w-full bg-navy-900 object-contain" />
            : <img src={urls[index]} alt={`Upload preview ${index + 1}`} className="h-28 w-full object-cover" />}
          <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`} className="absolute right-1 top-1 rounded-full bg-navy-900/70 p-1 text-white"><X size={14} /></button>
          <p className="truncate px-2 py-1 text-xs text-muted">{file.name}</p>
        </div>
      ))}
    </div>
  );
}

function CommentBubble({ comment, onReply, allowReply = true }: { comment: Comment; onReply: () => void; allowReply?: boolean }) {
  return (
    <div className="flex gap-2">
      <Link to={`/app/profile/${comment.author_id}`} aria-label={`View ${comment.author?.display_name ?? 'member'} profile`}>
        <Avatar src={comment.author?.avatar_url} name={comment.author?.display_name ?? 'Bondly member'} size="sm" />
      </Link>
      <div className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link to={`/app/profile/${comment.author_id}`} className="text-xs font-semibold text-navy-800 hover:text-indigo-600">{comment.author?.display_name ?? 'Bondly member'}</Link>
          <span className="text-[11px] text-muted">{formatTime(comment.created_at)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-navy-700">{comment.body}</p>
        {allowReply && <button type="button" onClick={onReply} className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">Reply</button>}
      </div>
    </div>
  );
}

export function Feed() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<Record<string, Comment | null>>({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [audience, setAudience] = useState<Post['audience']>(
    profile?.discovery_enabled ? 'discoverable' : 'connections',
  );
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyPost, setBusyPost] = useState<string | null>(null);
  const postsLengthRef = useRef(0);

  const loadFeed = useCallback(async (append = false) => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const offset = append ? postsLengthRef.current : 0;
    const { data: rows, error: queryError } = await supabase
      .from('posts')
      .select('id, author_id, body, audience, created_at, author:profiles!posts_author_id_fkey(display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + POST_LIMIT - 1);

    if (queryError) {
      setError(getErrorMessage(queryError));
      if (!append) setPosts([]);
      if (!append) postsLengthRef.current = 0;
      setHasMore(false);
      setLoading(false);
      return;
    }

    const postRows = rows ?? [];
    setHasMore(postRows.length === POST_LIMIT);
    if (postRows.length === 0) {
      if (!append) setPosts([]);
      if (!append) postsLengthRef.current = 0;
      setLoading(false);
      return;
    }

    const postIds = postRows.map((post) => post.id);
    const [reactionResult, commentResult, savedResult, repostResult, mediaResult] = await Promise.all([
      supabase.from('post_reactions').select('post_id, user_id').in('post_id', postIds),
      supabase.from('post_comments').select('post_id').in('post_id', postIds),
      supabase.from('saved_posts').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      supabase.from('post_reposts').select('post_id, user_id').in('post_id', postIds),
      supabase.from('post_media').select('id, post_id, media_type, media_path, alt_text, position').in('post_id', postIds).order('position'),
    ]);

    const dataError = [reactionResult.error, commentResult.error, savedResult.error, repostResult.error, mediaResult.error].find(Boolean);
    if (dataError) {
      setError(getErrorMessage(dataError));
      setLoading(false);
      return;
    }

    const reactionRows = reactionResult.data ?? [];
    const commentRows = commentResult.data ?? [];
    const repostRows = repostResult.data ?? [];
    const mediaRows = mediaResult.data ?? [];
    const mediaPaths = mediaRows.map((media) => media.media_path);
    const { data: signedUrls, error: signedUrlError } = mediaPaths.length
      ? await supabase.storage.from(POST_BUCKET).createSignedUrls(mediaPaths, 3600)
      : { data: [], error: null };
    if (signedUrlError) {
      setError(getErrorMessage(signedUrlError));
      setLoading(false);
      return;
    }
    const signedUrlByPath = new Map((signedUrls ?? []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
    const savedIds = new Set((savedResult.data ?? []).map((item) => item.post_id));
    const loadedPosts = postRows.map((post) => {
      const reactions = reactionRows.filter((reaction) => reaction.post_id === post.id);
      return {
        ...post,
        author: Array.isArray(post.author) ? post.author[0] ?? null : post.author,
        reaction_count: reactions.length,
        comment_count: commentRows.filter((comment) => comment.post_id === post.id).length,
        liked_by_viewer: reactions.some((reaction) => reaction.user_id === profile.id),
        saved_by_viewer: savedIds.has(post.id),
        repost_count: repostRows.filter((repost) => repost.post_id === post.id).length,
        reposted_by_viewer: repostRows.some((repost) => repost.post_id === post.id && repost.user_id === profile.id),
        media: mediaRows.filter((media) => media.post_id === post.id).flatMap((media) => {
          const url = signedUrlByPath.get(media.media_path);
          return url ? [{ ...media, url }] : [];
        }),
      };
    });
    setPosts((current) => {
      const next = append
        ? [...current, ...loadedPosts.filter((post) => !current.some((item) => item.id === post.id))]
        : loadedPosts;
      postsLengthRef.current = next.length;
      return next;
    });
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const createPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || (!draft.trim() && draftFiles.length === 0) || posting) return;
    if (!isValidPostMedia(draftFiles)) return;
    setPosting(true);
    setError(null);
    setSuccess(null);
    const uploadedPaths: string[] = [];
    let postId: string | null = null;
    try {
      const { data: post, error: insertError } = await supabase.from('posts').insert({
        author_id: profile.id,
        body: draft.trim() || null,
        audience,
      }).select('id').single();
      if (insertError) throw insertError;
      postId = post.id;

      for (const [position, file] of draftFiles.entries()) {
        const path = `${profile.id}/${crypto.randomUUID()}.${POST_MEDIA_EXTENSIONS[file.type]}`;
        const { error: uploadError } = await supabase.storage.from(POST_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        const { error: mediaInsertError } = await supabase.from('post_media').insert({
          post_id: post.id,
          owner_id: profile.id,
          media_type: file.type.startsWith('image/') ? 'image' : 'video',
          media_path: path,
          position,
        });
        if (mediaInsertError) throw mediaInsertError;
      }

      setDraft('');
      setDraftFiles([]);
      setSuccess('Your post was published.');
      await loadFeed();
    } catch (createError) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from(POST_BUCKET).remove(uploadedPaths);
        if (cleanupError) setError(`${getErrorMessage(createError)} Uploaded media cleanup also failed: ${getErrorMessage(cleanupError)}`);
        else setError(getErrorMessage(createError));
      } else {
        setError(getErrorMessage(createError));
      }
      if (postId) {
        const { error: deleteError } = await supabase.from('posts').delete().eq('id', postId).eq('author_id', profile.id);
        if (deleteError) setError(`${getErrorMessage(createError)} The incomplete post could not be removed: ${getErrorMessage(deleteError)}`);
      }
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (post: Post) => {
    if (!profile || busyPost) return;
    setBusyPost(post.id);
    setError(null);
    const result = post.liked_by_viewer
      ? await supabase.from('post_reactions').delete().eq('post_id', post.id).eq('user_id', profile.id)
      : await supabase.from('post_reactions').insert({ post_id: post.id, user_id: profile.id });
    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      setPosts((current) => current.map((item) => item.id === post.id ? {
        ...item,
        liked_by_viewer: !post.liked_by_viewer,
        reaction_count: item.reaction_count + (post.liked_by_viewer ? -1 : 1),
      } : item));
    }
    setBusyPost(null);
  };

  const toggleSaved = async (post: Post) => {
    if (!profile || busyPost) return;
    setBusyPost(post.id);
    setError(null);
    const result = post.saved_by_viewer
      ? await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', profile.id)
      : await supabase.from('saved_posts').insert({ post_id: post.id, user_id: profile.id });
    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, saved_by_viewer: !post.saved_by_viewer }
        : item));
    }
    setBusyPost(null);
  };

  const toggleRepost = async (post: Post) => {
    if (!profile || busyPost) return;
    setBusyPost(post.id);
    setError(null);
    const result = post.reposted_by_viewer
      ? await supabase.from('post_reposts').delete().eq('post_id', post.id).eq('user_id', profile.id)
      : await supabase.from('post_reposts').insert({ post_id: post.id, user_id: profile.id });
    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      setPosts((current) => current.map((item) => item.id === post.id ? {
        ...item,
        reposted_by_viewer: !post.reposted_by_viewer,
        repost_count: item.repost_count + (post.reposted_by_viewer ? -1 : 1),
      } : item));
    }
    setBusyPost(null);
  };

  const savePostEdit = async (event: React.FormEvent<HTMLFormElement>, post: Post) => {
    event.preventDefault();
    if (!profile || !editDraft.trim() || busyPost) return;
    setBusyPost(post.id);
    setError(null);
    const { error: updateError } = await supabase.from('posts')
      .update({ body: editDraft.trim() })
      .eq('id', post.id)
      .eq('author_id', profile.id);
    if (updateError) {
      setError(getErrorMessage(updateError));
    } else {
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, body: editDraft.trim() } : item));
      setEditingPost(null);
    }
    setBusyPost(null);
  };

  const loadComments = async (postId: string) => {
    const { data, error: queryError } = await supabase
      .from('post_comments')
      .select('id, post_id, author_id, parent_id, body, created_at, author:profiles!post_comments_author_id_fkey(display_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (queryError) {
      setError(getErrorMessage(queryError));
      return;
    }
    setComments((current) => ({
      ...current,
      [postId]: (data ?? []).map((comment) => ({
        ...comment,
        author: Array.isArray(comment.author) ? comment.author[0] ?? null : comment.author,
      })),
    }));
  };

  const toggleComments = async (post: Post) => {
    const isOpen = !openComments[post.id];
    setOpenComments((current) => ({ ...current, [post.id]: isOpen }));
    if (isOpen) await loadComments(post.id);
  };

  const createComment = async (event: React.FormEvent<HTMLFormElement>, post: Post, parentId: string | null = null) => {
    event.preventDefault();
    const body = commentDrafts[post.id]?.trim();
    if (!profile || !body || busyPost) return;
    setBusyPost(post.id);
    setError(null);
    const { error: insertError } = await supabase.from('post_comments').insert({
      post_id: post.id,
      author_id: profile.id,
      body,
      parent_id: parentId,
    });
    if (insertError) {
      setError(getErrorMessage(insertError));
    } else {
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
      setReplyingTo((current) => ({ ...current, [post.id]: null }));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item));
      await loadComments(post.id);
    }
    setBusyPost(null);
  };

  const deletePost = async (post: Post) => {
    if (!window.confirm('Delete this post? This also deletes its comments and reactions.')) return;
    setBusyPost(post.id);
    setError(null);
    const mediaPaths = post.media.map((media) => media.media_path);
    const { error: deleteError } = await supabase.from('posts').delete().eq('id', post.id).eq('author_id', profile?.id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
    } else {
      setPosts((current) => current.filter((item) => item.id !== post.id));
      postsLengthRef.current = Math.max(0, postsLengthRef.current - 1);
      if (mediaPaths.length) {
        const { error: storageError } = await supabase.storage.from(POST_BUCKET).remove(mediaPaths);
        if (storageError) setError(`Post deleted, but its media could not be removed from storage: ${getErrorMessage(storageError)}`);
      }
    }
    setBusyPost(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Community feed"
        subtitle="Share updates with your connections and discoverable community."
        action={<Button variant="secondary" size="sm" onClick={() => void loadFeed()} disabled={loading}><RefreshCw size={14} /> Refresh</Button>}
      />

      {error && <div role="alert" className="mb-4 rounded-xl border border-error-100 bg-error-50 px-4 py-3 text-sm text-error-400">{error}</div>}
      {success && <div role="status" className="mb-4 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-500">{success}</div>}

      <Stories />

      <Card className="mb-5 p-4 sm:p-5">
        <form onSubmit={createPost}>
          <label htmlFor="post-body" className="mb-2 block text-sm font-semibold text-navy-800">Share an update</label>
          <textarea
            id="post-body"
            className="input-field min-h-28 resize-y"
            maxLength={5000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What are you interested in, working on, or thinking about?"
          />
          <label className="mt-3 block text-sm font-medium text-navy-700">
            Add up to {MAX_MEDIA_FILES} photos, or one video (50 MB max each)
            <input
              className="input-field mt-1"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length && !isValidPostMedia(files)) {
                  setError('Choose up to 10 supported image files, or a single MP4/WebM video. Each file must be 50 MB or smaller.');
                  event.target.value = '';
                  setDraftFiles([]);
                  return;
                }
                setError(null);
                setDraftFiles(files);
              }}
            />
          </label>
          {draftFiles.length > 0 && <DraftMediaPreview files={draftFiles} onRemove={(index) => setDraftFiles((current) => current.filter((_, fileIndex) => index !== fileIndex))} />}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-navy-600">
              <span className="sr-only">Who can see this post?</span>
              <select className="input-field py-2" value={audience} onChange={(event) => setAudience(event.target.value as Post['audience'])}>
                <option value="discoverable" disabled={!profile?.discovery_enabled}>Discoverable community</option>
                <option value="connections">My connections</option>
              </select>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">{draft.length}/5000</span>
              <Button type="submit" size="sm" disabled={posting || (!draft.trim() && draftFiles.length === 0)}>
                <Send size={14} /> {posting ? 'Publishing…' : 'Post'}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {loading && posts.length === 0 ? (
        <div className="flex h-40 items-center justify-center"><Spinner className="w-8 h-8" /></div>
      ) : posts.length === 0 ? (
        <Card><EmptyState icon={<MessageCircle size={28} />} title="Your feed is ready" description="Be the first to share an update, or check back when your community posts." /></Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Link to={`/app/profile/${post.author_id}`} aria-label={`View ${post.author?.display_name ?? 'member'} profile`}>
                  <Avatar src={post.author?.avatar_url} name={post.author?.display_name ?? 'Bondly member'} size="md" />
                </Link>
                <div className="min-w-0 flex-1">
                  {post.repost_count > 0 && <p className="mb-1 flex items-center gap-1 text-xs text-muted"><Repeat2 size={12} />Shared {post.repost_count} time{post.repost_count === 1 ? '' : 's'}</p>}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link to={`/app/profile/${post.author_id}`} className="font-semibold text-navy-900 hover:text-indigo-600">{post.author?.display_name ?? 'Bondly member'}</Link>
                    <span className="text-xs text-muted">{formatTime(post.created_at)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-xs text-navy-600">
                      {post.audience === 'connections' ? <Users size={12} /> : <Globe2 size={12} />}
                      {post.audience === 'connections' ? 'Connections' : 'Discoverable'}
                    </span>
                    {post.author_id === profile?.id && (
                      <div className="ml-auto flex gap-1">
                        <button
                          type="button"
                          aria-label="Edit post"
                          className="rounded-lg p-2 text-muted hover:bg-indigo-50 hover:text-indigo-600"
                          onClick={() => { setEditingPost(post.id); setEditDraft(post.body ?? ''); }}
                          disabled={busyPost === post.id}
                        ><Pencil size={15} /></button>
                        <button
                          type="button"
                          aria-label="Delete post"
                          className="rounded-lg p-2 text-muted hover:bg-error-50 hover:text-error-400"
                          onClick={() => void deletePost(post)}
                          disabled={busyPost === post.id}
                        ><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                  {editingPost === post.id ? (
                    <form className="mt-3 space-y-2" onSubmit={(event) => void savePostEdit(event, post)}>
                      <textarea autoFocus maxLength={5000} className="input-field min-h-24 resize-y" value={editDraft} onChange={(event) => setEditDraft(event.target.value)} />
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingPost(null)}><X size={14} /> Cancel</Button>
                        <Button type="submit" size="sm" disabled={busyPost === post.id || !editDraft.trim()}><Pencil size={14} /> Save edit</Button>
                      </div>
                    </form>
                  ) : post.body && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-navy-700">{post.body}</p>}
                </div>
              </div>
              {post.media.length > 0 && (
                <div className={`mt-4 grid gap-1 overflow-hidden rounded-xl ${post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {post.media.map((media) => media.media_type === 'video' ? (
                    <video key={media.id} src={media.url} controls playsInline className="max-h-[520px] w-full bg-navy-900 object-contain" />
                  ) : (
                    <img key={media.id} src={media.url} alt={media.alt_text || `Photo shared by ${post.author?.display_name ?? 'a member'}`} className={`w-full object-cover ${post.media.length === 1 ? 'max-h-[520px]' : 'aspect-square'}`} />
                  ))}
                </div>
              )}
              <div className="mt-4 flex gap-2 border-t border-navy-50 pt-3">
                <button
                  type="button"
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${post.liked_by_viewer ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-navy-600 hover:bg-navy-50'}`}
                  onClick={() => void toggleLike(post)}
                  disabled={busyPost === post.id}
                ><ThumbsUp size={16} /> {post.liked_by_viewer ? 'Liked' : 'Like'} · {post.reaction_count}</button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-600 hover:bg-navy-50"
                  onClick={() => void toggleComments(post)}
                ><MessageCircle size={16} /> Comments · {post.comment_count}</button>
                <button type="button" className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${post.reposted_by_viewer ? 'bg-success-50 font-medium text-success-500' : 'text-navy-600 hover:bg-navy-50'}`} onClick={() => void toggleRepost(post)} disabled={busyPost === post.id}>
                  <Repeat2 size={16} /> {post.reposted_by_viewer ? 'Shared' : 'Share'} · {post.repost_count}
                </button>
                <button type="button" aria-label={post.saved_by_viewer ? 'Remove saved post' : 'Save post'} className={`ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${post.saved_by_viewer ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-navy-600 hover:bg-navy-50'}`} onClick={() => void toggleSaved(post)} disabled={busyPost === post.id}>
                  <Bookmark size={16} /> {post.saved_by_viewer ? 'Saved' : 'Save'}
                </button>
              </div>
              {openComments[post.id] && (
                <div className="mt-2 space-y-3 border-t border-navy-50 pt-4">
                  {(comments[post.id] ?? []).filter((comment) => !comment.parent_id).map((comment) => (
                    <div key={comment.id} className="space-y-2">
                      <CommentBubble comment={comment} onReply={() => setReplyingTo((current) => ({ ...current, [post.id]: comment }))} />
                      {(comments[post.id] ?? []).filter((reply) => reply.parent_id === comment.id).map((reply) => (
                        <div key={reply.id} className="ml-8"><CommentBubble comment={reply} allowReply={false} onReply={() => setReplyingTo((current) => ({ ...current, [post.id]: comment }))} /></div>
                      ))}
                    </div>
                  ))}
                  {replyingTo[post.id] && (
                    <p className="text-xs text-muted">Replying to {replyingTo[post.id]?.author?.display_name ?? 'member'}
                      <button type="button" className="ml-2 text-indigo-600" onClick={() => setReplyingTo((current) => ({ ...current, [post.id]: null }))}>Cancel reply</button>
                    </p>
                  )}
                  <form className="flex gap-2" onSubmit={(event) => void createComment(event, post, replyingTo[post.id]?.id ?? null)}>
                    <input
                      className="input-field min-w-0 flex-1"
                      maxLength={2000}
                      value={commentDrafts[post.id] ?? ''}
                      onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                      placeholder={replyingTo[post.id] ? 'Write a reply...' : 'Write a comment...'}
                      aria-label="Write a comment"
                      required
                    />
                    <Button type="submit" size="sm" disabled={busyPost === post.id || !commentDrafts[post.id]?.trim()}><Send size={14} /><span className="sr-only">Send comment</span></Button>
                  </form>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {hasMore && (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={() => void loadFeed(true)} disabled={loading}><RefreshCw size={14} /> {loading ? 'Loading…' : 'Load more posts'}</Button>
        </div>
      )}
    </div>
  );
}
