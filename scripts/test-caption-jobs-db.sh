#!/usr/bin/env bash
# Run read access, redaction and aggregate checks in an isolated local PostgreSQL.
set -euo pipefail
caption_repo="$(cd "$(dirname "$0")/.." && pwd)"
caption_pg_bin="${CAPTION_TEST_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
caption_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chucklesome-caption-jobs.XXXXXX")"
cleanup() {
  "$caption_pg_bin/pg_ctl" -D "$caption_tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$caption_tmp"
}
trap cleanup EXIT
"$caption_pg_bin/initdb" -D "$caption_tmp/data" -A trust --no-locale -U postgres >/dev/null
"$caption_pg_bin/pg_ctl" -D "$caption_tmp/data" -l "$caption_tmp/postgres.log" \
  -o "-F -k $caption_tmp -c listen_addresses=''" -w start >/dev/null || {
    cat "$caption_tmp/postgres.log"
    exit 1
  }
"$caption_pg_bin/psql" -X -q -h "$caption_tmp" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$caption_repo/supabase/tests/caption_job_observability.sql"
