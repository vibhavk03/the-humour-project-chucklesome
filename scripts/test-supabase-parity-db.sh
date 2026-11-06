#!/usr/bin/env bash
# Fixed demographic sequence permission tests in disposable PostgreSQL.
set -euo pipefail
parity_repo="$(cd "$(dirname "$0")/.." && pwd)"
parity_pg_bin=/opt/homebrew/opt/postgresql@17/bin
parity_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chucklesome-parity-tests.XXXXXX")"
cleanup() {
  "$parity_pg_bin/pg_ctl" -D "$parity_tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$parity_tmp"
}
trap cleanup EXIT
"$parity_pg_bin/initdb" -D "$parity_tmp/data" -A trust --no-locale -U postgres >/dev/null
"$parity_pg_bin/pg_ctl" -D "$parity_tmp/data" -l "$parity_tmp/postgres.log" \
  -o "-F -k $parity_tmp -c listen_addresses=''" -w start >/dev/null || {
    cat "$parity_tmp/postgres.log"
    exit 1
  }
# Diagnostic extensions are exercised in both live projects' verification;
# this local test runs the exact grant section of the reviewed migration.
sed '/^-- RESTRICT/,$d' "$parity_repo/supabase/migrations/20261010180000_align_environment_permissions_and_extensions.sql" > "$parity_tmp/grants.sql"
"$parity_pg_bin/psql" -X -q -h "$parity_tmp" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v grants_file="$parity_tmp/grants.sql" -f "$parity_repo/supabase/tests/demographic_sequence_permissions.sql"
