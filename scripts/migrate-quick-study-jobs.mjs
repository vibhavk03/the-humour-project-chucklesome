// Fixed migration runner for the two existing nonchalant databases.
// Credentials remain in memory and are never passed on the command line.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from '/Users/Shared/allstar/nonchalant/node_modules/pg/lib/index.js'

const [stage, mode = '--check', transport, ...extra] = process.argv.slice(2)
const projects = { staging: 'qihsgnfjqmkjmoowyfbn', production: 'kglxxmrvmrxiyigarjfh' }
if (!projects[stage] || !['--check', '--apply', '--verify'].includes(mode) ||
    (transport && transport !== '--management') || extra.length) {
  throw new Error('Use staging|production and --check|--apply|--verify, optionally --management')
}
const apiRoot = fileURLToPath(new URL('../../nonchalant/', import.meta.url))
const migration = await readFile(apiRoot + 'database/migrations/025_quick_study_import_jobs.sql', 'utf8')
const migrationName = 'quick_study_import_jobs'
const migrationVersion = '20261008224000'
const readme = transport ? '' : await readFile(apiRoot + 'README.md', 'utf8')
const connection = (readme.match(/postgres(?:ql)?:\/\/[^\s"'\u0060]+/g) ?? []).find(value => {
  try { return new URL(value).hostname === `db.${projects[stage]}.supabase.co` } catch { return false }
})
if (!transport && !connection) throw new Error('No configured database migration connection for ' + stage)
const url = connection && new URL(connection)
const client = url && new pg.Client({
  host: url.hostname, port: Number(url.port || 5432), user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password), database: url.pathname.slice(1) || 'postgres',
  ssl: { ca: await readFile(apiRoot + '.data/schema-alignment/supabase-ca.crt', 'utf8'), rejectUnauthorized: true },
  connectionTimeoutMillis: 15_000, query_timeout: 90_000,
})
const functions = [
  'submit_quick_study_import_job(uuid,uuid,jsonb,jsonb)', 'get_quick_study_import_job(uuid,uuid)',
  'retry_quick_study_import_job(uuid,uuid)', 'claim_quick_study_import_task(uuid)',
  'finish_quick_study_import_task(uuid,uuid,uuid,text)', 'fail_quick_study_import_task(uuid,uuid,text,boolean)',
  'dispatch_quick_study_import_tasks(uuid)',
]
const inspect = async () => {
  const history = await client.query('SELECT version,name,statements FROM supabase_migrations.schema_migrations WHERE name=$1 OR version=$2', [migrationName, migrationVersion])
  const tables = await client.query(`SELECT relname,relrowsecurity,
    has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
    has_table_privilege('anon',c.oid,'INSERT') AS anon_insert
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND relname IN ('quick_study_import_jobs','quick_study_import_tasks') ORDER BY relname`)
  const rpcs = await client.query(`SELECT name, to_regprocedure('public.'||name) IS NOT NULL AS exists,
    CASE WHEN to_regprocedure('public.'||name) IS NOT NULL
      THEN has_function_privilege('authenticated',to_regprocedure('public.'||name),'EXECUTE') ELSE false END AS authenticated_execute,
    CASE WHEN to_regprocedure('public.'||name) IS NOT NULL
      THEN has_function_privilege('anon',to_regprocedure('public.'||name),'EXECUTE') ELSE false END AS anon_execute
    FROM unnest($1::text[]) name`, [functions])
  return { history: history.rows, tables: tables.rows, rpcs: rpcs.rows }
}
const verify = state => {
  const history = state.history[0]
  if (state.history.length !== 1 || history.version !== migrationVersion || history.name !== migrationName ||
      history.statements?.[0]?.trim() !== migration.trim()) throw new Error('Migration history does not match the reviewed SQL')
  if (state.tables.length !== 2 || state.tables.some(t => !t.relrowsecurity || t.authenticated_select || t.anon_insert) ||
      state.rpcs.length !== functions.length || state.rpcs.some(f => !f.exists || f.authenticated_execute || f.anon_execute)) throw new Error('Queue schema or access-control verification failed')
}

