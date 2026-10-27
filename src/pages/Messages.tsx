import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, AudioLines, Check, CheckCheck, ChevronDown, CirclePlus, ImagePlus,
  MessageCircle, MoreHorizontal, Paperclip, Phone, Search, Send, Smile, Trash2,
  UserPlus, Users, Video, X,
} from 'lucide-react';
import { Avatar, Button, Card, EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { formatSupabaseError, supabase } from '../lib/supabase';

type UserSummary = { id: string; display_name: string; username: string | null; avatar_url: string | null };
type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'post' | 'profile';
  attachment_path: string | null;
  shared_post_id: string | null;
  shared_profile_id: string | null;
  reply_to: string | null;
  deleted_at: string | null;
  edited_at: string | null;
  created_at: string;
  sender: UserSummary | null;
  url?: string;
  reactions: { emoji: string; user_id: string }[];
};

type RequestState = { conversation_id: string; sender_id: string; recipient_id: string; status: 'pending' | 'accepted' | 'rejected' };
type ConversationMember = { conversation_id: string; user_id: string; role: 'member' | 'admin'; last_read_at: string; archived_at: string | null; muted_until: string | null; profile: UserSummary | null };
type ChatConversation = {
  id: string;
  kind: 'direct' | 'group';
  name: string | null;
  avatar_path: string | null;
  avatarUrl?: string;
  created_by: string;
  members: ConversationMember[];
  lastMessage: ChatMessage | null;
  unread: number;
  request: RequestState | null;
};
type CallSession = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  mode: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};
type CallView = {
  session: CallSession;
  peer: UserSummary;
  incoming: boolean;
  status: 'incoming' | 'calling' | 'connecting' | 'connected' | 'reconnecting';
  startedAt: number | null;
};
type ShareablePost = { id: string; body: string | null; created_at: string };

const MEDIA_BUCKET = 'bondly-messages';
const PAGE_SIZE = 40;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MESSAGE_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
const ALLOWED_MEDIA = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'audio/webm', 'audio/ogg', 'audio/mp4',
]);

function messageError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'PGRST205' || error.code === '42P01')) {
    return 'Messaging is not configured in Supabase yet. Apply the migrations in supabase/README.md, then refresh.';
  }
  return formatSupabaseError(error);
}

function formatChatTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function normalizeProfile(value: UserSummary | UserSummary[] | null): UserSummary | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fileKind(file: File): ChatMessage['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'audio';
}

