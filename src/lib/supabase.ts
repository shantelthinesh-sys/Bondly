import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export function formatSupabaseError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === 'PGRST205' || code === '42P01') {
      return 'The Bondly database schema is missing. In the Supabase SQL Editor, run supabase/migrations/20261027120741_bondly_core_schema.sql, then reload the app.';
    }
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected Supabase error occurred.';
}
