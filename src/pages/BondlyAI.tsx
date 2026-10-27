import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Bot, Check, Copy, History, MessageSquarePlus, Pencil, Send, Sparkles, StopCircle, Trash2 } from 'lucide-react';
import { Button, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';

type AIConversation = { id: string; title: string; updated_at: string };
type AIMessage = { id: string; conversation_id: string; user_id: string; role: 'user' | 'assistant'; content: string; created_at: string };
type StreamMessage = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'Help me write a friendly caption for a photo.',
  'Suggest a few conversation starters for meeting someone new.',
  'Recommend a fun movie for tonight.',
];

function messageError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function BondlyAI() {
  const { profile, session } = useAuth();
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [showMobileHistory, setShowMobileHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const currentConversationRef = useRef<string | null>(conversationId);
  const discardOnAbortRef = useRef(new Set<string>());
  currentConversationRef.current = conversationId;

  const loadConversations = useCallback(async () => {
    if (!profile) return;
    setLoadingHistory(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('ai_conversations')
      .select('id, title, updated_at')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false });
    if (queryError) setError(messageError(queryError));
    else {
      const rows = (data ?? []) as AIConversation[];
      setConversations(rows);
      setConversationId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
    }
    setLoadingHistory(false);
  }, [profile]);

  const loadMessages = useCallback(async (id: string) => {
    const { data, error: queryError } = await supabase
      .from('ai_messages')
      .select('id, conversation_id, user_id, role, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (queryError) {
      setError(messageError(queryError));
      setMessages([]);
      return;
    }
    if (currentConversationRef.current === id) {
      const loaded = (data ?? []) as AIMessage[];
      setMessages((current) => {
        const optimistic = current.filter((item) => item.conversation_id === id && !loaded.some((row) => row.id === item.id));
        return [...loaded, ...optimistic].sort((left, right) => left.created_at.localeCompare(right.created_at));
      });
    }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (conversationId) void loadMessages(conversationId);
    else setMessages([]);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const streamReply = async (id: string, context: StreamMessage[]) => {
    if (!session) throw new Error('Your sign-in session has expired. Sign in again.');
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    const assistantId = crypto.randomUUID();
    let responseText = '';
    let assistantSaveAttempted = false;
    setMessages((current) => [...current, {
      id: assistantId, conversation_id: id, user_id: profile?.id ?? '',
      role: 'assistant', content: '', created_at: new Date().toISOString(),
    }]);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bondly-ai`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: context }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(detail?.error ?? `Bondly AI request failed (${response.status}).`);
      }
      if (!response.body) throw new Error('The AI service returned no response stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let chunk: { message?: { content?: string }; error?: string };
        try {
          chunk = JSON.parse(trimmed) as typeof chunk;
        } catch {
          throw new Error('The AI service returned an invalid response. Check its Ollama compatibility.');
        }
        if (chunk.error) throw new Error('The AI service could not complete this response.');
        if (typeof chunk.message?.content === 'string') responseText += chunk.message.content;
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: responseText } : item));
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(processLine);
        if (done) break;
      }
      if (buffer.trim()) processLine(buffer);
      if (!responseText.trim()) throw new Error('The AI model returned an empty answer. You can try again.');
      const { error: saveError } = await supabase.from('ai_messages').insert({
        conversation_id: id, user_id: profile?.id, role: 'assistant', content: responseText,
      });
      assistantSaveAttempted = true;
      if (saveError) throw saveError;
      const { error: timestampError } = await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', id);
      if (timestampError) setError(`Response saved, but chat history could not be updated: ${messageError(timestampError)}`);
      await loadMessages(id);
      await loadConversations();
    } catch (streamError) {
      if (!(streamError instanceof DOMException && streamError.name === 'AbortError')) {
        setError(messageError(streamError));
      }
      const discardPartial = controller.signal.aborted && discardOnAbortRef.current.has(id);
      discardOnAbortRef.current.delete(id);
      if (responseText.trim() && !assistantSaveAttempted && !discardPartial) {
        const { error: partialSaveError } = await supabase.from('ai_messages').insert({
          conversation_id: id, user_id: profile?.id, role: 'assistant', content: responseText,
        });
        if (partialSaveError) setError(`The partial response could not be saved: ${messageError(partialSaveError)}`);
        else await loadMessages(id);
      } else if (!responseText.trim() || discardPartial) {
        setMessages((current) => current.filter((item) => item.id !== assistantId));
      } else {
        await loadMessages(id);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setGenerating(false);
    }
  };

  const send = async (event?: FormEvent<HTMLFormElement>, prompt = draft) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!profile || !text || generating) return;
    setDraft('');
    setError(null);
    let currentId = conversationId;
    if (!currentId) {
      const { data, error: insertError } = await supabase
        .from('ai_conversations')
        .insert({ user_id: profile.id, title: text.slice(0, 60) })
        .select('id, title, updated_at')
        .single();
      if (insertError) {
        setDraft(text);
        setError(messageError(insertError));
        return;
      }
      const created = data as AIConversation;
      currentId = created.id;
      setConversationId(currentId);
      setConversations((current) => [created, ...current]);
    }
    const userMessage: StreamMessage = { role: 'user', content: text };
    const { error: messageInsertError } = await supabase.from('ai_messages').insert({
      conversation_id: currentId, user_id: profile.id, ...userMessage,
    });
    if (messageInsertError) {
      setDraft(text);
      setError(messageError(messageInsertError));
      return;
    }
    const history = [...messages.filter((item) => item.conversation_id === currentId), {
      id: crypto.randomUUID(), conversation_id: currentId, user_id: profile.id,
      ...userMessage, created_at: new Date().toISOString(),
    } as AIMessage];
    setMessages(history);
    const { error: timestampError } = await supabase.from('ai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentId);
    if (timestampError) setError(`Your message was saved, but chat history could not be updated: ${messageError(timestampError)}`);
    await streamReply(currentId, history.slice(-30).map(({ role, content }) => ({ role, content })));
  };

  const retry = async () => {
    if (!conversationId || generating) return;
    const userMessages = messages.filter((message) => message.role === 'user');
    const latest = userMessages[userMessages.length - 1];
    if (!latest) return;
    const latestIndex = messages.lastIndexOf(latest);
    const history = messages.slice(0, latestIndex + 1);
    await streamReply(conversationId, history.slice(-30).map(({ role, content }) => ({ role, content })));
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm('Delete this AI conversation and its messages? This cannot be undone.')) return;
    if (conversationId === id) {
      discardOnAbortRef.current.add(id);
      abortRef.current?.abort();
    }
    const { error: deleteError } = await supabase.from('ai_conversations').delete().eq('id', id);
    if (deleteError) setError(messageError(deleteError));
    else {
      const remaining = conversations.filter((item) => item.id !== id);
      setConversations(remaining);
      if (conversationId === id) {
        setConversationId(remaining[0]?.id ?? null);
        if (!remaining.length) setMessages([]);
      }
    }
  };

  const renameConversation = async (id: string) => {
    const title = renameDraft.trim();
    if (!title) return;
    const { error: updateError } = await supabase.from('ai_conversations').update({ title }).eq('id', id);
    if (updateError) setError(messageError(updateError));
    else {
      setConversations((current) => current.map((item) => item.id === id ? { ...item, title } : item));
      setRenaming(null);
    }
  };

  const clearConversation = async () => {
    if (!conversationId || !window.confirm('Clear every message in this conversation?')) return;
    discardOnAbortRef.current.add(conversationId);
    abortRef.current?.abort();
    const { error: deleteError } = await supabase.from('ai_messages').delete().eq('conversation_id', conversationId);
    if (deleteError) setError(messageError(deleteError));
    else setMessages([]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Bondly AI" subtitle="A private AI assistant for ideas, advice, and everyday questions." />
      {error && <p role="alert" className="mb-3 rounded-xl border border-error-100 bg-error-50 px-4 py-3 text-sm text-error-400">{error}</p>}
      <div className="grid min-h-[min(74vh,760px)] overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="hidden border-r border-navy-100 bg-canvas p-3 lg:flex lg:flex-col">
          <Button size="sm" onClick={() => { setConversationId(null); setMessages([]); setError(null); draftRef.current?.focus(); }}><MessageSquarePlus size={15} /> New chat</Button>
          <p className="mb-2 mt-5 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent chats</p>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {loadingHistory ? <Spinner className="py-8" /> : conversations.map((item) => (
              <div key={item.id} className={`group rounded-xl p-2 ${conversationId === item.id ? 'bg-indigo-50' : 'hover:bg-white'}`}>
                {renaming === item.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); void renameConversation(item.id); }} className="flex gap-1">
                    <input autoFocus className="input-field min-w-0 px-2 py-1 text-xs" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
                    <button className="text-indigo-600" aria-label="Save name"><Check size={15} /></button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setConversationId(item.id)} className="min-w-0 flex-1 truncate text-left text-sm text-navy-700">{item.title}</button>
                    <button type="button" title="Rename chat" className="text-muted opacity-0 group-hover:opacity-100" onClick={() => { setRenaming(item.id); setRenameDraft(item.title); }}><Pencil size={13} /></button>
                    <button type="button" title="Delete chat" className="text-muted opacity-0 group-hover:opacity-100 hover:text-error-400" onClick={() => void deleteConversation(item.id)}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))}
            {!loadingHistory && conversations.length === 0 && <p className="px-2 py-4 text-xs text-muted">Your saved chats appear here.</p>}
          </div>
        </aside>
        <section className="flex min-h-[min(74vh,760px)] min-w-0 flex-col">
          <header className="flex items-center gap-3 border-b border-navy-100 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><Bot size={21} /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-navy-900">Bondly AI</h2>
              <p className="text-xs text-muted">AI assistant · private chat</p>
            </div>
            {conversationId && <button type="button" title="Clear chat" onClick={() => void clearConversation()} className="rounded-lg p-2 text-muted hover:bg-error-50 hover:text-error-400"><Trash2 size={17} /></button>}
            <button type="button" title="Chat history" onClick={() => setShowMobileHistory((current) => !current)} className="rounded-lg p-2 text-muted hover:bg-indigo-50 hover:text-indigo-600 lg:hidden"><History size={17} /></button>
            <button type="button" title="New chat" onClick={() => { setConversationId(null); setMessages([]); setError(null); }} className="rounded-lg p-2 text-muted hover:bg-indigo-50 hover:text-indigo-600 lg:hidden"><MessageSquarePlus size={18} /></button>
          </header>
          {showMobileHistory && <div className="max-h-48 space-y-1 overflow-y-auto border-b border-navy-100 bg-canvas p-2 lg:hidden">
            {conversations.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white">
              <button type="button" onClick={() => { setConversationId(item.id); setShowMobileHistory(false); }} className="min-w-0 flex-1 truncate text-left text-sm text-navy-700">{item.title}</button>
              <button type="button" title="Delete chat" onClick={() => void deleteConversation(item.id)} className="text-muted hover:text-error-400"><Trash2 size={14} /></button>
            </div>)}
            {conversations.length === 0 && <p className="p-3 text-center text-xs text-muted">No saved chats yet.</p>}
          </div>}
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
            {messages.length === 0 ? (
              <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Sparkles size={26} /></div>
                <h3 className="text-xl font-semibold text-navy-900">What can I help with?</h3>
                <p className="mt-2 text-sm text-muted">I’m Bondly AI, an assistant—not a person or Bondly member. Your AI chats are private and separate from messages with people.</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-1">
                  {STARTERS.map((prompt) => <button key={prompt} onClick={() => void send(undefined, prompt)} className="rounded-xl border border-navy-100 px-4 py-3 text-left text-sm text-navy-700 hover:border-indigo-200 hover:bg-indigo-50">{prompt}</button>)}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-5">
                {messages.map((item, index) => (
                  <div key={item.id} className={`group flex gap-3 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {item.role === 'assistant' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><Bot size={17} /></div>}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${item.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-canvas text-navy-800'}`}>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.content || (generating && index === messages.length - 1 ? 'Thinking…' : '')}</p>
                      <div className={`mt-1 flex items-center justify-between gap-4 text-[10px] ${item.role === 'user' ? 'text-indigo-100' : 'text-muted'}`}>
                        <time>{timeLabel(item.created_at)}</time>
                        {item.role === 'assistant' && item.content && <button type="button" title="Copy response" onClick={() => { void navigator.clipboard.writeText(item.content).then(() => { setCopied(item.id); window.setTimeout(() => setCopied(null), 1500); }).catch((copyError: unknown) => setError(messageError(copyError))); }} className="opacity-0 group-hover:opacity-100">{copied === item.id ? <Check size={13} /> : <Copy size={13} />}</button>}
                      </div>
                    </div>
                  </div>
                ))}
                {!generating && (messages[messages.length - 1]?.role === 'assistant' || error) && messages.some((message) => message.role === 'user') && <div className="pl-11"><button type="button" onClick={() => void retry()} className="text-xs font-medium text-indigo-600">Retry response</button></div>}
                <div ref={endRef} />
              </div>
            )}
          </div>
          <form onSubmit={(event) => void send(event)} className="border-t border-navy-100 p-3 sm:p-4">
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-navy-200 bg-white p-2 focus-within:border-indigo-400">
              <textarea ref={draftRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} maxLength={12000} rows={1} placeholder="Message Bondly AI…" aria-label="Message Bondly AI" className="max-h-40 min-h-10 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm outline-none" />
              {generating
                ? <button type="button" title="Stop generating" onClick={() => abortRef.current?.abort()} className="rounded-xl bg-error-50 p-2.5 text-error-400"><StopCircle size={18} /></button>
                : <button type="submit" disabled={!draft.trim()} title="Send message" className="rounded-xl bg-indigo-600 p-2.5 text-white disabled:opacity-40"><Send size={17} /></button>}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">Enter to send · Shift+Enter for a new line. AI can make mistakes—verify important information.</p>
          </form>
        </section>
      </div>
    </div>
  );
}
