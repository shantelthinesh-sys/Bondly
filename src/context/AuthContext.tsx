import { useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { AuthContext } from './auth-context';
import type { AuthContextValue, AuthProviderProps } from './auth-context';

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }, []);

  const ensureProfile = useCallback(async (user: User, fullName: string) => {
    const existing = await fetchProfile(user.id);
    if (existing) return existing;
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        display_name: fullName,
        onboarding_completed: false,
      })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }, [fetchProfile]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error) throw error;
      setSession(data.session);
      if (data.session?.user) {
        let currentProfile = await fetchProfile(data.session.user.id);
        if (!currentProfile) {
          currentProfile = await ensureProfile(
            data.session.user,
            (data.session.user.user_metadata?.full_name as string) || 'New User',
          );
        }
        if (active) setProfile(currentProfile);
      } else {
        setProfile(null);
      }
    }).catch((error: unknown) => {
      if (active) {
        console.error('session initialization error', error);
        setAuthError(formatSupabaseError(error));
        setProfile(null);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setAuthError(null);
        setSession(newSession);
        if (newSession?.user) {
          let currentProfile = await fetchProfile(newSession.user.id);
          if (!currentProfile) {
            currentProfile = await ensureProfile(
              newSession.user,
              (newSession.user.user_metadata?.full_name as string) || 'New User',
            );
          }
          setProfile(currentProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })().catch((error: unknown) => {
        console.error('auth state change error', error);
        setAuthError(formatSupabaseError(error));
        setProfile(null);
        setLoading(false);
      });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [ensureProfile, fetchProfile]);

  const signUp: AuthContextValue['signUp'] = async (email, password, fullName) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' };
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) return { error: error.message };
      if (data.user && data.session) {
        await ensureProfile(data.user, fullName);
      }
      return { error: null, requiresEmailConfirmation: !data.session };
    } catch (error) {
      return { error: formatSupabaseError(error) };
    }
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        let currentProfile = await fetchProfile(data.user.id);
        if (!currentProfile) currentProfile = await ensureProfile(data.user, 'New User');
        setProfile(currentProfile);
      }
      setAuthError(null);
      return { error: null };
    } catch (error) {
      const message = formatSupabaseError(error);
      setAuthError(message);
      return { error: message };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      const p = await fetchProfile(session.user.id);
      setProfile(p);
    }
  };

  const updateProfile: AuthContextValue['updateProfile'] = async (patch) => {
    if (!session?.user) return { error: 'Not signed in' };
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', session.user.id)
      .select('id')
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Profile not found. Please restart onboarding.' };
    await refreshProfile();
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, authError, loading, signUp, signIn, signOut, refreshProfile, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
