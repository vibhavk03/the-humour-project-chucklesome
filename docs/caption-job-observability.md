# Caption job observability

Open **Captions → Caption Jobs** (`/caption-jobs`). The dashboard refreshes five seconds after each completed request; pause it or refresh manually. Filter jobs by creation period (up to 90 days), status, full job/user/image ID, client ID, or humor flavor ID/slug. Counts cover the selected period and search across all statuses. Pagination returns 25 jobs per page.

Open `/caption-job/<id>` for task details, saved step progress, errors, worker dispatch/lease timing, and links to images, flavors, caption requests, prompt chains, and saved captions. Pasting a job UUID into search provides a direct link even when it is outside the list's time range.

Elapsed time includes time in the queue and retries. Terminal jobs stop at their last task update. Attempts are **per current step**, reset by each successful checkpoint, and do not represent lifetime retries. An expired lease indicates work eligible for automatic recovery, not a confirmed permanent failure. Step metadata comes from the submitted snapshot; prompt chain links show recorded model responses. The jobs do not retain a complete event history or timestamps for every step.

## Database setup

Apply `supabase/migrations/20260922030241_caption_job_observability.sql` to the same Supabase project used by this admin app before deploying it. It requires nonchalant's `011_create_caption_generation_jobs` migration. The observability migration was applied to **staging** during implementation and to **production** on September 22, 2026 (UTC). Amplify builds and deploys the app but does not apply database migrations; each environment needs the migration separately.

The browser calls `admin_list_caption_jobs` and `admin_get_caption_job` with the logged-in user's JWT. Both functions require a non-anonymous superadmin and return read-only projections. No service-role key is used. Raw task tables, worker mutations, lease tokens, prompt snapshots and intermediate outputs remain inaccessible through these functions. The UI reports a missing migration, denied access or refresh failure instead of treating it as an empty queue.

## Verification

- `npm test`: status aggregation, elapsed timing, retry/recovery display, request parameters and error behavior, plus existing tests.
- `npm run test:caption-jobs-db`: isolated PostgreSQL tests for authorization, unchanged worker access, redaction, status aggregation, filtering and pagination. Requires PostgreSQL 17 tools at `/opt/homebrew/opt/postgresql@17/bin`, or set `CAPTION_TEST_PG_BIN` to their directory. Uses a private Unix socket with TCP disabled and deletes its disposable database afterward.
- `npm run build`: TypeScript and production Next.js build.

Local browser verification used synthetic jobs to exercise pagination, filters, pause/refresh, stale-data errors, task failures and mobile layout. Anonymous access to the real admin route still redirects to sign-in. An authenticated browser smoke test against staging remains part of deployment verification.
