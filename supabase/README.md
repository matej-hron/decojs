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

Run these in the SQL editor, in order, after `0001_dive_log.sql`:

1. `supabase/migrations/0002_logbook.sql` creates the `sites`, `log_entries` and `media` tables with owner-only row level security, and the private `dive-photos` storage bucket with an owner-folder policy.
2. `supabase/migrations/0003_logbook_dismissed.sql` adds `dives.logbook_dismissed` (so a deleted entry is not recreated from its recording) and limits the `dive-photos` bucket to JPEG files of at most 10 MiB.

**Run both migrations in Supabase BEFORE the code is deployed to `main`.** Once the new code is live, the logged-in page fails without these tables and the column.

## Community migration (0004, DecoTrail)

`supabase/migrations/0004_community.sql` adds member profiles, the `avatars` bucket, per-dive visibility
(`private | members | link`, existing dives become `members`) and the read functions other members use.
Run it once in the **SQL Editor** after 0001–0003; running it again is safe.

Test it locally first (needs Docker): `bash supabase/tests/run.sh` applies a small Supabase stub and every
migration to a throwaway Postgres, runs 0004 twice and checks the access rules as two different users.

## Profile documents migration (0007, DecoTrail)

`supabase/migrations/0007_profile_documents.sql` adds `qualifications` and `medical_checks` (owner-only), the
private `documents` bucket (10 MiB, JPEG/PDF, owner folder only) and `community_qualifications()`, which gives
members only the agency + level of cards the owner chose to show. Run it after 0001–0005 (it needs 0005's
`share_owner_active`); it does not depend on 0006. Running it again is safe. Test: `bash supabase/tests/run.sh`.

**Deleting a user in the dashboard:** the rows go with the login (`on delete cascade`), the scans do not.
First remove the user's folder in Storage → `documents` → `<user id>/` (also `dive-logs`, `dive-photos`,
`avatars`). Orphans can be found with
`select name from storage.objects where bucket_id = 'documents' and split_part(name, '/', 1)::uuid not in (select id from auth.users);`
