import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, UserPlus, UserCheck, BookOpen, Sparkles, MessageCircle } from 'lucide-react';
import { Card, Button, Spinner, EmptyState, PageHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import type { Notification } from '../lib/types';

export function Notifications() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications(data ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  const markAllRead = async () => {
    if (!profile) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('user_id', profile.id);
    load();
  };

  const iconFor = (type: string) => {
    if (type.includes('request')) return <UserPlus size={16} className="text-indigo-500" />;
    if (type.includes('accepted') || type.includes('new_connection')) return <UserCheck size={16} className="text-success-400" />;
    if (type.includes('community')) return <BookOpen size={16} className="text-warning-500" />;
    if (type.includes('recommendation')) return <Sparkles size={16} className="text-navy-500" />;
    if (type.includes('message') || type.includes('call') || type.includes('group')) return <MessageCircle size={16} className="text-indigo-500" />;
    return <Bell size={16} className="text-muted" />;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Spinner className="w-8 h-8" /></div>;
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle={`${unreadCount} unread of ${notifications.length} total`}
        action={unreadCount > 0 ? <Button variant="secondary" size="sm" onClick={markAllRead}><CheckCheck size={14} /> Mark all read</Button> : undefined}
      />

      {notifications.length === 0 ? (
        <Card><EmptyState icon={<Bell size={28} />} title="No notifications" description="Connection requests, accepts, and updates will appear here." /></Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`p-4 flex items-start gap-3 transition-all ${!n.read_at ? 'border-l-4 border-l-indigo-400' : ''}`}
            >
              <div className="w-9 h-9 rounded-xl bg-navy-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                {iconFor(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy-900">{n.title}</p>
                {n.body && <p className="text-xs text-muted mt-0.5">{n.body}</p>}
                <p className="text-xs text-muted mt-1">
                  {new Date(n.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              {!n.read_at && (
                <button
                  onClick={() => markRead(n.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-navy-50 hover:text-success-400 transition-colors"
                  title="Mark as read"
                >
                  <Check size={16} />
                </button>
              )}
              {n.type.includes('connection') && (
                <Link to="/app/network">
                  <Button variant="ghost" size="sm">View</Button>
                </Link>
              )}
              {(n.type === 'message' || n.type === 'missed_call' || n.type === 'group_added') && n.related_id && (
                <Link to={`/app/messages/${n.related_id}`}>
                  <Button variant="ghost" size="sm">Open chat</Button>
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
