import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function jsonResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, 'Use POST to send a chat message.');

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse(401, 'Sign in to use Bondly AI.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse(503, 'Bondly AI authentication is not configured.');

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonResponse(401, 'Your session is invalid or expired. Sign in again.');

  const baseUrl = Deno.env.get('OLLAMA_BASE_URL')?.replace(/\/+$/, '');
  const model = Deno.env.get('OLLAMA_MODEL')?.trim();
  if (!baseUrl || !model) {
    return jsonResponse(503, 'Bondly AI is not configured yet. Add OLLAMA_BASE_URL and OLLAMA_MODEL to the Edge Function secrets.');
  }

  let payload: { messages?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, 'The chat request must contain valid JSON.');
  }

  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 30) {
    return jsonResponse(400, 'Include between 1 and 30 recent chat messages.');
  }

  let totalCharacters = 0;
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [{
    role: 'system',
    content: 'You are Bondly AI, a friendly and conversational assistant inside the Bondly social app. You are an AI, never a human or Bondly member. Help with everyday questions, general knowledge, entertainment ideas, friendship and communication advice, creative ideas, social captions and bios, conversation starters, and productivity. Be respectful, clear, and honest about uncertainty. Do not claim to have access to private Bondly accounts, messages, or live app data.',
  }];
  for (const item of payload.messages) {
    if (
      typeof item !== 'object' || item === null
      || !('role' in item) || !('content' in item)
      || (item.role !== 'user' && item.role !== 'assistant')
      || typeof item.content !== 'string'
      || item.content.trim().length === 0
      || item.content.length > 12000
    ) {
      return jsonResponse(400, 'A chat message is invalid or too long.');
    }
    totalCharacters += item.content.length;
    if (totalCharacters > 40000) return jsonResponse(413, 'The conversation is too long. Start a new chat or remove older messages.');
    messages.push({ role: item.role, content: item.content });
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return jsonResponse(400, 'The latest message must be from you.');
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: limitError } = await adminClient.rpc('consume_bondly_ai_request', { target_user: user.id });
  if (limitError) return jsonResponse(503, 'Bondly AI request limits are unavailable. Apply the latest Supabase migration.');
  if (!allowed) return jsonResponse(429, 'You have reached the daily Bondly AI limit. Try again tomorrow.');

  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/x-ndjson' });
  const apiKey = Deno.env.get('OLLAMA_API_KEY');
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const upstream = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ model, messages, stream: true, options: { num_predict: 2048 } }),
    });
    if (!upstream.ok) {
      clearTimeout(timeout);
      if (upstream.status === 404) return jsonResponse(502, 'The configured Ollama model or chat endpoint was not found. Check OLLAMA_BASE_URL and OLLAMA_MODEL.');
      if (upstream.status === 429) return jsonResponse(429, 'The AI service is busy. Please try again shortly.');
      return jsonResponse(502, 'The Ollama service rejected the request. Verify the server and model configuration.');
    }
    if (!upstream.body) {
      clearTimeout(timeout);
      return jsonResponse(502, 'The Ollama service returned an empty response.');
    }
    const reader = upstream.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            clearTimeout(timeout);
            controller.close();
          } catch (streamError) {
            clearTimeout(timeout);
            controller.error(streamError);
          }
        })();
      },
      async cancel(reason) {
        clearTimeout(timeout);
        controller.abort();
        await reader.cancel(reason);
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === 'AbortError') {
      return jsonResponse(504, 'Bondly AI timed out while waiting for Ollama. Try a smaller request or check the server.');
    }
    return jsonResponse(502, 'Bondly AI cannot reach the configured Ollama server. Confirm that it is reachable from the deployed Edge Function.');
  }
});
