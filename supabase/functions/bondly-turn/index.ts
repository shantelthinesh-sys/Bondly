import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Use POST to request call connection settings.' });

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anonKey) return respond(401, { error: 'Sign in to place a call.' });
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return respond(401, { error: 'Your sign-in session has expired.' });

  const urls = Deno.env.get('TURN_URL')?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [];
  const secret = Deno.env.get('TURN_SHARED_SECRET');
  if (!urls.length || !secret) return respond(503, { error: 'TURN service is not configured. Calls may only connect on networks that permit direct STUN connections.' });

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const username = `${expiresAt}:${user.id}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
  const credential = btoa(String.fromCharCode(...digest));
  return respond(200, {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: urls.length === 1 ? urls[0] : urls, username, credential },
    ],
    expiresAt,
  });
});
