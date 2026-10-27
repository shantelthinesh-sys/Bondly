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

Before applying anything to a database with existing users or content:

- Take a database backup.
- Check the database's current schema and migration history. Apply only migrations that have not already been applied, in the order above. Do not blindly rerun the full list or run the core-schema migration on an initialized project.
- This repository does not confirm whether any migration has been applied to your remote Supabase project.
- The current Phase 3 migration preserves legacy profile fields, interests, and categories even though the app no longer displays education-focused features. An earlier version of that migration contained statements that deleted/changed that data. If that earlier version was already run, do not rerun it; check your backups before making any recovery changes.

After applying the required migrations, confirm that the relevant tables (`posts`, `post_comments`, `post_media`, `stories`, and `story_views`) and the private `bondly-stories` and `bondly-posts` Storage buckets exist. Then refresh the app and test with authenticated accounts. Row-level security controls access; do not make either media bucket public.
