# Quick Study import jobs

Quick Study saves the supplied captions, image rows with their original URLs,
and replacement tasks together in one database transaction after Step 1.
Nonchalant returns permanent image and caption IDs immediately. Caption review,
editing, deduplication, and study creation can proceed while SQS workers replace
external URLs using nonchalant's existing image upload pipeline. The initial
request does not download images or generate thumbnails.

The admin page shows the original images without upload progress indicators.
Workers update the same image rows to the matching environment's CDN URLs.
External URLs remain usable while work is pending or after a failure.

## Reliability and privacy

- Each distinct trimmed source URL gets one task. Captions sharing an image share
  its upload, including a pasted URL matching an authorized image ID's saved URL.
- The browser creates a job UUID once and retains the exact submission for retries.
  The database rejects changed inputs or a different owner for that UUID.
- Image IDs, S3 keys, and caption IDs stay fixed across retries. Shared captions
  keep the same image ID after its URL is replaced.
- A database lease prevents duplicate queue deliveries from processing a live
  task. Replacement completion checks its lease and the image's source URL in
  one transaction. Expired leases cannot change URLs; deleted images are not
  recreated, and an independently changed URL is not overwritten.
- Transient failures retry with exponential backoff, up to five attempts.
  The scheduled dispatcher runs every minute and recovers failed queue sends and
  expired worker leases. SQS also has a dead-letter queue for delivery failures.
  Explicit Retry resets failed tasks only.
- Source downloads have a two-minute deadline. Workers have a twelve-minute
  execution limit; database leases last thirteen minutes. Worker concurrency is
  limited to five across the environment.
- Staging saves images at `images.almostcrackd.ai`; production saves them at
  `images.crackd.ai`. Images from the other environment are copied. Each job
  records its destination host, and a worker in another environment rejects it.
  Temporary external URLs are intentionally saved before replacement.
- Images and captions created by imports are private, with the initiating user's
  audit fields. Workers do not create or publish studies.
- Submission, status, and retry endpoints require the logged-in user's JWT,
  superadmin access, and job ownership. Referenced image IDs are checked through
  the user's database client before acceptance. The backend uses its established
  worker credentials for durable execution, without storing user JWTs.
- The page silently refreshes image previews every ten seconds while replacements
  remain pending, reconnects after temporary network errors,
  and resumes from `/study-quick?importJob=<uuid>` after refresh. Closing the page
  stops polling; accepted jobs keep running. Keep the resume URL to return later.
  The resume parameter is removed after the private study is created.
- Polling preserves edits and deletions made during review. A fresh resume reads
  saved caption edits and omits deleted captions. Subsequent steps require saved
  caption IDs but do not wait for hosted image URLs. Preview connection errors
  do not turn saved captions into failed imports.
- Optional image categorization remains a separate best-effort request. It does
  not delay job completion or caption review.
- Previously accepted jobs retain their original worker mode. They continue
  saving captions after image preparation and use the existing two-second poll.

## Observability and alerts

`/external-image-replacement-jobs` is linked under Images and lists replacement
tasks with their IDs, source/current URLs, owners, attempts, timing, errors, and
results. Filter by status or owner, paginate, pause automatic refresh, or retry a
failed task. A retry preserves existing captions and images; only the importing
user can retry their jobs. URLs already on the matching CDN do not need a
replacement and are excluded from this page.

In-app alerts appear throughout the admin menu when the signed-in user has
unacknowledged failed jobs. Alerts link to that user's failed jobs and can be
dismissed. Dismissal is stored in the database and acknowledges only failures
observed by that alert's timestamp. A later failure, including a failed retry,
alerts again. Alerts refresh every thirty seconds while the tab is visible and
on return to the tab. No email alerts are sent.

## Rollout order

For each environment, independently:

1. If the original queue schema is absent, apply nonchalant's
   `database/migrations/025_quick_study_import_jobs.sql`. Then apply
   `database/migrations/026_save_quick_study_before_image_replacement.sql` to that
   environment's Supabase database using the existing migration process.
   The fixed `scripts/migrate-quick-study-jobs.mjs` runner installs migration 025.
   For 026, run `node scripts/migrate-external-image-replacement-jobs.mjs <stage>
   --check`, then `--apply`, then `--verify`, where stage is `staging` or
   `production`. This runner uses the existing Supabase CLI login and checks
   migration history, schema, and worker-only permissions. Migration 026 preserves
   existing jobs and requires no resubmission or image/caption backfill.
2. Deploy nonchalant's API and SST infrastructure to the matching stage. This
   creates `QuickStudyJobsQueue`, `QuickStudyJobsDeadLetterQueue`, the image
   worker, and `QuickStudyJobsDispatcher`. SST supplies
   `QUICK_STUDY_JOBS_QUEUE_URL` and the existing database/S3 worker configuration.
   The API resource depends on the updated worker function so new immediate-save
   imports cannot reach a worker running the old completion behavior.
3. Deploy chucklesome through its existing Amplify GitHub connection after the
   API is available: push the reviewed commit to `staging` for
   `admin.almostcrackd.ai`, then promote that commit to `main` for
   `admin.crackd.ai`. Check that each Amplify build finishes successfully.
   Chucklesome's legacy SST configuration no longer manages the live admin
   domains.
4. Verify an authenticated import with two captions sharing an external URL and
   an image URL from the opposite environment. Refresh while it runs. Confirm
   caption IDs are available before uploads finish, the same import resumes,
   shared captions use one image ID, and successful replacements use the matching
   CDN. Edit/delete captions while replacements run and refresh again. Inspect
   the jobs page, dismiss a failure alert, retry a failed task, and confirm IDs
   and caption edits are preserved. A failed retry should produce a new alert.

No production migration or infrastructure deployment is performed by the local
test commands. The queue requires the migration and backend deployment; the page
does not fall back to synchronous uploads when those are unavailable.

## Validation and diagnosis

In chucklesome, run `npm test` and `npm run build`.
In nonchalant, run `npm test -- --runInBand`, `npm run build`, and
`npm run test:quick-study-jobs:db`. The last command starts a disposable local
PostgreSQL cluster and checks transactional and access-control invariants.

Inspect `quick_study_import_jobs` and `quick_study_import_tasks` through the
backend's normal operational tooling. Task status, attempts, `available_at`,
`dispatched_at`, lease expiry, and bounded error messages distinguish retry
backoff, dispatch failures, and terminated workers. Inspect the dispatcher and
worker logs and the dead-letter queue for delivery failures. Queue bodies and
worker error logs contain identifiers, rather than source URLs or caption text.

Import limits are 2,000 captions and a four-megabyte request. Split larger lists.
Replacement job counts refer to distinct image tasks; caption review counts
saved caption rows.
