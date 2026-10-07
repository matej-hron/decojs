# Supabase Project Setup (Dive Log Backend v1)

This is a one-time setup. You need a Supabase account and a new project in the **EU (Frankfurt)** region.

## Create the project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose a name and region **Central EU (Frankfurt)**.
4. **Recommended settings:**
   - **Enable Data API:** ON (default)
   - **Automatically expose new tables:** OFF
   - **Enable automatic RLS:** ON
   
   These settings are why the migration explicitly grants table access with `grant select, insert, update, delete on table public.dives to authenticated;`.

## Run the migration

1. In your project, go to **SQL Editor** (on the left).
2. Click **New query**.
3. Copy the entire contents of `supabase/migrations/0001_dive_log.sql` and paste it.
4. Click **Run**.

## Configure authentication

1. Go to **Authentication** → **URL Configuration**.
2. Set the **Site URL** to `https://decotheory.eu/lab/dive-log.html`.
3. Add a second **Redirect URL** for local development: `http://localhost:5517/lab/dive-log.html`.

## Get your credentials

1. Go to **Project Settings** → **API**.
2. Copy your **Project URL** (e.g. `https://abcdefg.supabase.co`).
3. Copy your **Publishable key** (`sb_publishable_…`; older projects: anon public key). Never the service role / secret key.
4. Open `js/backend/config.js` and fill in:
   ```js
   export const SUPABASE_URL = 'https://your-project.supabase.co';
   export const SUPABASE_ANON_KEY = 'your-anon-key';
   ```

**Never put the `service_role` key anywhere.** It gives full database access and must stay secret.

## Log in once and disable sign-ups

1. Open the page at `https://decotheory.eu/lab/dive-log.html` (or your local URL).
2. Enter your email and click the login button.
3. Check your email for the magic link and sign in.
4. Back in Supabase, go to **Authentication** → **Sign In / Providers**.
5. Turn off **Allow new users to sign up**.

Now only you can log in with your email.

## 7-day pause

Supabase's free tier pauses a project after 7 days without database activity. If this happens:

1. Go to your Supabase dashboard.
2. Click **Resume** on the project card.
3. The page will work again immediately.

You can upgrade to avoid this, but for personal use, the pause is harmless.

## Logbook (step 4c)

Run `supabase/migrations/0002_logbook.sql` in the SQL editor (after `0001_dive_log.sql`). It creates the `sites`, `log_entries` and `media` tables with owner-only row level security, and the private `dive-photos` storage bucket with an owner-folder policy.
