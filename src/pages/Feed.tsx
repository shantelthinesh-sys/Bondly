import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Send, ThumbsUp, Trash2, Users, Globe2, RefreshCw } from 'lucide-react';
import { Avatar, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { supabase, formatSupabaseError } from '../lib/supabase';

type Post = {
  id: string;
  author_id: string;
  body: string;
  audience: 'discoverable' | 'connections';
  created_at: string;
  author: { display_name: string; avatar_url: string | null } | null;
  reaction_count: number;
  comment_count: number;
  liked_by_viewer: boolean;
};

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { display_name: string; avatar_url: string | null } | null;
};

const POST_LIMIT = 30;

function getErrorMessage(error: unknown) {
  const message = formatSupabaseError(error);
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'PGRST205') {
    return 'The social feed database migration has not been applied yet. Run supabase/migrations/20261028200000_phase2_social_feed.sql in the Supabase SQL Editor.';
  }
  return message;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function Feed() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [audience, setAudience] = useState<Post['audience']>('discoverable');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyPost, setBusyPost] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const { data: rows, error: queryError } = await supabase
      .from('posts')
      .select('id, author_id, body, audience, created_at, author:profiles!posts_author_id_fkey(display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(POST_LIMIT);

    if (queryError) {
      setError(getErrorMessage(queryError));
      setPosts([]);
      setLoading(false);
      return;
    }

    const postRows = rows ?? [];
    if (postRows.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const postIds = postRows.map((post) => post.id);
    const [reactionResult, commentResult] = await Promise.all([
      supabase.from('post_reactions').select('post_id, user_id').in('post_id', postIds),
      supabase.from('post_comments').select('post_id').in('post_id', postIds),
    ]);

    if (reactionResult.error || commentResult.error) {
      setError(getErrorMessage(reactionResult.error ?? commentResult.error));
      setLoading(false);
      return;
    }

    const reactionRows = reactionResult.data ?? [];
    const commentRows = commentResult.data ?? [];
    setPosts(postRows.map((post) => {
      const reactions = reactionRows.filter((reaction) => reaction.post_id === post.id);
      return {
        ...post,
        author: Array.isArray(post.author) ? post.author[0] ?? null : post.author,
        reaction_count: reactions.length,
        comment_count: commentRows.filter((comment) => comment.post_id === post.id).length,
        liked_by_viewer: reactions.some((reaction) => reaction.user_id === profile.id),
      };
    }));
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const createPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || !draft.trim() || posting) return;
    setPosting(true);
    setError(null);
    setSuccess(null);
    const { error: insertError } = await supabase.from('posts').insert({
      author_id: profile.id,
      body: draft.trim(),
      audience,
    });
    setPosting(false);
    if (insertError) {
      setError(getErrorMessage(insertError));
      return;
    }
    setDraft('');
    setSuccess('Your post was published.');
    await loadFeed();
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

  const loadComments = async (postId: string) => {
    const { data, error: queryError } = await supabase
      .from('post_comments')
      .select('id, post_id, author_id, body, created_at, author:profiles!post_comments_author_id_fkey(display_name, avatar_url)')
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

  const createComment = async (event: React.FormEvent<HTMLFormElement>, post: Post) => {
    event.preventDefault();
    const body = commentDrafts[post.id]?.trim();
    if (!profile || !body || busyPost) return;
    setBusyPost(post.id);
    setError(null);
    const { error: insertError } = await supabase.from('post_comments').insert({
      post_id: post.id,
      author_id: profile.id,
      body,
    });
    if (insertError) {
      setError(getErrorMessage(insertError));
    } else {
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item));
      await loadComments(post.id);
    }
    setBusyPost(null);
  };

  const deletePost = async (post: Post) => {
    if (!window.confirm('Delete this post? This also deletes its comments and reactions.')) return;
    setBusyPost(post.id);
    setError(null);
    const { error: deleteError } = await supabase.from('posts').delete().eq('id', post.id).eq('author_id', profile?.id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
    } else {
      setPosts((current) => current.filter((item) => item.id !== post.id));
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
            required
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-navy-600">
              <span className="sr-only">Who can see this post?</span>
              <select className="input-field py-2" value={audience} onChange={(event) => setAudience(event.target.value as Post['audience'])}>
                <option value="discoverable">Discoverable community</option>
                <option value="connections">My connections</option>
              </select>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">{draft.length}/5000</span>
              <Button type="submit" size="sm" disabled={posting || !draft.trim()}>
                <Send size={14} /> {posting ? 'Publishing…' : 'Post'}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Spinner className="w-8 h-8" /></div>
      ) : posts.length === 0 ? (
        <Card><EmptyState icon={<MessageCircle size={28} />} title="Your feed is ready" description="Be the first to share an update, or check back when your community posts." /></Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Avatar src={post.author?.avatar_url} name={post.author?.display_name ?? 'Bondly member'} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-navy-900">{post.author?.display_name ?? 'Bondly member'}</span>
                    <span className="text-xs text-muted">{formatTime(post.created_at)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-xs text-navy-600">
                      {post.audience === 'connections' ? <Users size={12} /> : <Globe2 size={12} />}
                      {post.audience === 'connections' ? 'Connections' : 'Discoverable'}
                    </span>
                    {post.author_id === profile?.id && (
                      <button
                        type="button"
                        aria-label="Delete post"
                        className="ml-auto rounded-lg p-2 text-muted hover:bg-error-50 hover:text-error-400"
                        onClick={() => void deletePost(post)}
                        disabled={busyPost === post.id}
                      ><Trash2 size={15} /></button>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-navy-700">{post.body}</p>
                </div>
              </div>
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
              </div>
              {openComments[post.id] && (
                <div className="mt-2 space-y-3 border-t border-navy-50 pt-4">
                  {(comments[post.id] ?? []).map((comment) => (
                    <div key={comment.id} className="flex gap-2">
                      <Avatar src={comment.author?.avatar_url} name={comment.author?.display_name ?? 'Bondly member'} size="sm" />
                      <div className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-xs font-semibold text-navy-800">{comment.author?.display_name ?? 'Bondly member'}</span>
                          <span className="text-[11px] text-muted">{formatTime(comment.created_at)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-navy-700">{comment.body}</p>
                      </div>
                    </div>
                  ))}
                  <form className="flex gap-2" onSubmit={(event) => void createComment(event, post)}>
                    <input
                      className="input-field min-w-0 flex-1"
                      maxLength={2000}
                      value={commentDrafts[post.id] ?? ''}
                      onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                      placeholder="Write a comment..."
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
    </div>
  );
}
