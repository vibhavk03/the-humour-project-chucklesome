Verified Supabase migration baseline
===================================

The shared starting point is migration 20261010180000. Both projects were
checked against the same public application schema after that migration.
Earlier migration histories are preserved as immutable per-project archives
in current.json. They reflect what each project actually ran; they are not
rewritten to claim migrations ran where they did not.

current.json contains hashes of object definitions, rather than function
bodies or credentials. It checks public and funnystudy_notifications schemas,
Storage policies, extension versions, application Realtime publications,
Google-only Auth, renewable sessions, and shared migration source checksums.
Schema/table/sequence grants, RLS flags, defaults, function definitions, and
policy expressions are included in the hashes.

Expected differences are limited to experiments.env, physical column order,
comments, and Supabase-managed runtime objects outside the checked schemas.
The environment default is validated before it is normalized. Reference
data, users, sequence current values, buckets, redirect URLs, and credentials
are not synchronized by this baseline.

Checks
------
npm run test:supabase-parity
npm run supabase:baseline-check
npm run supabase:drift

Local live checks use the existing logged-in Supabase CLI token from Keychain.
CI uses the encrypted SUPABASE_ACCESS_TOKEN Actions secret approved by the
user. No Supabase service-role key is used. The database requests set
read_only=true. The checker has no database or Auth mutation endpoints.

The Supabase drift workflow runs offline checks on relevant pull requests
and pushes. Live checks run only on the default branch, with a daily schedule
and manual workflow_dispatch. Pull requests and other branches receive no
Supabase token. The workflow is read-only and never deploys migrations.

Future migration process
------------------------
1. Add a reviewed timestamped SQL file under supabase/migrations with a
   version greater than 20261010180000. Never edit an applied migration.
2. Use a reviewed, version-pinned rollout script, following
   scripts/align-supabase-environments.mjs. Test the migration in a rolled-back
   transaction where possible, and test application behavior in staging.
   For operations such as concurrent index builds, use the existing reviewed
   performance rollout pattern instead of placing them inside a transaction.
3. Apply the same reviewed source to production after staging passes.
   Record the exact file contents as a single statements array element in
   supabase_migrations.schema_migrations, in the same transaction when possible.
   Current rollout scripts already follow this convention. Do not mix this
   ledger convention with CLI tools that split migration SQL into separate
   statements without first implementing and reviewing checksum compatibility.
4. Run node scripts/check-supabase-drift.mjs --capture-baseline only after both
   live schemas match and all new migrations have matching source checksums.
   Review the current.json change alongside the migration, then run
   npm run supabase:drift. This command cannot change either database or Auth.

The checker rejects changes to archived history, missing applied migration
sources, edits to applied sources, unapplied shared migrations, and unreviewed
schema or Auth drift. Baseline capture also refuses divergent projects.
There is no blind migration repair, historical replay, or production-data copy.

Auth sessions
-------------
Google is the only enabled login provider. Email, phone, anonymous, custom
OAuth, passkey, and SAML sign-in are disabled where available. Session maximum
lifetime and inactivity timeout are zero, and single-session restriction is
disabled. Normal one-hour JWT expiry and refresh-token rotation are preserved.
The browser client persists sessions and automatically refreshes tokens;
its existing 400-day cookies are renewed on refresh. Sessions can still end
after sign-out, revocation, or loss of browser storage.

Legacy password URLs redirect to the Google landing page through next.config.ts.
These application route changes take effect with the next app deployment.