const literal = value => "'" + value.replaceAll("'", "''") + "'"
const rpcNames = 'ARRAY[' + functions.map(literal).join(',') + ']::text[]'
const snapshotSql = `SELECT json_build_object(
  'history',(SELECT coalesce(json_agg(h),'[]'::json) FROM
    (SELECT version,name,statements FROM supabase_migrations.schema_migrations
     WHERE name=${literal(migrationName)} OR version=${literal(migrationVersion)}) h),
  'tables',(SELECT coalesce(json_agg(t),'[]'::json) FROM
    (SELECT relname,relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
      has_table_privilege('anon',c.oid,'INSERT') AS anon_insert
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND relname IN ('quick_study_import_jobs','quick_study_import_tasks') ORDER BY relname) t),
  'rpcs',(SELECT json_agg(f) FROM
    (SELECT name,to_regprocedure('public.'||name) IS NOT NULL AS exists,
      CASE WHEN to_regprocedure('public.'||name) IS NOT NULL
        THEN has_function_privilege('authenticated',to_regprocedure('public.'||name),'EXECUTE') ELSE false END AS authenticated_execute,
      CASE WHEN to_regprocedure('public.'||name) IS NOT NULL
        THEN has_function_privilege('anon',to_regprocedure('public.'||name),'EXECUTE') ELSE false END AS anon_execute
     FROM unnest(${rpcNames}) name) f)
) AS snapshot;`
const settings = "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='60s';"
const printResult = (state, exists) => console.log(JSON.stringify({
  stage, project: projects[stage], mode, migration: migrationName,
  sha256: createHash('sha256').update(migration).digest('hex'),
  installed: exists || mode === '--apply', applied: mode === '--apply' && !exists,
  tables: state.tables, functionsVerified: state.rpcs.filter(f => f.exists).length,
}, null, 2))

async function runManagement() {
  // Reuse the existing Supabase CLI login without exposing its access token.
  const stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const token = stored.startsWith('go-keyring-base64:') ? Buffer.from(stored.slice(18), 'base64').toString('utf8') :
    stored.startsWith('go-keyring-encoded:') ? Buffer.from(stored.slice(19), 'hex').toString('utf8') : stored
  const query = async (sql, readOnly) => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projects[stage]}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) throw new Error('Supabase Management API returned HTTP ' + response.status)
    const rows = await response.json()
    const state = rows.find(row => row.snapshot)?.snapshot
    if (!state) throw new Error('Supabase Management API did not return a migration snapshot')
    return state
  }
  let state = await query(`BEGIN READ ONLY; ${settings} ${snapshotSql} COMMIT;`, true)
  const exists = state.history.length > 0
  if (exists) verify(state)
  else if (state.tables.length || state.rpcs.some(f => f.exists)) throw new Error('Unrecorded queue objects already exist; refusing to overwrite them')
  if (mode === '--verify' && !exists) throw new Error('Migration is not installed')
  if (mode === '--apply' && !exists) {
    const body = migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
    // Check again after acquiring the migration lock; keep all changes in one request and transaction.
    state = await query(`BEGIN; ${settings}
      DO $$ BEGIN
        IF NOT pg_try_advisory_xact_lock(hashtextextended('nonchalant:quick-study-import-jobs',0)) THEN
          RAISE EXCEPTION 'Migration already running';
        END IF;
        IF EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE name=${literal(migrationName)} OR version=${literal(migrationVersion)})
          OR to_regclass('public.quick_study_import_jobs') IS NOT NULL OR to_regclass('public.quick_study_import_tasks') IS NOT NULL
          OR EXISTS(SELECT FROM unnest(${rpcNames}) name WHERE to_regprocedure('public.'||name) IS NOT NULL) THEN
          RAISE EXCEPTION 'Migration state changed since preflight';
        END IF;
      END; $$;
      ${body}
      INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES(${literal(migrationVersion)},${literal(migrationName)},ARRAY[${literal(migration)}]);
      NOTIFY pgrst, 'reload schema';
      ${snapshotSql} COMMIT;`, false)
    verify(state)
  }
  printResult(state, exists)
}

try {
  if (transport) {
    await runManagement()
  } else {
  await client.connect()
  await client.query("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='60s';")
  if (mode === '--apply') {
    await client.query(`DO $$ BEGIN IF NOT pg_try_advisory_xact_lock(hashtextextended('nonchalant:quick-study-import-jobs',0)) THEN RAISE EXCEPTION 'Migration already running'; END IF; END; $$;`)
  } else await client.query('SET TRANSACTION READ ONLY')
  let state = await inspect()
  const exists = state.history.length > 0
  if (exists) verify(state)
  else if (state.tables.length || state.rpcs.some(f => f.exists)) throw new Error('Unrecorded queue objects already exist; refusing to overwrite them')
  if (mode === '--apply' && !exists) {
    // Keep DDL, history, and PostgREST notification in one transaction.
    const body = migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
    await client.query(body)
    await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [migrationVersion, migrationName, [migration]])
    await client.query("NOTIFY pgrst, 'reload schema'")
    state = await inspect()
    verify(state)
  }
  if (mode === '--verify' && !exists) throw new Error('Migration is not installed')
  await client.query(mode === '--apply' ? 'COMMIT' : 'ROLLBACK')
  printResult(state, exists)
  }
} catch (error) {
  await client?.query('ROLLBACK').catch(() => undefined)
  console.error(JSON.stringify({ stage, mode, code: error.code, error: error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') }))
  process.exitCode = 1
} finally { await client?.end() }
