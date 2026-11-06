// Fixed October 10 Google Auth, sequence grants, and extension rollout.
// No arbitrary SQL, project arguments, service-role keys, or credential output.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { catalogSql } from './schema-sync-catalog.mjs'
import { projects, baselineVersion, migrationName, canonical, sha256, authPatch, safeAuth, authState,
  fingerprint, differences } from './supabase-parity.mjs'

const mode = process.argv[2] ?? '--check'
if (process.argv.length > 3 || !['--check', '--dry-run', '--apply', '--verify', '--configure-ci'].includes(mode))
  throw new Error('Use --check, --dry-run, --apply, --verify, or --configure-ci')
const root = fileURLToPath(new URL('../', import.meta.url))
const out = root + '.data/schema-sync-20261010/environment-alignment/'
const source = await readFile(root + `supabase/migrations/${baselineVersion}_${migrationName}.sql`, 'utf8')
const expectedSourceHash = 'e3b5dd8653f766004e2abe594985395a0b76f3c21c472f2a65268cc069328cf0'
if (sha256(source) !== expectedSourceHash) throw new Error('Reviewed migration checksum changed')
const stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const token = stored.startsWith('go-keyring-base64:') ? Buffer.from(stored.slice(18), 'base64').toString('utf8') :
  stored.startsWith('go-keyring-encoded:') ? Buffer.from(stored.slice(19), 'hex').toString('utf8') : stored
if (mode === '--configure-ci') {
  // The user explicitly approved storing this CLI token for this repository's
  // read-only Actions checks. Supply it on stdin, never in arguments or logs.
  try {
    execFileSync('gh', ['secret', 'set', 'SUPABASE_ACCESS_TOKEN', '--repo', 'The-Humor-Project/chucklesome'],
      { input: token, stdio: ['pipe', 'ignore', 'pipe'] })
  } catch { throw new Error('Could not configure the encrypted Supabase Actions secret') }
  console.log(JSON.stringify({ repository: 'The-Humor-Project/chucklesome', encryptedSecretConfigured: 'SUPABASE_ACCESS_TOKEN' }))
  process.exit(0)
}
await mkdir(out, { recursive: true, mode: 0o700 })
const save = (name, data) => writeFile(out + name + '.json', JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
const load = async name => JSON.parse(await readFile(out + name + '.json', 'utf8'))
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const catalogSelect = catalogSql.slice(catalogSql.indexOf('WITH ns AS'), catalogSql.lastIndexOf('COMMIT;'))
async function request(stage, path, method = 'GET', body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projects[stage]}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(55_000),
  })
  // Never include response bodies in errors: Auth responses can contain secrets.
  if (!response.ok) throw new Error(`${stage}: ${method} ${path}: HTTP ${response.status}`)
  return response.json()
}
const query = (stage, sql, readOnly = true) => request(stage, '/database/query', 'POST', { query: sql, read_only: readOnly })
async function snapshot(stage) {
  const rows = await query(stage, catalogSql)
  const result = rows.find(row => row.snapshot)?.snapshot
  if (!result) throw new Error('Missing catalog snapshot: ' + stage)
  return result
}
const unrelatedAuth = (raw, patch) => Object.fromEntries(Object.entries(raw).filter(([key]) => !(key in patch)))
function verifyGrants(snapshot) {
  for (const name of ['demographic_answer_question_mapping', 'demographic_answers', 'demographic_questions', 'demographic_user_responses']) {
    const sequence = snapshot.sequences.find(item => item.key === `public.${name}_id_seq`)
    if (!sequence || canonical(sequence.acl) !== canonical(['authenticated=U/postgres', 'postgres=rwU/postgres', 'service_role=rwU/postgres']))
      throw new Error('Unexpected demographic sequence grants: ' + name)
  }
}
function verifyExtensions(snapshot) {
  if (snapshot.extensions.some(item => item.key === 'pg_graphql')) throw new Error('GraphQL extension is still enabled')
  for (const [name, version] of [['hypopg', '1.4.1'], ['index_advisor', '0.2.0']]) {
    const extension = snapshot.extensions.find(item => item.key === name)
    if (!extension || extension.version !== version || extension.schema !== 'extensions') throw new Error('Unexpected diagnostic extension: ' + name)
  }
}
const historySelect = `SELECT EXISTS(SELECT FROM supabase_migrations.schema_migrations
  WHERE version=${literal(baselineVersion)} AND name=${literal(migrationName)} AND statements=ARRAY[${literal(source)}]) AS matches;`
