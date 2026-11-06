# Image duplicate checking

Quick Study's file picker, the image upload button, and common-use file imports
use SHA-256 preflight checks. The browser prepares the file, including optional
common-use compression, hashes the exact bytes it will send, and asks nonchalant
for an authorized duplicate in the current environment. A match returns the
existing image without transferring file bytes. Otherwise the browser uploads
directly to temporary S3 storage and the API verifies the hash before processing
and permanently registering it.

`/api/images/file-upload/prepare` and `/complete` forward the browser's current
JWT to nonchalant. They authenticate inside their handlers and return JSON auth
errors, including on localhost, without depending on the page redirect middleware
or cross-origin Authorization support. No service-role key enters the admin app.
Simultaneous identical file uploads share pending work within a browser session;
API 409 responses retry registration without uploading the temporary file again.
New images keep best-effort structural category classification after the response;
reused image records are not reclassified.

Pasted external URLs continue to save captions and images immediately. The
background worker hashes downloaded bytes and reuses matching permanent files
and thumbnails. It preserves saved image IDs, caption IDs, and user edits. The
existing completed-source-URL lookup remains the fastest path; a new URL must
still be downloaded to determine its content hash.

Staging resolves only to `images.almostcrackd.ai`, and production only to
`images.crackd.ai`. SHA-256 is exact content matching; resized or recompressed
files may differ. The API also records processed-file hashes because metadata
stripping and format conversion change bytes.

## Rollout

1. Apply nonchalant migration `028_image_content_hashes.sql` in staging and
   production after migration 027.
2. Build and deploy nonchalant and its worker using the normal staging and
   production deployment commands. GitHub does not deploy nonchalant.
3. Deploy the admin app through its existing Amplify branches.
4. Run the resumable backfill in nonchalant to register existing hosted files;
   see `nonchalant/database/README.md` for commands and limitations.

From this repository, `node scripts/migrate-image-content-hashes.mjs staging
--check` checks migration 027 and detects conflicting hash objects. Use `--apply`
to install only the reviewed migration 028, `--verify` to check its recorded SQL,
function bodies, indexes, trigger, cascading foreign keys, and backend-only
permissions, and `--smoke` for a rollback check of upload leases, hash reuse,
environment and ownership isolation, and replacement of a saved image without
losing caption edits. Once installed, these checks also report fingerprint
coverage and remaining hosted files for monitoring a backfill. Replace `staging` with `production` only when deploying
production. The runner uses the saved Supabase CLI login without printing it.

The migration and backend deployment are required for hash checking. The admin
file flow can read legacy API responses that return only an image ID, but an
older API does not provide the new hash preflight behavior.
