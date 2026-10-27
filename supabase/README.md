# Supabase setup

## Configure the app

In the Supabase dashboard, open **Project Settings → API** and copy the project URL and publishable key into the local environment file (for example, `.env.local`):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

The publishable key is intended for browser use; never put a `service_role` or secret key in a `VITE_` variable. Restart the Vite development server after changing environment variables.

## Apply database migrations

The app's schema is defined by the SQL files in `supabase/migrations`. In the Supabase dashboard, open **SQL Editor**, run each migration as a separate script, and wait for it to succeed before running the next:

1. `20261027120741_bondly_core_schema.sql`
2. `20261027190000_phase1_real_profiles.sql`
3. `20261028200000_phase2_social_feed.sql`
4. `20261028210000_phase3_stories_and_social_profiles.sql`
5. `20261028220000_phase4_feed_media_and_interactions.sql`
6. `20261029200000_messaging_calls_and_ai.sql`

Before applying anything to a database with existing users or content:

- Take a database backup.
- Check the database's current schema and migration history. Apply only migrations that have not already been applied, in the order above. Do not blindly rerun the full list or run the core-schema migration on an initialized project.
- This repository does not confirm whether any migration has been applied to your remote Supabase project.
- The current Phase 3 migration preserves legacy profile fields, interests, and categories even though the app no longer displays education-focused features. An earlier version of that migration contained statements that deleted/changed that data. If that earlier version was already run, do not rerun it; check your backups before making any recovery changes.

After applying the required migrations, confirm that the relevant tables (`posts`, `post_comments`, `post_media`, `stories`, and `story_views`) and the private `bondly-stories` and `bondly-posts` Storage buckets exist. Then refresh the app and test with authenticated accounts. Row-level security controls access; do not make either media bucket public.

The messaging migration also creates the private message tables and `bondly-messages` Storage bucket. It adds username handles, per-user message-request privacy, conversation/group management, call signaling/history, and private AI history. The migration enables Realtime publication for message and call tables. If Realtime is disabled for your project, enable it in Supabase before testing.

## Deploy Bondly AI and call-signaling functions

The AI and TURN endpoints are Supabase Edge Functions; they are not available until deployed:

```powershell
supabase functions deploy bondly-ai
supabase functions deploy bondly-turn
```

In the Supabase dashboard, open **Edge Functions → Secrets** (or use `supabase secrets set`) and configure:

| Secret | Required | Purpose |
|---|---:|---|
| `OLLAMA_BASE_URL` | Yes for AI | Server-reachable Ollama origin, without `/api/chat`, e.g. `https://ollama.example.com` |
| `OLLAMA_MODEL` | Yes for AI | Exact model name installed on that Ollama server |
| `OLLAMA_API_KEY` | No | Optional bearer token for providers that require one; standard local Ollama usually does not |
| `APP_ORIGIN` | Recommended | Exact deployed Bondly origin for Edge Function CORS, e.g. `https://bondly.example.com` |
| `TURN_URL` | Recommended for reliable calls | Comma-separated TURN URLs, such as `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp` |
| `TURN_SHARED_SECRET` | Recommended for reliable calls | Coturn REST shared secret; the function issues time-limited credentials and never sends this secret to the browser |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not copy the service-role key or Ollama/TURN secrets into `.env`, `VITE_` variables, or browser code.

**Ollama reachability:** a private Ollama server, including `http://localhost:11434`, is not reachable from a deployed Supabase Edge Function. Host Ollama on a network reachable by Supabase, expose it through a properly secured HTTPS endpoint, or deploy a backend beside Ollama and adapt the Edge Function URL. CORS is not a substitute for network reachability. If the provider requires authentication other than a bearer token, supply its authentication format before adapting the function.

**Calls:** audio/video uses WebRTC, Supabase Realtime signaling, public STUN for best-effort connectivity, and optional short-lived Coturn REST credentials. For reliable calls across restrictive NATs/mobile networks, configure a publicly reachable TURN service and the secrets above. The Messages page must remain open to receive incoming call UI. Browser microphone/camera access requires HTTPS (localhost is allowed for development). Call delivery, media connectivity, and two-account workflows must be tested on your deployed project; this repository has not verified them against your Supabase project or TURN server.