async function check(stage) {
  let previous
  try { await access(out + stage + '-before.json'); previous = await load(stage + '-before') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const results = await Promise.allSettled([snapshot(stage), request(stage, '/config/auth'),
    query(stage, `SELECT name,version,installed FROM pg_available_extension_versions
      WHERE (name='hypopg' AND version='1.4.1') OR (name='index_advisor' AND version='0.2.0') ORDER BY name;`),
  ])
  const errors = results.filter(result => result.status === 'rejected')
  if (errors.length) throw errors[0].reason
  const [catalog, auth, available] = results.map(result => result.value)
  if (catalog.migration_history.some(item => item.key === baselineVersion)) throw new Error(stage + ': migration already applied')
  if (previous && (previous.sourceHash !== sha256(source) ||
    canonical(fingerprint(previous.catalog, stage)) !== canonical(fingerprint(catalog, stage)) ||
    sha256(unrelatedAuth(auth, previous.patch)) !== previous.unrelatedAuthHash ||
    Object.entries(previous.auth).some(([key, value]) => auth[key] !== value)))
    throw new Error(stage + ': cannot refresh a preflight after the original state has changed')
  if (available.length !== 2) throw new Error(stage + ': diagnostic extension versions are unavailable')
  if (!auth.external_google_enabled || !auth.external_google_client_id || !auth.external_google_secret)
    throw new Error(stage + ': Google OAuth must already be configured')
  const patch = authPatch(auth)
  await save(stage + '-before', { catalog, auth: safeAuth(auth), patch,
    unrelatedAuthHash: sha256(unrelatedAuth(auth, patch)), sourceHash: sha256(source) })
  console.log(JSON.stringify({ stage, preflightPassed: true, enabledProviders: Object.keys(safeAuth(auth)).filter(key => /^external_.*_enabled$/.test(key) && auth[key]),
    authChanges: Object.keys(patch).filter(key => auth[key] !== patch[key]), diagnosticExtensionsAvailable: true }))
}
async function dryRun(stage) {
  const before = await load(stage + '-before')
  const now = await snapshot(stage)
  if (canonical(fingerprint(now, stage)) !== canonical(fingerprint(before.catalog, stage))) throw new Error(stage + ': schema changed since preflight')
  const rows = await query(stage, `BEGIN; SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='2s';
    SET LOCAL statement_timeout='45s'; ${source}\n${catalogSelect}\nROLLBACK;`, false)
  const expected = rows.find(row => row.snapshot)?.snapshot
  if (!expected) throw new Error(stage + ': dry run did not return a snapshot')
  verifyGrants(expected)
  verifyExtensions(expected)
  // Verify the deployment left no committed changes during its dry run.
  const restored = await snapshot(stage)
  if (canonical(fingerprint(restored, stage)) !== canonical(fingerprint(before.catalog, stage))) throw new Error(stage + ': dry run did not roll back')
  await save(stage + '-dry-run', { sourceHash: sha256(source), expected: fingerprint(expected, stage) })
  console.log(JSON.stringify({ stage, migrationDryRunPassed: true, graphqlDropRestrictPassed: true, rolledBack: true }))
}
async function apply(stage) {
  const before = await load(stage + '-before'), receipt = await load(stage + '-dry-run')
  if (before.sourceHash !== sha256(source) || receipt.sourceHash !== sha256(source)) throw new Error('Migration changed after review')
  const current = await snapshot(stage)
  if (!current.migration_history.some(item => item.key === baselineVersion)) {
    if (canonical(fingerprint(current, stage)) !== canonical(fingerprint(before.catalog, stage))) throw new Error(stage + ': preflight schema changed')
    await query(stage, `BEGIN; SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='45s';
      DO $alignment_guard$ BEGIN
        IF NOT pg_try_advisory_xact_lock(hashtextextended('chucklesome:environment-alignment:20261010',0))
        THEN RAISE EXCEPTION 'Environment migration already running'; END IF;
        IF EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE version=${literal(baselineVersion)})
        THEN RAISE EXCEPTION 'Migration history changed'; END IF;
      END; $alignment_guard$;
      ${source}
      INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES(${literal(baselineVersion)},${literal(migrationName)},ARRAY[${literal(source)}]);
      COMMIT;`, false)
  }
  const auth = await request(stage, '/config/auth')
  if (sha256(unrelatedAuth(auth, before.patch)) !== before.unrelatedAuthHash) throw new Error(stage + ': unrelated Auth settings changed before rollout')
  const patch = authPatch(auth)
  if (canonical(patch) !== canonical(before.patch)) throw new Error(stage + ': provider configuration changed since review')
  const changes = Object.fromEntries(Object.entries(patch).filter(([key, value]) => auth[key] !== value))
  if (Object.keys(changes).length) await request(stage, '/config/auth', 'PATCH', changes)
  await verify(stage)
}
async function verify(stage) {
  const before = await load(stage + '-before'), receipt = await load(stage + '-dry-run')
  const results = await Promise.allSettled([snapshot(stage), request(stage, '/config/auth'), query(stage, historySelect)])
  const errors = results.filter(result => result.status === 'rejected')
  if (errors.length) throw errors[0].reason
  const [catalog, auth, history] = results.map(result => result.value)
  verifyGrants(catalog)
  verifyExtensions(catalog)
  const drift = differences(receipt.expected, fingerprint(catalog, stage))
  if (drift.length) throw new Error(stage + ': unexpected schema changes: ' + JSON.stringify(drift))
  authState(auth)
  if (sha256(unrelatedAuth(auth, before.patch)) !== before.unrelatedAuthHash) throw new Error(stage + ': unrelated Auth settings changed')
  if (!history[0]?.matches) throw new Error(stage + ': migration source does not match its ledger')
  const advisor = await query(stage, `BEGIN READ ONLY; SET LOCAL search_path=public,extensions; SET LOCAL statement_timeout='15s';
    DO $diagnostic_check$ DECLARE created_count integer; remaining_count integer; BEGIN
      SELECT count(*) INTO created_count
        FROM extensions.hypopg_create_index('CREATE INDEX ON public.caption_votes (caption_id)');
      PERFORM extensions.hypopg_reset();
      SELECT count(*) INTO remaining_count FROM extensions.hypopg();
      IF created_count <> 1 OR remaining_count <> 0 THEN
        RAISE EXCEPTION 'Hypothetical index create/reset verification failed';
      END IF;
    END; $diagnostic_check$;
    SELECT startup_cost_before,total_cost_before,startup_cost_after,total_cost_after,index_statements
    FROM extensions.index_advisor('SELECT id FROM public.caption_votes WHERE caption_id = ''00000000-0000-0000-0000-000000000001''::uuid');
    COMMIT;`, false)
  if (!advisor.some(row => 'total_cost_before' in row)) throw new Error(stage + ': advisor smoke check failed')
  await save(stage + '-after', { catalog, auth: safeAuth(auth), advisor, sourceHash: sha256(source) })
  console.log(JSON.stringify({ stage, verified: true, googleOnly: true, unlimitedSessionLifetime: true,
    demographicGrantsAligned: true, diagnosticsWorking: true, unrelatedAuthSettingsPreserved: true }))
}

for (const stage of Object.keys(projects)) await ({ '--check': check, '--dry-run': dryRun, '--apply': apply, '--verify': verify })[mode](stage)
if (mode === '--apply' || mode === '--verify') {
  const [staging, production] = await Promise.all(['staging-after', 'production-after'].map(load))
  const schema = fingerprint(staging.catalog, 'staging')
  const drift = differences(schema, fingerprint(production.catalog, 'production'))
  if (drift.length) throw new Error('Projects differ after alignment: ' + JSON.stringify(drift))
  const auth = authState(staging.auth)
  if (canonical(auth) !== canonical(authState(production.auth))) throw new Error('Auth behavior differs between environments')
  const baselineDir = root + 'supabase/baseline/'
  await mkdir(baselineDir, { recursive: true })
  const baseline = { formatVersion: 1, baselineVersion, capturedAt: new Date().toISOString(), projects, auth, schema,
    sharedMigrations: staging.catalog.migration_history.filter(item => item.key >= baselineVersion),
    historicalMigrations: Object.fromEntries([['staging', staging], ['production', production]].map(([stage, state]) =>
      [stage, state.catalog.migration_history.filter(item => item.key < baselineVersion)])) }
  if (mode === '--apply') await writeFile(baselineDir + 'current.json', JSON.stringify(baseline, null, 2) + '\n')
  console.log(JSON.stringify({ bothEnvironmentsMatch: true, baselineVersion, baselineSaved: mode === '--apply' }))
  // Run the same fixed read-only checker used by CI, including its independent
  // migration checksum and immutable-history verification.
  execFileSync(process.execPath, [root + 'scripts/check-supabase-drift.mjs'],
    { env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, stdio: 'inherit' })
}
