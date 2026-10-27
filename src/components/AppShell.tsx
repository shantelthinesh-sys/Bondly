import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  House, LayoutDashboard, Users, Sparkles, Network, Share2, UsersRound,
  Bell, Bookmark, BarChart3, Settings, Shield, Menu, X, LogOut,
  GitBranch, ScanSearch, Search, ScrollText,
} from 'lucide-react';
import { Logo, Avatar } from './ui';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';

const NAV = [
  { to: '/app', label: 'Home', icon: House, end: true },
  { to: '/app/overview', label: 'Network Overview', icon: LayoutDashboard },
  { to: '/app/discover', label: 'Discover People', icon: Users },
  { to: '/app/recommendations', label: 'Friend Recommendations', icon: Sparkles },
  { to: '/app/network', label: 'My Network', icon: Network },
  { to: '/app/graph', label: 'Social Graph', icon: Share2 },
  { to: '/app/communities', label: 'Communities', icon: UsersRound },
  { to: '/app/paths', label: 'Connection Paths', icon: GitBranch },
  { to: '/app/saved', label: 'Saved Profiles', icon: Bookmark },
  { to: '/app/notifications', label: 'Notifications', icon: Bell },
  { to: '/app/insights', label: 'Recommendation Insights', icon: ScanSearch },
  { to: '/app/bfs', label: 'Connection Explorer', icon: Search },
  { to: '/app/mutual-friends', label: 'Mutual Friends', icon: ScanSearch },
  { to: '/app/analytics', label: 'Network Analytics', icon: BarChart3 },
  { to: '/app/rules', label: 'Recommendation Signals', icon: ScrollText },
  { to: '/app/settings', label: 'Profile Settings', icon: Settings },
  { to: '/app/privacy', label: 'Privacy Settings', icon: Shield },
];

export function AppShell() {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!profile) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .is('read_at', null);
      setUnreadCount(count ?? 0);
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [profile]);

  const handleSignOut = async () => {
    setSignOutError(null);
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out.');
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* Sidebar - desktop */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-navy-50 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-50">
          <NavLink to="/app">
            <Logo size="sm" />
          </NavLink>
          <button
            className="lg:hidden text-muted"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-navy-600 hover:bg-navy-50 hover:text-navy-800'
                }`
              }
            >
              <item.icon size={18} />
              <span className="flex-1">{item.label}</span>
              {item.label === 'Notifications' && unreadCount > 0 && (
                <span className="badge-indigo">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-navy-50">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar src={profile?.avatar_url} name={profile?.display_name ?? 'User'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy-800 truncate">
                {profile?.display_name}
              </p>
              <p className="text-xs text-muted truncate">{profile?.headline || 'Member'}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 mt-1 text-sm text-muted hover:text-error-400 hover:bg-error-50 rounded-xl transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
          {signOutError && <p role="alert" className="px-3 pt-2 text-xs text-error-400">{signOutError}</p>}
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-navy-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-navy-50 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-navy-700">
            <Menu size={22} />
          </button>
          <Logo size="sm" />
          <NavLink to="/app/notifications">
            <div className="relative">
              <Bell size={20} className="text-navy-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[10px] rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
          </NavLink>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