export function Messages() {
  const { profile } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [people, setPeople] = useState<UserSummary[]>([]);
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPhoto, setGroupPhoto] = useState<File | null>(null);
  const [groupMembers, setGroupMembers] = useState<UserSummary[]>([]);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showSharePosts, setShowSharePosts] = useState(false);
  const [shareablePosts, setShareablePosts] = useState<ShareablePost[]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<CallView | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [callMuted, setCallMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);
  const [callClock, setCallClock] = useState(Date.now());
  const [olderMessages, setOlderMessages] = useState(true);
  const inboxEndRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<CallView | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const missedCallTimerRef = useRef<number | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const startedDirectForRef = useRef<string | null>(null);

  const selected = conversations.find((item) => item.id === conversationId) ?? null;
  const currentUserId = profile?.id;
  const counterpart = selected?.kind === 'direct'
    ? selected.members.find((member) => member.user_id !== currentUserId)?.profile ?? null
    : null;
  const requestBlocksComposer = Boolean(selected?.request && (
    selected.request.status === 'rejected'
    || (selected.request.status === 'pending' && selected.request.recipient_id === currentUserId)
  ));

  const cleanupCall = useCallback(() => {
    if (missedCallTimerRef.current !== null) window.clearTimeout(missedCallTimerRef.current);
    missedCallTimerRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallMuted(false);
    setCameraEnabled(true);
    pendingIceRef.current = [];
  }, []);

  const loadInbox = useCallback(async () => {
    if (!profile) return;
    setLoadingInbox(true);
    setError(null);
    try {
      const { data: membershipRows, error: membershipError } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id, role, last_read_at, archived_at, muted_until, profile:profiles!conversation_members_user_id_fkey(id, display_name, username, avatar_url)')
        .eq('user_id', profile.id)
        .order('joined_at', { ascending: false });
      if (membershipError) throw membershipError;
      const memberships: ConversationMember[] = (membershipRows ?? []).map((member) => ({
        ...member,
        profile: normalizeProfile(member.profile as UserSummary | UserSummary[] | null),
      }));
      if (!memberships.length) {
        setConversations([]);
        setLoadingInbox(false);
        return;
      }

      const ids = [...new Set(memberships.map((member) => member.conversation_id))];
      const [conversationResult, messageResult, requestResult] = await Promise.all([
        supabase.from('conversations').select('id, kind, name, avatar_path, created_by').in('id', ids),
        supabase.from('messages')
          .select('id, conversation_id, sender_id, body, kind, attachment_path, shared_post_id, shared_profile_id, reply_to, deleted_at, edited_at, created_at, sender:profiles!messages_sender_id_fkey(id, display_name, username, avatar_url)')
          .in('conversation_id', ids).order('created_at', { ascending: false }).limit(1000),
        supabase.from('message_requests').select('conversation_id, sender_id, recipient_id, status').in('conversation_id', ids),
      ]);
      const secondaryError = conversationResult.error ?? messageResult.error ?? requestResult.error;
      if (secondaryError) throw secondaryError;
      const rows = (messageResult.data ?? []).map((message) => ({
        ...message,
        sender: normalizeProfile(message.sender as UserSummary | UserSummary[] | null),
        reactions: [],
      })) as ChatMessage[];
      const requestByConversation = new Map((requestResult.data ?? []).map((request) => [request.conversation_id, request as RequestState]));
      const latestByConversation = new Map<string, ChatMessage>();
      const unreadByConversation = new Map<string, number>();
      const ownMembership = new Map(memberships.map((member) => [member.conversation_id, member]));
      rows.forEach((message) => {
        if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message);
        const membership = ownMembership.get(message.conversation_id);
        if (membership && message.sender_id !== profile.id && message.created_at > membership.last_read_at) {
          unreadByConversation.set(message.conversation_id, (unreadByConversation.get(message.conversation_id) ?? 0) + 1);
        }
      });
      const memberGroups = memberships.reduce<Record<string, ConversationMember[]>>((groups, member) => {
        groups[member.conversation_id] = [...(groups[member.conversation_id] ?? []), member];
        return groups;
      }, {});
      const avatarPaths = (conversationResult.data ?? []).flatMap((conversation) => conversation.avatar_path ? [conversation.avatar_path] : []);
      const { data: avatarUrls, error: avatarError } = avatarPaths.length
        ? await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(avatarPaths, 3600)
        : { data: [], error: null };
      if (avatarError) throw avatarError;
      const avatarUrlByPath = new Map((avatarUrls ?? []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
      const loaded = (conversationResult.data ?? []).map((conversation) => ({
        ...conversation,
        avatarUrl: conversation.avatar_path ? avatarUrlByPath.get(conversation.avatar_path) : undefined,
        members: memberGroups[conversation.id] ?? [],
        lastMessage: latestByConversation.get(conversation.id) ?? null,
        unread: unreadByConversation.get(conversation.id) ?? 0,
        request: requestByConversation.get(conversation.id) ?? null,
      })) as ChatConversation[];
      loaded.sort((left, right) => (right.lastMessage?.created_at ?? '').localeCompare(left.lastMessage?.created_at ?? ''));
      setConversations(loaded);
    } catch (loadError) {
      setError(messageError(loadError));
    } finally {
      setLoadingInbox(false);
    }
  }, [profile]);

  const loadMessages = useCallback(async (id: string, olderThan?: string) => {
    setLoadingMessages(true);
    try {
      let query = supabase.from('messages')
        .select('id, conversation_id, sender_id, body, kind, attachment_path, shared_post_id, shared_profile_id, reply_to, deleted_at, edited_at, created_at, sender:profiles!messages_sender_id_fkey(id, display_name, username, avatar_url)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (olderThan) query = query.lt('created_at', olderThan);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      const rows = data ?? [];
      setOlderMessages(rows.length === PAGE_SIZE);
      const paths = rows.flatMap((message) => message.attachment_path ? [message.attachment_path] : []);
      const signed = paths.length
        ? await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600)
        : { data: [], error: null };
      if (signed.error) throw signed.error;
      const urlByPath = new Map((signed.data ?? []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
      const messageIds = rows.map((message) => message.id);
      const { data: reactionRows, error: reactionError } = messageIds.length
        ? await supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', messageIds)
        : { data: [], error: null };
      if (reactionError) throw reactionError;
      const mapped = rows.map((message) => ({
        ...message,
        sender: normalizeProfile(message.sender as UserSummary | UserSummary[] | null),
        url: message.attachment_path ? urlByPath.get(message.attachment_path) : undefined,
        reactions: (reactionRows ?? []).filter((item) => item.message_id === message.id).map((item) => ({ emoji: item.emoji, user_id: item.user_id })),
      })) as ChatMessage[];
      setMessages((current) => olderThan
        ? [...mapped.reverse(), ...current.filter((item) => !mapped.some((newItem) => newItem.id === item.id))]
        : mapped.reverse());
    } catch (loadError) {
      setError(messageError(loadError));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const loadCallHistory = useCallback(async (id: string) => {
    const { data, error: queryError } = await supabase.from('call_sessions')
      .select('id, conversation_id, caller_id, callee_id, mode, status, created_at, answered_at, ended_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (queryError) setError(messageError(queryError));
    else setCallHistory((data ?? []) as CallSession[]);
  }, []);

  const sendCallSignal = useCallback(async (
    session: CallSession,
    recipientId: string,
    signalType: 'offer' | 'answer' | 'ice' | 'reject' | 'hangup',
    payload: object = {},
  ) => {
    const { error: signalError } = await supabase.from('call_signals').insert({
      call_id: session.id,
      sender_id: profile?.id,
      recipient_id: recipientId,
      signal_type: signalType,
      payload,
    });
    if (signalError) setError(`Call signaling failed: ${messageError(signalError)}`);
  }, [profile?.id]);

  const makePeerConnection = useCallback(async (
    session: CallSession,
    otherUserId: string,
    stream: MediaStream,
  ) => {
    let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    const { data, error: turnError } = await supabase.functions.invoke('bondly-turn', { body: {} });
    if (!turnError && Array.isArray(data?.iceServers)) {
      iceServers = data.iceServers as RTCIceServer[];
    } else {
      setError('TURN credentials are not configured. This call can connect only if both networks allow direct STUN connections.');
    }

    const peer = new RTCPeerConnection({ iceServers });
    peerConnectionRef.current = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      const [incoming] = event.streams;
      if (incoming) setRemoteStream(incoming);
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void sendCallSignal(session, otherUserId, 'ice', event.candidate.toJSON());
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setActiveCall((current) => current ? { ...current, status: 'connected', startedAt: current.startedAt ?? Date.now() } : current);
      } else if (peer.connectionState === 'disconnected') {
        setActiveCall((current) => current ? { ...current, status: 'reconnecting' } : current);
      } else if (peer.connectionState === 'failed') {
        setError('Call connection failed. Check your network and TURN configuration.');
        setActiveCall((current) => current ? { ...current, status: 'reconnecting' } : current);
      }
    };
    return peer;
  }, [sendCallSignal]);

  const flushPendingIce = async (peer: RTCPeerConnection) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) await peer.addIceCandidate(candidate);
  };

  const startCall = async (mode: 'audio' | 'video') => {
    if (!profile || !selected || selected.kind !== 'direct' || !counterpart) return;
    if (activeCallRef.current) {
      setError('Finish the active call before starting another.');
      return;
    }
    if (selected.request?.status === 'pending') {
      setError('Accept the message request before starting a call.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Audio/video calling is not supported by this browser. Use HTTPS and a supported browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const { data: sessionData, error: callError } = await supabase.from('call_sessions').insert({
        conversation_id: selected.id,
        caller_id: profile.id,
        callee_id: counterpart.id,
        mode,
        status: 'ringing',
      }).select('id, conversation_id, caller_id, callee_id, mode, status, created_at, answered_at, ended_at').single();
      if (callError) throw callError;
      const callSession = sessionData as CallSession;
      setActiveCall({ session: callSession, peer: counterpart, incoming: false, status: 'calling', startedAt: null });
      await loadCallHistory(selected.id);
      const peer = await makePeerConnection(callSession, counterpart.id, stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendCallSignal(callSession, counterpart.id, 'offer', { type: offer.type, sdp: offer.sdp });
    } catch (callError) {
      cleanupCall();
      setActiveCall(null);
      setError(callError instanceof Error ? callError.message : 'Unable to start the call.');
    }
  };

  const acceptCall = async () => {
    if (!activeCall?.incoming || !profile) return;
    try {
      const session = activeCall.session;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: session.mode === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const peer = await makePeerConnection(session, session.caller_id, stream);
      const { data: offers, error: offerError } = await supabase.from('call_signals')
        .select('signal_type, payload').eq('call_id', session.id).in('signal_type', ['offer', 'ice']).order('created_at', { ascending: true });
      if (offerError) throw offerError;
      const offer = offers?.find((item) => item.signal_type === 'offer')?.payload as RTCSessionDescriptionInit | undefined;
      if (!offer?.sdp) throw new Error('The caller’s offer was not received. Ask them to call again.');
      pendingIceRef.current.push(...(offers ?? [])
        .filter((item) => item.signal_type === 'ice')
        .map((item) => item.payload as RTCIceCandidateInit));
      await peer.setRemoteDescription(offer);
      await flushPendingIce(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      const { error: updateError } = await supabase.from('call_sessions')
        .update({ status: 'accepted', answered_at: new Date().toISOString() }).eq('id', session.id);
      if (updateError) throw updateError;
      await sendCallSignal(session, session.caller_id, 'answer', { type: answer.type, sdp: answer.sdp });
      setActiveCall((current) => current ? { ...current, status: 'connecting' } : current);
    } catch (callError) {
      cleanupCall();
      setActiveCall(null);
      setError(callError instanceof Error ? callError.message : 'Unable to accept the call.');
    }
  };

  const finishCall = useCallback(async (status: 'rejected' | 'ended' | 'missed' = 'ended') => {
    const current = activeCall;
    if (!current) return;
    cleanupCall();
    setActiveCall(null);
    const peerId = current.incoming ? current.session.caller_id : current.session.callee_id;
    const { error: updateError } = await supabase.from('call_sessions')
      .update({ status, ended_at: new Date().toISOString() }).eq('id', current.session.id);
    if (updateError) setError(messageError(updateError));
    await sendCallSignal(current.session, peerId, status === 'rejected' ? 'reject' : 'hangup');
    await loadCallHistory(current.session.conversation_id);
  }, [activeCall, cleanupCall, loadCallHistory, sendCallSignal]);

  const startDirect = useCallback(async (targetUserId: string) => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('start_direct_conversation', { other_user: targetUserId });
    if (rpcError) {
      setError(messageError(rpcError));
      return;
    }
    await loadInbox();
    navigate(`/app/messages/${data}`);
    setShowNewMessage(false);
    setPersonSearch('');
    setPeople([]);
  }, [loadInbox, navigate]);

  const saveEdit = async () => {
    if (!editing || !conversationId) return;
    const { error: editError } = await supabase.rpc('edit_chat_message', { target_message: editing.id, new_body: editDraft });
    if (editError) setError(messageError(editError));
    else {
      setEditing(null);
      await loadMessages(conversationId);
    }
  };

  useEffect(() => { void loadInbox(); }, [loadInbox]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`message-inbox:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void loadInbox())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError('Inbox live updates are unavailable. Refresh to reconnect.');
      });
    return () => { void supabase.removeChannel(channel); };
  }, [loadInbox, profile]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(conversationId);
    void supabase.rpc('mark_conversation_read', { target_conversation: conversationId });
    const channel = supabase.channel(`messages:${conversationId}`, { config: { private: true } })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}`,
      }, (event) => {
        const newMessage = event.new as { sender_id: string };
        void loadMessages(conversationId);
        void loadInbox();
        if (newMessage.sender_id !== currentUserId) {
          void supabase.rpc('mark_conversation_read', { target_conversation: conversationId });
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'message_reactions',
      }, () => void loadMessages(conversationId))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}`,
      }, () => void loadInbox())
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === currentUserId) return;
        const name = typeof payload.name === 'string' ? payload.name : 'Someone';
        setTypingNames((current) => current.includes(name) ? current : [...current, name]);
        window.setTimeout(() => setTypingNames((current) => current.filter((value) => value !== name)), 2500);
      })
      .on('presence', { event: 'sync' }, () => {
        setOnlineUserIds(Object.keys(channel.presenceState()));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && profile) {
          const presenceStatus = await channel.track({
            user_id: profile.id,
            display_name: profile.display_name,
            online_at: new Date().toISOString(),
          });
          if (presenceStatus !== 'ok') setError('Online presence could not be shared with this conversation.');
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError('Live chat connection failed. Refresh to reconnect.');
      });
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      setOnlineUserIds([]);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, loadInbox, loadMessages, profile]);

  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`call-inbox:${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${profile.id}`,
      }, async (event) => {
        const session = event.new as CallSession;
        if (session.status !== 'ringing') return;
        if (activeCallRef.current) {
          await supabase.from('call_sessions').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', session.id);
          return;
        }
        const { data: caller, error: callerError } = await supabase.from('profiles')
          .select('id, display_name, username, avatar_url').eq('id', session.caller_id).maybeSingle();
        if (callerError) {
          setError(messageError(callerError));
          return;
        }
        if (!caller) return;
        const callView: CallView = { session, peer: caller as UserSummary, incoming: true, status: 'incoming', startedAt: null };
        activeCallRef.current = callView;
        setActiveCall(callView);
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'call_signals', filter: `recipient_id=eq.${profile.id}`,
      }, async (event) => {
        const signal = event.new as { call_id: string; signal_type: string; payload: RTCSessionDescriptionInit | RTCIceCandidateInit };
        const currentCall = activeCallRef.current;
        if (!currentCall || currentCall.session.id !== signal.call_id) return;
        const peer = peerConnectionRef.current;
        try {
          if (signal.signal_type === 'answer' && peer && !peer.currentRemoteDescription) {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            await flushPendingIce(peer);
            setActiveCall((current) => current ? { ...current, status: 'connecting' } : current);
          } else if (signal.signal_type === 'ice') {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (peer?.remoteDescription) await peer.addIceCandidate(candidate);
            else pendingIceRef.current.push(candidate);
          } else if (signal.signal_type === 'reject' || signal.signal_type === 'hangup') {
            cleanupCall();
            activeCallRef.current = null;
            setActiveCall(null);
            await loadCallHistory(currentCall.session.conversation_id);
          }
        } catch (signalError) {
          setError(signalError instanceof Error ? signalError.message : 'Call signaling failed.');
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError('Call notification connection failed. Keep the Messages page open and reconnect.');
      });
    return () => { void supabase.removeChannel(channel); };
  }, [cleanupCall, loadCallHistory, profile]);

  useEffect(() => {
    if (!activeCall || (activeCall.status !== 'incoming' && activeCall.status !== 'calling')) return;
    missedCallTimerRef.current = window.setTimeout(() => { void finishCall('missed'); }, 45000);
    return () => {
      if (missedCallTimerRef.current !== null) window.clearTimeout(missedCallTimerRef.current);
      missedCallTimerRef.current = null;
    };
  }, [activeCall, finishCall]);

  useEffect(() => {
    if (!activeCall?.startedAt) return;
    const timer = window.setInterval(() => setCallClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.startedAt]);

  useEffect(() => {
    if (!conversationId) {
      setCallHistory([]);
      return;
    }
    void loadCallHistory(conversationId);
  }, [conversationId, loadCallHistory]);

  useEffect(() => () => {
    const call = activeCallRef.current;
    if (call) {
      const peerId = call.incoming ? call.session.caller_id : call.session.callee_id;
      void supabase.from('call_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', call.session.id);
      void sendCallSignal(call.session, peerId, 'hangup');
    }
    cleanupCall();
  }, [cleanupCall, sendCallSignal]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, remoteStream, activeCall?.session.mode]);

  useEffect(() => {
    const targetId = searchParams.get('to');
    if (!targetId || !profile || startedDirectForRef.current === targetId) return;
    startedDirectForRef.current = targetId;
    void startDirect(targetId);
  }, [searchParams, profile, startDirect]);

  useEffect(() => {
    const term = personSearch.trim();
    if (!term || (!showNewMessage && !showGroup && !showGroupMembers)) {
      setPeople([]);
      return;
    }
    let active = true;
    setSearchingPeople(true);
    const timeout = window.setTimeout(async () => {
      const [nameResult, usernameResult] = await Promise.all([
        supabase.from('profiles').select('id, display_name, username, avatar_url').neq('id', profile?.id ?? '').eq('is_demo', false).ilike('display_name', `%${term}%`).limit(10),
        supabase.from('profiles').select('id, display_name, username, avatar_url').neq('id', profile?.id ?? '').eq('is_demo', false).ilike('username', `%${term}%`).limit(10),
      ]);
      if (!active) return;
      const searchError = nameResult.error ?? usernameResult.error;
      if (searchError) setError(messageError(searchError));
      const unique = new Map([...(nameResult.data ?? []), ...(usernameResult.data ?? [])].map((person) => [person.id, person as UserSummary]));
      setPeople([...unique.values()]);
      setSearchingPeople(false);
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [personSearch, profile?.id, showGroup, showGroupMembers, showNewMessage]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
  }, [voicePreviewUrl]);

  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversationId, messages.length]);

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!groupName.trim() || !groupMembers.length || sending) return;
    setSending(true);
    const { data, error: rpcError } = await supabase.rpc('create_group_conversation', {
      group_name: groupName.trim(),
      invited_users: groupMembers.map((member) => member.id),
    });
    if (rpcError) setError(messageError(rpcError));
    else {
      if (groupPhoto && profile) {
        const path = `${data}/${profile.id}/${crypto.randomUUID()}.${groupPhoto.type === 'image/png' ? 'png' : groupPhoto.type === 'image/webp' ? 'webp' : 'jpg'}`;
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, groupPhoto, { contentType: groupPhoto.type });
        if (uploadError) setError(`Group created, but its picture could not be uploaded: ${messageError(uploadError)}`);
        else {
          const { error: avatarError } = await supabase.rpc('update_group_avatar', { target_conversation: data, new_path: path });
          if (avatarError) {
            const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
            setError(cleanupError
              ? `Group created, but its picture could not be saved: ${messageError(avatarError)} Cleanup also failed: ${messageError(cleanupError)}`
              : `Group created, but its picture could not be saved: ${messageError(avatarError)}`);
          }
        }
      }
      setShowGroup(false);
      setGroupName('');
      setGroupPhoto(null);
      setGroupMembers([]);
      setPersonSearch('');
      await loadInbox();
      navigate(`/app/messages/${data}`);
    }
    setSending(false);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || !selected || sending || (!draft.trim() && !attachment)) return;
    if (attachment && (!ALLOWED_MEDIA.has(attachment.type) || attachment.size > MAX_UPLOAD_BYTES)) {
      setError('Choose an image, MP4/WebM video, or supported audio recording under 50 MB.');
      return;
    }
    setSending(true);
    setError(null);
    let path: string | null = null;
    try {
      if (attachment) {
        const extension = attachment.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
        path = `${selected.id}/${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET)
          .upload(path, attachment, { contentType: attachment.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: profile.id,
        body: draft.trim(),
        kind: attachment ? fileKind(attachment) : 'text',
        attachment_path: path,
        reply_to: replyingTo?.id ?? null,
      });
      if (insertError) {
        if (path) {
          const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
          if (cleanupError) throw new Error(`${messageError(insertError)} The uploaded attachment could not be cleaned up: ${messageError(cleanupError)}`);
        }
        throw insertError;
      }
      setDraft('');
      setAttachment(null);
      setReplyingTo(null);
      if (voicePreviewUrl) {
        URL.revokeObjectURL(voicePreviewUrl);
        setVoicePreviewUrl(null);
      }
      await loadMessages(selected.id);
      await loadInbox();
    } catch (sendError) {
      setError(messageError(sendError));
    } finally {
      setSending(false);
    }
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording is not supported by this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] });
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const voiceFile = new File([blob], `voice-message.${extension}`, { type: blob.type });
        setAttachment(voiceFile);
        setVoicePreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        setRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setError(null);
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : 'Microphone access was not granted.');
    }
  };

  const stopVoiceRecording = () => mediaRecorderRef.current?.stop();

  const loadOlderMessages = async () => {
    const first = messages[0];
    if (conversationId && first) await loadMessages(conversationId, first.created_at);
  };

  const reactToMessage = async (message: ChatMessage, emoji: string) => {
    if (!profile) return;
    const existing = message.reactions.find((reaction) => reaction.user_id === profile.id);
    const result = existing?.emoji === emoji
      ? await supabase.from('message_reactions').delete().eq('message_id', message.id).eq('user_id', profile.id)
      : existing
        ? (await supabase.from('message_reactions').delete().eq('message_id', message.id).eq('user_id', profile.id)).error
          ? { error: new Error('Unable to replace the reaction.') }
          : await supabase.from('message_reactions').insert({ message_id: message.id, user_id: profile.id, emoji })
        : await supabase.from('message_reactions').insert({ message_id: message.id, user_id: profile.id, emoji });
    if (result.error) setError(messageError(result.error));
    else if (conversationId) await loadMessages(conversationId);
  };

  const sendSharedProfile = async (user: UserSummary) => {
    if (!profile || !selected) return;
    const { error: shareError } = await supabase.from('messages').insert({
      conversation_id: selected.id, sender_id: profile.id, body: '', kind: 'profile', shared_profile_id: user.id,
    });
    if (shareError) setError(messageError(shareError));
    else {
      setShowGroupMembers(false);
      await loadMessages(selected.id);
    }
  };

  const openSharePosts = async () => {
    if (!profile || !selected) return;
    const { data, error: queryError } = await supabase.from('posts')
      .select('id, body, created_at').eq('author_id', profile.id).order('created_at', { ascending: false }).limit(10);
    if (queryError) {
      setError(messageError(queryError));
      return;
    }
    if (!data?.length) {
      setError('Share a post by publishing one first.');
      return;
    }
    setShareablePosts(data as ShareablePost[]);
    setShowSharePosts(true);
  };

  const sendSharedPost = async (postId: string) => {
    if (!profile || !selected) return;
    const { error: shareError } = await supabase.from('messages').insert({
      conversation_id: selected.id, sender_id: profile.id, body: '', kind: 'post', shared_post_id: postId,
    });
    if (shareError) setError(messageError(shareError));
    else {
      setShowSharePosts(false);
      await loadMessages(selected.id);
    }
  };

  const respondRequest = async (accept: boolean) => {
    if (!selected) return;
    const { error: rpcError } = await supabase.rpc('respond_message_request', {
      target_conversation: selected.id, accept_request: accept,
    });
    if (rpcError) setError(messageError(rpcError));
    else await loadInbox();
  };

  const muteConversation = async () => {
    if (!selected) return;
    const membership = selected.members.find((member) => member.user_id === currentUserId);
    const isMuted = Boolean(membership?.muted_until && new Date(membership.muted_until).getTime() > Date.now());
    const until = isMuted ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: rpcError } = await supabase.rpc('set_conversation_muted', {
      target_conversation: selected.id, mute_until: until,
    });
    if (rpcError) setError(messageError(rpcError));
    else await loadInbox();
  };

  const archiveConversation = async () => {
    if (!selected) return;
    const archivedAt = selected.members.find((member) => member.user_id === currentUserId)?.archived_at;
    const { error: rpcError } = await supabase.rpc('archive_conversation', {
      target_conversation: selected.id, should_archive: !archivedAt,
    });
    if (rpcError) setError(messageError(rpcError));
    else {
      navigate('/app/messages');
      await loadInbox();
    }
  };

  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const archived = conversation.members.find((member) => member.user_id === currentUserId)?.archived_at;
    const matchesArchive = showArchived ? Boolean(archived) : !archived;
    const matchesUnread = !showUnreadOnly || conversation.unread > 0;
    const peer = conversation.kind === 'group' ? conversation.name : conversation.members.find((member) => member.user_id !== currentUserId)?.profile?.display_name;
    return matchesArchive && matchesUnread && (peer ?? '').toLowerCase().includes(inboxSearch.toLowerCase());
  }), [conversations, currentUserId, inboxSearch, showArchived, showUnreadOnly]);

  const toggleGroupMember = (person: UserSummary) => {
    setGroupMembers((current) => current.some((item) => item.id === person.id)
      ? current.filter((item) => item.id !== person.id)
      : [...current, person]);
  };

  const beginEdit = (message: ChatMessage) => {
    setEditing(message);
    setEditDraft(message.body);
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (!window.confirm('Delete this message for everyone in the conversation?')) return;
    const { error: deleteError } = await supabase.rpc('delete_chat_message', { target_message: message.id });
    if (deleteError) setError(messageError(deleteError));
    else {
      if (message.attachment_path) {
        const { error: storageError } = await supabase.storage.from(MEDIA_BUCKET).remove([message.attachment_path]);
        if (storageError) setError(`Message deleted, but its attachment could not be removed: ${messageError(storageError)}`);
      }
      if (conversationId) await loadMessages(conversationId);
    }
  };

  const toggleGroup = async (userId: string, action: 'admin' | 'member' | 'remove') => {
    if (!selected) return;
    const rpc = action === 'remove' ? 'remove_group_member' : 'update_group_member_role';
    const args = action === 'remove'
      ? { target_conversation: selected.id, target_user: userId }
      : { target_conversation: selected.id, target_user: userId, make_admin: action === 'admin' };
    const { error: rpcError } = await supabase.rpc(rpc, args);
    if (rpcError) setError(messageError(rpcError));
    else {
      setShowGroupMembers(false);
      await loadInbox();
    }
  };

  const renameGroup = async () => {
    if (!selected || !selected.name) return;
    const name = window.prompt('New group name', selected.name);
    if (!name?.trim()) return;
    const { error: rpcError } = await supabase.rpc('update_group_name', { target_conversation: selected.id, new_name: name.trim() });
    if (rpcError) setError(messageError(rpcError));
    else await loadInbox();
  };

  const changeGroupPicture = async (file: File | null) => {
    if (!selected || selected.kind !== 'group' || !profile || !file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Group pictures must be JPG, PNG, or WebP under 5 MB.');
      return;
    }
    const oldPath = selected.avatar_path;
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${selected.id}/${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type });
    if (uploadError) {
      setError(messageError(uploadError));
      return;
    }
    const { error: updateError } = await supabase.rpc('update_group_avatar', { target_conversation: selected.id, new_path: path });
    if (updateError) {
      const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      setError(cleanupError
        ? `${messageError(updateError)} Uploaded picture cleanup also failed: ${messageError(cleanupError)}`
        : messageError(updateError));
      return;
    }
    if (oldPath) {
      const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([oldPath]);
      if (removeError) setError(`Group picture updated, but the old picture could not be removed: ${messageError(removeError)}`);
    }
    await loadInbox();
  };

  const leaveGroup = async () => {
    if (!selected || !window.confirm('Leave this group?')) return;
    const { error: rpcError } = await supabase.rpc('leave_group', { target_conversation: selected.id });
    if (rpcError) setError(messageError(rpcError));
    else {
      navigate('/app/messages');
      await loadInbox();
    }
  };

  const blockMember = async () => {
    if (!counterpart || !profile || !window.confirm(`Block ${counterpart.display_name}? They will no longer be able to start or continue messaging you.`)) return;
    const { error: blockError } = await supabase.from('user_blocks').insert({ blocker_id: profile.id, blocked_id: counterpart.id });
    if (blockError) setError(messageError(blockError));
    else {
      setError(`${counterpart.display_name} has been blocked.`);
      await loadInbox();
    }
  };

  const reportMember = async () => {
    if (!counterpart || !profile) return;
    const reason = window.prompt(`Why are you reporting ${counterpart.display_name}?`);
    if (!reason?.trim()) return;
    const { error: reportError } = await supabase.from('reports').insert({
      reporter_id: profile.id,
      reported_user_id: counterpart.id,
      reason: `Conversation report: ${reason.trim().slice(0, 1000)}`,
    });
    if (reportError) setError(messageError(reportError));
    else setNotice('Your report has been submitted for review.');
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Messages</h1>
          <p className="mt-1 text-sm text-muted">Private chats with your Bondly community.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setShowGroup(true); setPersonSearch(''); }}><Users size={15} /> Create group</Button>
          <Button size="sm" onClick={() => { setShowNewMessage(true); setPersonSearch(''); window.setTimeout(() => searchInputRef.current?.focus(), 0); }}><CirclePlus size={15} /> New message</Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 rounded-xl border border-error-100 bg-error-50 px-4 py-3 text-sm text-error-400">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-500">{notice}</p>}

      <div className="grid h-[min(74vh,760px)] min-h-[480px] overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`flex min-h-0 flex-col border-r border-navy-100 ${conversationId ? 'hidden lg:flex' : 'flex'}`}>
          <div className="border-b border-navy-100 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-navy-900">Bondly Messages</h2>
              <button type="button" aria-label="New message" onClick={() => { setShowNewMessage(true); window.setTimeout(() => searchInputRef.current?.focus(), 0); }} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><CirclePlus size={18} /></button>
            </div>
            <label className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2">
              <Search size={16} className="text-muted" />
              <input value={inboxSearch} onChange={(event) => setInboxSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setShowUnreadOnly(false)} className={`rounded-full px-3 py-1 text-xs ${!showUnreadOnly ? 'bg-indigo-100 font-medium text-indigo-700' : 'bg-canvas text-muted'}`}>All</button>
              <button type="button" onClick={() => setShowUnreadOnly(true)} className={`rounded-full px-3 py-1 text-xs ${showUnreadOnly ? 'bg-indigo-100 font-medium text-indigo-700' : 'bg-canvas text-muted'}`}>Unread</button>
              <button type="button" onClick={() => setShowArchived((value) => !value)} className={`ml-auto rounded-full px-3 py-1 text-xs ${showArchived ? 'bg-indigo-100 font-medium text-indigo-700' : 'bg-canvas text-muted'}`}>{showArchived ? 'Archived' : 'Inbox'}</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingInbox ? <Spinner className="py-12" /> : visibleConversations.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <MessageCircle size={26} className="mx-auto text-muted" />
                <p className="mt-2 text-sm font-medium text-navy-800">{showUnreadOnly ? 'No unread messages' : 'No conversations yet'}</p>
                <p className="mt-1 text-xs text-muted">Start a message or create a group to connect.</p>
              </div>
            ) : visibleConversations.map((conversation) => {
              const peer = conversation.kind === 'group' ? null : conversation.members.find((member) => member.user_id !== currentUserId)?.profile;
              const title = conversation.kind === 'group' ? conversation.name ?? 'Group chat' : peer?.display_name ?? 'Bondly member';
              const summary = conversation.lastMessage?.deleted_at
                ? 'Message deleted'
                : conversation.lastMessage?.body || (conversation.lastMessage?.kind === 'image' ? 'Photo' : conversation.lastMessage?.kind === 'video' ? 'Video' : conversation.lastMessage?.kind === 'audio' ? 'Voice message' : conversation.lastMessage?.kind === 'post' ? 'Shared a post' : conversation.lastMessage?.kind === 'profile' ? 'Shared a profile' : 'Start a conversation');
              return (
                <button key={conversation.id} type="button" onClick={() => navigate(`/app/messages/${conversation.id}`)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas ${conversationId === conversation.id ? 'bg-indigo-50' : ''}`}>
                  {conversation.kind === 'group' && conversation.avatarUrl ? <Avatar src={conversation.avatarUrl} name={title} size="md" /> : conversation.kind === 'group' ? (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><Users size={19} /></div>
                  ) : <span className="relative shrink-0"><Avatar src={peer?.avatar_url} name={title} size="md" />{peer && onlineUserIds.includes(peer.id) && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-success-400" title="Online" />}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-navy-900">{title}</p>
                      <span className="shrink-0 text-[10px] text-muted">{conversation.lastMessage ? formatChatTime(conversation.lastMessage.created_at) : ''}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted">{conversation.lastMessage?.sender_id === currentUserId ? 'You: ' : ''}{summary}</p>
                      {conversation.unread > 0 && <span className="min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">{conversation.unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
            <div ref={inboxEndRef} />
          </div>
        </aside>

        <main className={`${conversationId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col`}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><MessageCircle size={28} /></div>
              <h2 className="text-xl font-semibold text-navy-900">Your messages</h2>
              <p className="mt-2 max-w-sm text-sm text-muted">Choose a conversation or start a new one. Messages are private to the people in each chat.</p>
              <Button className="mt-5" onClick={() => { setShowNewMessage(true); window.setTimeout(() => searchInputRef.current?.focus(), 0); }}><Send size={15} /> New message</Button>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-navy-100 px-3 py-3 sm:px-5">
                <button type="button" aria-label="Back to conversations" onClick={() => navigate('/app/messages')} className="rounded-lg p-2 text-navy-600 hover:bg-canvas lg:hidden"><ArrowLeft size={18} /></button>
                {selected.kind === 'group'
                  ? selected.avatarUrl ? <Avatar src={selected.avatarUrl} name={selected.name ?? 'Group'} size="sm" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><Users size={18} /></div>
                  : <span className="relative shrink-0"><Avatar src={counterpart?.avatar_url} name={counterpart?.display_name ?? 'Member'} size="sm" />{counterpart && onlineUserIds.includes(counterpart.id) && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-success-400" title="Online" />}</span>}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-navy-900">{selected.kind === 'group' ? selected.name : counterpart?.display_name ?? 'Bondly member'}</h2>
                  <p className="truncate text-xs text-muted">{selected.kind === 'group' ? `${selected.members.length} members` : onlineUserIds.includes(counterpart?.id ?? '') ? 'Online' : counterpart?.username ? `@${counterpart.username}` : 'Private conversation'}</p>
                </div>
                {selected.kind === 'direct' && <>
                  <button type="button" title="Audio call" aria-label="Start audio call" onClick={() => void startCall('audio')} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><Phone size={18} /></button>
                  <button type="button" title="Video call" aria-label="Start video call" onClick={() => void startCall('video')} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><Video size={18} /></button>
                  <button type="button" title="Share your profile" onClick={() => profile && void sendSharedProfile({ id: profile.id, display_name: profile.display_name, username: profile.username ?? null, avatar_url: profile.avatar_url })} className="rounded-lg p-2 text-navy-600 hover:bg-canvas"><UserPlus size={18} /></button>
                </>}
                {selected.kind === 'group' && <button type="button" title="Group details" onClick={() => setShowGroupMembers(true)} className="rounded-lg p-2 text-navy-600 hover:bg-canvas"><Users size={18} /></button>}
                <div className="relative group">
                  <button type="button" title="Conversation options" className="rounded-lg p-2 text-navy-600 hover:bg-canvas"><MoreHorizontal size={19} /></button>
                  <div className="absolute right-0 top-full z-20 hidden min-w-40 rounded-xl border border-navy-100 bg-white p-1 shadow-lg group-focus-within:block group-hover:block">
                    <button type="button" onClick={() => void muteConversation()} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-canvas">{selected.members.find((member) => member.user_id === currentUserId)?.muted_until ? 'Unmute chat' : 'Mute 30 days'}</button>
                    <button type="button" onClick={() => void archiveConversation()} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-canvas">{selected.members.find((member) => member.user_id === currentUserId)?.archived_at ? 'Restore chat' : 'Archive chat'}</button>
                    {selected.kind === 'group' && <button type="button" onClick={() => void renameGroup()} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-canvas">Rename group</button>}
                    {selected.kind === 'group' && <button type="button" onClick={() => void leaveGroup()} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-error-400 hover:bg-error-50">Leave group</button>}
                    {selected.kind === 'direct' && <button type="button" onClick={() => void reportMember()} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-canvas">Report conversation</button>}
                    {selected.kind === 'direct' && <button type="button" onClick={() => void blockMember()} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-error-400 hover:bg-error-50">Block member</button>}
                  </div>
                </div>
              </header>

              {selected.request?.status === 'pending' && selected.request.recipient_id === currentUserId && (
                <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-900">Message request. Accept to continue this conversation.</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void respondRequest(true)}>Accept</Button>
                    <Button size="sm" variant="ghost" onClick={() => void respondRequest(false)}>Decline</Button>
                  </div>
                </div>
              )}
              {selected.request?.status === 'pending' && selected.request.sender_id === currentUserId && (
                <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">Message request sent. You can send another message after it is accepted.</p>
              )}
              {selected.request?.status === 'rejected' && (
                <p className="border-b border-error-100 bg-error-50 px-4 py-2 text-xs text-error-400">This message request was declined. You can archive the conversation.</p>
              )}

              <div className="flex-1 overflow-y-auto bg-white px-3 py-4 sm:px-6">
                {olderMessages && messages.length >= PAGE_SIZE && (
                  <div className="mb-4 text-center"><button type="button" onClick={() => void loadOlderMessages()} disabled={loadingMessages} className="text-xs font-medium text-indigo-600">{loadingMessages ? 'Loading…' : 'Load earlier messages'}</button></div>
                )}
                {callHistory.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {callHistory.slice(0, 3).map((call) => (
                      <p key={call.id} className="text-center text-[11px] text-muted">
                        {call.status === 'missed' ? 'Missed' : call.status === 'rejected' ? 'Declined' : call.status === 'ended' ? 'Call ended' : 'Call'} {call.mode} call{call.answered_at && call.ended_at ? ` · ${Math.max(0, Math.round((new Date(call.ended_at).getTime() - new Date(call.answered_at).getTime()) / 1000))} sec` : ''} · {formatChatTime(call.created_at)}
                      </p>
                    ))}
                  </div>
                )}
                {loadingMessages && messages.length === 0 ? <Spinner className="h-40" /> : messages.length === 0 ? (
                  <EmptyState title="Say hello" description="This is the beginning of your conversation." />
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => {
                      const own = message.sender_id === currentUserId;
                      const peerReadAt = selected.members.find((member) => member.user_id !== currentUserId)?.last_read_at;
                      const hasBeenRead = Boolean(peerReadAt && message.created_at <= peerReadAt);
                      const replied = message.reply_to ? messages.find((item) => item.id === message.reply_to) : null;
                      return (
                        <div key={message.id} className={`group flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
                          {!own && <Avatar src={message.sender?.avatar_url} name={message.sender?.display_name ?? 'Member'} size="sm" />}
                          <div className={`max-w-[82%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
                            {selected.kind === 'group' && !own && <span className="mb-1 px-2 text-[10px] font-medium text-muted">{message.sender?.display_name ?? 'Member'}</span>}
                            {replied && <p className="mb-1 max-w-full truncate rounded-lg bg-canvas px-3 py-1.5 text-[11px] text-muted">Replying to {replied.sender?.display_name}: {replied.body || 'Attachment'}</p>}
                            <div className={`relative rounded-2xl px-3 py-2 ${own ? 'bg-indigo-600 text-white' : 'bg-canvas text-navy-800'}`}>
                              {message.deleted_at ? <p className="text-xs italic opacity-70">Message deleted</p> : (
                                <>
                                  {message.kind === 'image' && message.url && <img src={message.url} alt="Shared image" className="mb-2 max-h-72 rounded-xl object-contain" />}
                                  {message.kind === 'video' && message.url && <video src={message.url} controls playsInline className="mb-2 max-h-72 max-w-full rounded-xl" />}
                                  {message.kind === 'audio' && message.url && <audio src={message.url} controls className="mb-2 max-w-full" />}
                                  {message.kind === 'profile' && message.shared_profile_id && <Link to={`/app/profile/${message.shared_profile_id}`} className="mb-2 block rounded-xl bg-white/15 p-3 text-sm underline">Bondly profile · View profile</Link>}
                                  {message.kind === 'post' && message.shared_post_id && <Link to="/app" className="mb-2 block rounded-xl bg-white/15 p-3 text-sm underline">Shared a Bondly post · Open feed</Link>}
                                  {message.body && <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}
                                </>
                              )}
                              <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-indigo-100' : 'text-muted'}`}>
                                {message.edited_at && <span>edited</span>}
                                <time>{formatChatTime(message.created_at)}</time>
                                {own && <span aria-label={hasBeenRead ? 'Read' : 'Sent'} title={hasBeenRead ? 'Read' : 'Sent'} className={hasBeenRead ? 'text-white' : 'opacity-60'}><CheckCheck size={12} /></span>}
                              </div>
                              <div className={`absolute top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 rounded-full border border-navy-100 bg-white p-1 shadow-md group-hover:flex ${own ? '-left-24' : '-right-24'}`}>
                                {MESSAGE_EMOJIS.slice(0, 3).map((emoji) => <button key={emoji} type="button" title={`React ${emoji}`} onClick={() => void reactToMessage(message, emoji)} className="px-0.5 text-sm">{emoji}</button>)}
                                <button type="button" title="Reply" onClick={() => { setReplyingTo(message); messageInputRef.current?.focus(); }} className="px-1 text-xs text-indigo-600"><MessageCircle size={13} /></button>
                                {own && message.kind === 'text' && !message.deleted_at && <button type="button" title="Edit message" onClick={() => beginEdit(message)} className="px-1 text-xs text-indigo-600"><ChevronDown size={13} /></button>}
                                {own && !message.deleted_at && <button type="button" title="Delete for everyone" onClick={() => void deleteMessage(message)} className="px-1 text-xs text-error-400"><Trash2 size={13} /></button>}
                              </div>
                            </div>
                            {message.reactions.length > 0 && <div className="mt-1 flex gap-1">{MESSAGE_EMOJIS.map((emoji) => {
                              const count = message.reactions.filter((reaction) => reaction.emoji === emoji).length;
                              return count > 0 && <button key={emoji} type="button" onClick={() => void reactToMessage(message, emoji)} className="rounded-full border border-navy-100 bg-white px-1.5 py-0.5 text-xs">{emoji} {count}</button>;
                            })}</div>}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messageEndRef} />
                  </div>
                )}
                {typingNames.length > 0 && <p className="mt-3 text-xs italic text-muted">{typingNames.join(', ')} typing…</p>}
              </div>
              <form onSubmit={(event) => void sendMessage(event)} className="border-t border-navy-100 p-3 sm:px-5">
                {replyingTo && <div className="mb-2 flex items-center gap-2 text-xs text-muted"><span className="min-w-0 flex-1 truncate">Replying to {replyingTo.sender?.display_name}: {replyingTo.body || 'attachment'}</span><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={14} /></button></div>}
                {editing && <div className="mb-2 flex gap-2"><input value={editDraft} onChange={(event) => setEditDraft(event.target.value)} className="input-field flex-1 py-2 text-sm" maxLength={5000} /><Button size="sm" type="button" onClick={() => void saveEdit()}>Save</Button><Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button></div>}
                {attachment && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-navy-700">
                    {voicePreviewUrl ? <audio controls src={voicePreviewUrl} className="h-8 flex-1" /> : <span className="min-w-0 flex-1 truncate">{attachment.name}</span>}
                    <button type="button" aria-label="Remove attachment" onClick={() => { setAttachment(null); if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl); setVoicePreviewUrl(null); }}><X size={15} /></button>
                  </div>
                )}
                <div className={`flex items-end gap-2 rounded-2xl border border-navy-200 p-2 ${requestBlocksComposer ? 'opacity-50' : 'focus-within:border-indigo-400'}`}>
                  <label className="cursor-pointer rounded-lg p-2 text-muted hover:bg-canvas hover:text-indigo-600" title="Attach media">
                    <Paperclip size={18} />
                    <input type="file" className="sr-only" accept="image/*,video/mp4,video/webm,audio/webm,audio/ogg,audio/mp4" onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && (!ALLOWED_MEDIA.has(file.type) || file.size > MAX_UPLOAD_BYTES)) setError('Choose a supported image, video, or audio file under 50 MB.');
                      else setAttachment(file);
                      event.currentTarget.value = '';
                    }} />
                  </label>
                  <button type="button" title={recording ? 'Stop voice recording' : 'Record voice message'} onClick={() => recording ? stopVoiceRecording() : void startVoiceRecording()} className={`rounded-lg p-2 ${recording ? 'animate-pulse bg-error-50 text-error-400' : 'text-muted hover:bg-canvas hover:text-indigo-600'}`}><AudioLines size={18} /></button>
                  <textarea ref={messageInputRef} value={draft} disabled={requestBlocksComposer} onChange={(event) => {
                    setDraft(event.target.value);
                    void typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: profile?.id, name: profile?.display_name } });
                  }} onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }} rows={1} maxLength={5000} placeholder={requestBlocksComposer ? 'Accept the request to send messages' : recording ? 'Recording voice message…' : 'Write a message…'} aria-label="Write a message" className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-1 py-2 text-sm outline-none" />
                  <button type="button" title="Share a recent post" onClick={() => void openSharePosts()} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-indigo-600"><ImagePlus size={18} /></button>
                  <button type="button" title="Emoji" onClick={() => setDraft((value) => `${value}🙂`)} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-indigo-600"><Smile size={18} /></button>
                  <button type="submit" disabled={requestBlocksComposer || sending || (!draft.trim() && !attachment)} title="Send message" className="rounded-xl bg-indigo-600 p-2.5 text-white disabled:opacity-40"><Send size={17} /></button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>

      {showNewMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4" role="dialog" aria-modal="true" aria-label="New message">
          <Card className="w-full max-w-lg p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-navy-900">New message</h2><button type="button" onClick={() => setShowNewMessage(false)} aria-label="Close"><X size={19} /></button></div>
            <label className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2"><Search size={16} className="text-muted" /><input ref={searchInputRef} value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} placeholder="Search by name or username" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            <div className="mt-3 max-h-72 overflow-y-auto">
              {searchingPeople ? <Spinner className="py-8" /> : people.map((person) => (
                <button key={person.id} type="button" onClick={() => void startDirect(person.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-canvas">
                  <Avatar src={person.avatar_url} name={person.display_name} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-navy-800">{person.display_name}</span><span className="block truncate text-xs text-muted">@{person.username ?? 'Bondly member'}</span></span>
                  <Send size={15} className="text-indigo-600" />
                </button>
              ))}
              {!searchingPeople && personSearch.trim() && !people.length && <p className="py-8 text-center text-sm text-muted">No members found.</p>}
            </div>
          </Card>
        </div>
      )}

      {showGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4" role="dialog" aria-modal="true" aria-label="Create group">
          <Card className="w-full max-w-lg p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-navy-900">Create group</h2><button type="button" onClick={() => setShowGroup(false)} aria-label="Close"><X size={19} /></button></div>
            <form onSubmit={(event) => void createGroup(event)} className="space-y-4">
              <label className="block text-sm font-medium text-navy-700">Group name<input required maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} className="input-field mt-1" placeholder="Weekend plans" /></label>
              <label className="block text-sm font-medium text-navy-700">Group picture (optional)<input type="file" accept="image/jpeg,image/png,image/webp" className="input-field mt-1" onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) setError('Group pictures must be JPG, PNG, or WebP under 5 MB.');
                else setGroupPhoto(file);
                event.currentTarget.value = '';
              }} /></label>
              <label className="block text-sm font-medium text-navy-700">Find members<input value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} className="input-field mt-1" placeholder="Search by name or username" /></label>
              {groupMembers.length > 0 && <div className="flex flex-wrap gap-2">{groupMembers.map((member) => <button key={member.id} type="button" onClick={() => toggleGroupMember(member)} className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700"><X size={12} />{member.display_name}</button>)}</div>}
              <div className="max-h-52 overflow-y-auto">
                {searchingPeople ? <Spinner className="py-5" /> : people.map((person) => (
                  <button key={person.id} type="button" onClick={() => toggleGroupMember(person)} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${groupMembers.some((item) => item.id === person.id) ? 'bg-indigo-50' : 'hover:bg-canvas'}`}>
                    <Avatar src={person.avatar_url} name={person.display_name} size="sm" /><span className="flex-1 text-sm">{person.display_name} <span className="text-xs text-muted">@{person.username ?? 'member'}</span></span>
                    {groupMembers.some((item) => item.id === person.id) && <Check size={15} className="text-indigo-600" />}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowGroup(false)}>Cancel</Button><Button type="submit" disabled={sending || !groupName.trim() || groupMembers.length === 0}>{sending ? 'Creating…' : `Create group (${groupMembers.length})`}</Button></div>
            </form>
          </Card>
        </div>
      )}

      {showGroupMembers && selected?.kind === 'group' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4" role="dialog" aria-modal="true" aria-label="Group members">
          <Card className="w-full max-w-lg p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-navy-900">{selected.name ?? 'Group members'}</h2><button type="button" onClick={() => setShowGroupMembers(false)} aria-label="Close"><X size={19} /></button></div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {selected.members.map((member) => (
                <div key={member.user_id} className="flex items-center gap-3 rounded-xl p-2">
                  <Avatar src={member.profile?.avatar_url} name={member.profile?.display_name ?? 'Member'} size="sm" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-navy-800">{member.profile?.display_name ?? 'Bondly member'}</p><p className="text-xs text-muted">{member.role}</p></div>
                  {selected.members.some((item) => item.user_id === currentUserId && item.role === 'admin') && member.user_id !== currentUserId && <>
                    <button type="button" onClick={() => void toggleGroup(member.user_id, member.role === 'admin' ? 'member' : 'admin')} className="text-xs text-indigo-600">{member.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
                    <button type="button" onClick={() => void toggleGroup(member.user_id, 'remove')} aria-label="Remove member" className="text-error-400"><X size={15} /></button>
                  </>}
                </div>
              ))}
            </div>
            {selected.members.some((item) => item.user_id === currentUserId && item.role === 'admin') && (
              <label className="mt-3 block text-xs font-medium text-navy-700">Change group picture
                <input type="file" accept="image/jpeg,image/png,image/webp" className="input-field mt-1 text-xs" onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void changeGroupPicture(file);
                  event.currentTarget.value = '';
                }} />
              </label>
            )}
            {showSharePosts && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4" role="dialog" aria-modal="true" aria-label="Share a post">
                <Card className="w-full max-w-lg p-5">
                  <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-navy-900">Share a recent post</h2><button type="button" onClick={() => setShowSharePosts(false)} aria-label="Close"><X size={19} /></button></div>
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {shareablePosts.map((post) => <button key={post.id} type="button" onClick={() => void sendSharedPost(post.id)} className="w-full rounded-xl border border-navy-100 p-3 text-left hover:border-indigo-200 hover:bg-indigo-50">
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-navy-800">{post.body || 'Post with media'}</p>
                      <time className="mt-1 block text-xs text-muted">{formatChatTime(post.created_at)}</time>
                    </button>)}
                  </div>
                </Card>
              </div>
            )}
            <label className="mt-4 block text-sm font-medium text-navy-700">Add member<input value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} className="input-field mt-1" placeholder="Search name or username" /></label>
            {people.map((person) => <button key={person.id} type="button" onClick={async () => {
              const { error: addError } = await supabase.rpc('add_group_member', { target_conversation: selected.id, new_member: person.id });
              if (addError) setError(messageError(addError));
              else { setPersonSearch(''); setPeople([]); await loadInbox(); }
            }} className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-canvas"><UserPlus size={15} />{person.display_name}</button>)}
            <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => setShowGroupMembers(false)}>Done</Button></div>
          </Card>
        </div>
      )}
      {activeCall && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-950/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`${activeCall.session.mode} call`}>
          <div className="relative flex h-[min(90vh,760px)] w-full max-w-3xl flex-col items-center justify-center overflow-hidden rounded-3xl bg-navy-900 p-5 text-white">
            <div className="absolute left-5 top-5 flex items-center gap-3">
              <Avatar src={activeCall.peer.avatar_url} name={activeCall.peer.display_name} size="md" />
              <div><p className="font-semibold">{activeCall.peer.display_name}</p>              <p className="text-xs text-white/70">{activeCall.session.mode === 'video' ? 'Video call' : 'Audio call'} · {activeCall.status === 'connected' && activeCall.startedAt ? `${Math.floor((callClock - activeCall.startedAt) / 60000)}:${String(Math.floor(((callClock - activeCall.startedAt) % 60000) / 1000)).padStart(2, '0')}` : activeCall.status === 'incoming' ? 'Incoming call' : activeCall.status === 'calling' ? 'Calling…' : activeCall.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</p></div>
            </div>
            {activeCall.session.mode === 'video' && (
              <>
                <video ref={remoteVideoRef} autoPlay playsInline className="h-full max-h-[65vh] w-full rounded-2xl bg-black object-contain" />
                <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-24 right-5 h-28 w-40 rounded-xl bg-black object-cover sm:h-40 sm:w-56" />
                {!remoteStream && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="mt-8 rounded-full bg-black/50 px-4 py-2 text-sm">Waiting for {activeCall.peer.display_name}…</p></div>}
              </>
            )}
            {activeCall.session.mode === 'audio' && <div className="flex flex-col items-center"><Avatar src={activeCall.peer.avatar_url} name={activeCall.peer.display_name} size="xl" /><p className="mt-5 text-sm text-white/70">{activeCall.status === 'connected' ? 'Connected' : 'Waiting for them to answer…'}</p></div>}
            <audio autoPlay ref={(element) => { if (element && activeCall.session.mode === 'audio') element.srcObject = remoteStream; }} />
            <div className="absolute bottom-5 flex items-center gap-3">
              {activeCall.incoming && activeCall.status === 'incoming' ? (
                <>
                  <button type="button" onClick={() => void finishCall('rejected')} className="rounded-full bg-error-400 p-4 text-white" aria-label="Reject call"><Phone size={20} className="rotate-[135deg]" /></button>
                  <button type="button" onClick={() => void acceptCall()} className="rounded-full bg-success-500 p-4 text-white" aria-label="Accept call">{activeCall.session.mode === 'video' ? <Video size={20} /> : <Phone size={20} />}</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => {
                    const nextMuted = !callMuted;
                    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
                    setCallMuted(nextMuted);
                  }} className={`rounded-full p-3 ${callMuted ? 'bg-white text-navy-900' : 'bg-white/15 text-white'}`} aria-label={callMuted ? 'Unmute microphone' : 'Mute microphone'}><AudioLines size={20} /></button>
                  {activeCall.session.mode === 'video' && <button type="button" onClick={() => {
                    const nextEnabled = !cameraEnabled;
                    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = nextEnabled; });
                    setCameraEnabled(nextEnabled);
                  }} className={`rounded-full p-3 ${cameraEnabled ? 'bg-white/15 text-white' : 'bg-white text-navy-900'}`} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}><Video size={20} /></button>}
                  <button type="button" onClick={() => void finishCall('ended')} className="rounded-full bg-error-400 p-4 text-white" aria-label="End call"><Phone size={20} className="rotate-[135deg]" /></button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
