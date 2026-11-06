#!/usr/bin/env bash
# Run only the fixed index and image-policy migration tests in disposable Postgres.
set -euo pipefail
perf_repo="$(cd "$(dirname "$0")/.." && pwd)"
perf_pg_bin=/opt/homebrew/opt/postgresql@17/bin
perf_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chucklesome-performance-tests.XXXXXX")"
cleanup() {
  "$perf_pg_bin/pg_ctl" -D "$perf_tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$perf_tmp"
}
trap cleanup EXIT
"$perf_pg_bin/initdb" -D "$perf_tmp/data" -A trust --no-locale -U postgres >/dev/null
"$perf_pg_bin/pg_ctl" -D "$perf_tmp/data" -l "$perf_tmp/postgres.log" \
  -o "-F -k $perf_tmp -c listen_addresses=''" -w start >/dev/null || {
    cat "$perf_tmp/postgres.log"
    exit 1
  }
"$perf_pg_bin/psql" -X -q -h "$perf_tmp" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$perf_repo/supabase/tests/performance_indexes_and_image_rls.sql"
