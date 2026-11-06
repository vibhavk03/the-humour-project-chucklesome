// Fixed deployment of four performance indexes and four cached image policies.
// No arbitrary SQL, project arguments, service-role keys, or credential output.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2] ?? '--check'
if (process.argv.length > 3 || !['--check', '--dry-run', '--apply', '--verify'].includes(mode))
  throw new Error('Use --check, --dry-run, --apply, or --verify')
const projects = { staging: 'qihsgnfjqmkjmoowyfbn', production: 'kglxxmrvmrxiyigarjfh' }
const root = fileURLToPath(new URL('../', import.meta.url))
const out = root + '.data/schema-sync-20261010/performance-implementation/'
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const canonical = value => JSON.stringify(value, (_key, val) => val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val)
const migrations = [
  { version: '20261010170000', name: 'add_performance_indexes', sha256: 'eebcd10042df7a558f8059b5d5875bf7e46b2f5058cd153ba6da0a640f25170f' },
  { version: '20261010170001', name: 'cache_image_rls_checks', sha256: '3bf0bc7482961b86bb5df41a3ee5b8ea2fbd81d0ccff864d2c704594b30419d3' },
]
for (const spec of migrations) {
  spec.source = await readFile(root + `supabase/migrations/${spec.version}_${spec.name}.sql`, 'utf8')
  if (createHash('sha256').update(spec.source).digest('hex') !== spec.sha256)
    throw new Error('Reviewed migration checksum changed: ' + spec.name)
}
const indexStatements = migrations[0].source.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)
const expectedIndexes = new Map([
  ['caption_votes_caption_id_id_idx', 'CREATE INDEX caption_votes_caption_id_id_idx ON public.caption_votes USING btree (caption_id, id)'],
  ['captions_caption_request_id_idx', 'CREATE INDEX captions_caption_request_id_idx ON public.captions USING btree (caption_request_id)'],
  ['study_image_set_image_mappings_set_id_idx', 'CREATE INDEX study_image_set_image_mappings_set_id_idx ON public.study_image_set_image_mappings USING btree (study_image_set_id)'],
  ['ops_run_steps_ops_run_id_idx', 'CREATE INDEX ops_run_steps_ops_run_id_idx ON public.ops_run_steps USING btree (ops_run_id)'],
])
if (indexStatements.length !== 4) throw new Error('Expected exactly four index statements')
const stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const token = stored.startsWith('go-keyring-base64:') ? Buffer.from(stored.slice(18), 'base64').toString('utf8') :
  stored.startsWith('go-keyring-encoded:') ? Buffer.from(stored.slice(19), 'hex').toString('utf8') : stored
await mkdir(out, { recursive: true, mode: 0o700 })
const save = (name, data) => writeFile(out + name + '.json', JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
const load = async name => JSON.parse(await readFile(out + name + '.json', 'utf8'))

async function request(stage, path, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projects[stage]}${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(110_000),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`${stage} HTTP ${response.status}: ${String(data.message ?? data.error ?? '').slice(0,1500)}`)
  return data
}
const query = (stage, sql, readOnly = true) => request(stage, '/database/query', { query: sql, read_only: readOnly })
const policySelect = `SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY policyname),'[]'::jsonb)
  FROM pg_policies p WHERE schemaname='public' AND tablename='images'`
const snapshotSelect = `SELECT jsonb_build_object(
 'captured_at',now(),
 'policies',(${policySelect}),
 'tables',(SELECT jsonb_agg(x ORDER BY name) FROM (SELECT c.relname AS name,c.relrowsecurity AS rls,
    c.relforcerowsecurity AS forced,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS grants
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND c.relname IN ('images','caption_votes','captions','study_image_set_image_mappings','ops_run_steps')) x),
 'columns',(SELECT jsonb_agg(x ORDER BY table_name,ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,
    data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('images','caption_votes','captions','study_image_set_image_mappings','ops_run_steps')) x),
 'indexes',(SELECT jsonb_agg(x ORDER BY name) FROM (SELECT ic.relname AS name,pg_get_indexdef(ic.oid) AS definition,
    i.indisvalid AS valid,i.indisready AS ready,i.indisunique AS unique_index
   FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
   JOIN pg_namespace n ON n.oid=tc.relnamespace WHERE n.nspname='public'
    AND tc.relname IN ('images','caption_votes','captions','study_image_set_image_mappings','ops_run_steps')) x),
 'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,
    'source_hash',md5(statements::text)) ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations
   WHERE version IN ('20261010170000','20261010170001') OR name IN ('add_performance_indexes','cache_image_rls_checks')),
 'samples',jsonb_build_object(
   'caption',(SELECT caption_id FROM public.caption_votes ORDER BY id DESC LIMIT 1),
   'caption_batch',(SELECT jsonb_agg(caption_id) FROM (SELECT caption_id FROM public.caption_votes ORDER BY id DESC LIMIT 25) v),
   'request',(SELECT id FROM public.caption_requests ORDER BY created_datetime_utc DESC LIMIT 1),
   'run',(SELECT id FROM public.ops_runs ORDER BY started_datetime_utc DESC LIMIT 1),
   'image_set',(SELECT study_image_set_id FROM public.study_image_set_image_mappings ORDER BY id DESC LIMIT 1)),
 'actors',jsonb_build_object(
   'admin',(SELECT id FROM public.profiles WHERE is_superadmin=true ORDER BY id LIMIT 1),
   'owner',(SELECT p.id FROM public.profiles p WHERE coalesce(is_superadmin,false)=false
     AND EXISTS(SELECT FROM public.images i WHERE i.profile_id=p.id) ORDER BY id LIMIT 1))
) AS snapshot`
async function snapshot(stage) {
  const rows = await query(stage, `BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; ${snapshotSelect}; COMMIT;`)
  const result = rows.find(r => r.snapshot)?.snapshot
  if (!result) throw new Error(stage + ': missing catalog snapshot')
  return result
}
function unchangedMetadata(before, after) {
  for (const key of ['tables', 'columns'])
    if (canonical(before[key]) !== canonical(after[key])) throw new Error('Unexpected change to ' + key)
  const previous = before.indexes.filter(i => !expectedIndexes.has(i.name))
  const current = after.indexes.filter(i => !expectedIndexes.has(i.name))
  if (canonical(previous) !== canonical(current)) throw new Error('An existing index changed')
}
function checkIndexes(state, requireAll) {
  let present = 0
  for (const [name, definition] of expectedIndexes) {
    const index = state.indexes.find(i => i.name === name)
    if (!index) { if (requireAll) throw new Error('Missing index ' + name); continue }
    if (!index.valid || !index.ready || index.definition !== definition) throw new Error('Unexpected or invalid index ' + name)
    present++
  }
  return present
}
function historyInsert(spec) {
  return `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
    VALUES(${literal(spec.version)},${literal(spec.name)},ARRAY[${literal(spec.source)}]);`
}
function historyGuard(spec) {
  return `IF EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE version=${literal(spec.version)} OR name=${literal(spec.name)})
    THEN RAISE EXCEPTION 'Performance migration history changed'; END IF;`
}
function accessSql(actors, key) {
  if (!actors.admin || !actors.owner) throw new Error('Existing admin and image owner required for access verification')
  const cases = [
    { name: 'admin', role: 'authenticated', claims: { sub: actors.admin, role: 'authenticated', is_anonymous: false } },
    { name: 'owner', role: 'authenticated', claims: { sub: actors.owner, role: 'authenticated', is_anonymous: false } },
    { name: 'signed_in_anonymous', role: 'authenticated', claims: { sub: actors.owner, role: 'authenticated', is_anonymous: true } },
    { name: 'missing_uid', role: 'authenticated', claims: { role: 'authenticated' } },
    { name: 'anon', role: 'anon', claims: { role: 'anon' } },
  ]
  return `DO $performance_access$ DECLARE actor jsonb; original_role text:=current_user; result jsonb:='[]'; item jsonb;
    BEGIN FOR actor IN SELECT value FROM jsonb_array_elements(${literal(JSON.stringify(cases))}::jsonb) LOOP
      PERFORM set_config('request.jwt.claims',(actor->'claims')::text,true);
      PERFORM set_config('role',actor->>'role',true);
      SELECT jsonb_build_object('case',actor->>'name','role',current_user,'count',count(*),
        'visible_id_hash',md5(coalesce(string_agg(id::text,',' ORDER BY id),''))) INTO item FROM public.images;
      result:=result||jsonb_build_array(item);
      PERFORM set_config('role',original_role,true);
    END LOOP; PERFORM set_config(${literal(key)},result::text,true); END; $performance_access$;`
}
async function benchmark(stage, baseline, label) {
  const p = baseline.samples
  const uuid = value => value === null ? 'NULL::uuid' : literal(value) + '::uuid'
  const batch = (p.caption_batch ?? []).map(uuid).join(',')
  const statements = {
    vote_single_caption: `SELECT caption_id,profile_id,vote_value FROM public.caption_votes WHERE caption_id=${uuid(p.caption)} ORDER BY id LIMIT 1000`,
    vote_caption_batch: `SELECT caption_id,profile_id,vote_value FROM public.caption_votes WHERE caption_id=ANY(ARRAY[${batch}]::uuid[]) ORDER BY id LIMIT 1000`,
    captions_by_request: `SELECT id FROM public.captions WHERE caption_request_id=${p.request === null ? 'NULL::bigint' : literal(p.request) + '::bigint'} LIMIT 1000`,
    image_set_mappings: `SELECT study_image_set_id,image_id FROM public.study_image_set_image_mappings WHERE study_image_set_id=${literal(p.image_set)}::bigint ORDER BY id LIMIT 1000`,
    steps_by_run: `SELECT ops_run_image_id,op_title,position,created_datetime_utc FROM public.ops_run_steps WHERE ops_run_id=${uuid(p.run)} LIMIT 1000`,
    image_count_admin: 'SELECT count(*) FROM public.images',
    image_count_owner: 'SELECT count(*) FROM public.images',
  }
  const plans = {}
  for (const [name, statement] of Object.entries(statements)) {
    plans[name] = []
    for (let i = 0; i < 3; i++) {
      const actor = name.endsWith('_admin') ? baseline.actors.admin : name.endsWith('_owner') ? baseline.actors.owner : null
      const roleSql = actor ? `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims',
        ${literal(JSON.stringify({ sub: actor, role: 'authenticated', is_anonymous: false }))},true);` : ''
      // Role simulation is read-only SQL under the logged-in management account.
      const rows = await query(stage, `BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; ${roleSql}
        EXPLAIN (ANALYZE,BUFFERS,TIMING OFF,FORMAT JSON) ${statement}; COMMIT;`, !actor)
      const plan = rows.find(r => r['QUERY PLAN'])?.['QUERY PLAN']?.[0]
      if (!plan) throw new Error(stage + ': missing plan for ' + name)
      plans[name].push(plan)
    }
  }
  await save(stage + '-' + label + '-plans', plans)
  return plans
}
async function check(stage) {
  const state = await snapshot(stage)
  if (state.history.length || checkIndexes(state, false)) throw new Error(stage + ': rollout already started; do not overwrite its baseline')
  if (!state.tables.find(t => t.name === 'images')?.rls) throw new Error(stage + ': image RLS must already be enabled')
  const expectedPolicyNames = ['Own images + common use + public view', 'Authenticated users can upload their own images',
    'Own image update + admin update all', 'Own image delete + admin delete all']
  for (const name of expectedPolicyNames)
    if (!state.policies.some(p => p.policyname === name && canonical(p.roles) === '["authenticated"]' && p.permissive === 'PERMISSIVE'))
      throw new Error(stage + ': unexpected image policy ' + name)
  await save(stage + '-before', state)
  await benchmark(stage, state, 'before')
  console.log(JSON.stringify({ stage, preflightPassed: true, baseline: out + stage + '-before.json' }))
}
async function dryRun(stage) {
  const before = await load(stage + '-before')
  const current = await snapshot(stage)
  unchangedMetadata(before, current)
  if (current.history.length || canonical(current.policies) !== canonical(before.policies)) throw new Error(stage + ': baseline changed')
  const rows = await query(stage, `BEGIN ISOLATION LEVEL REPEATABLE READ;
    SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s';
    ${accessSql(before.actors, 'chucklesome.performance_before')}
    ${migrations[1].source}
    ${accessSql(before.actors, 'chucklesome.performance_after')}
    DO $performance_assert$ BEGIN
      IF current_setting('chucklesome.performance_before')::jsonb IS DISTINCT FROM current_setting('chucklesome.performance_after')::jsonb
      THEN RAISE EXCEPTION 'Image visibility changed in dry run'; END IF;
    END; $performance_assert$;
    ${snapshotSelect}; ROLLBACK;`, false)
  const expected = rows.find(r => r.snapshot)?.snapshot
  if (!expected) throw new Error(stage + ': no dry-run snapshot')
  unchangedMetadata(before, expected)
  await save(stage + '-dry-run', { hashes: migrations.map(m => m.sha256), expectedPolicies: expected.policies, visibilityPreserved: true })
  const restored = await snapshot(stage)
  if (canonical(restored.policies) !== canonical(before.policies)) throw new Error(stage + ': dry run did not roll back')
  console.log(JSON.stringify({ stage, policyDryRunPassed: true, existingIdentities: 5, rolledBack: true }))
}
async function apply(stage) {
  const before = await load(stage + '-before'), receipt = await load(stage + '-dry-run')
  if (canonical(receipt.hashes) !== canonical(migrations.map(m => m.sha256)) || !receipt.visibilityPreserved)
    throw new Error(stage + ': valid dry run required')
  let current = await snapshot(stage)
  unchangedMetadata(before, current)
  checkIndexes(current, false)
  if (!current.history.some(h => h.version === migrations[1].version) && canonical(current.policies) !== canonical(before.policies))
    throw new Error(stage + ': image policies changed since review')
  for (const statement of indexStatements) {
    const name = statement.match(/^CREATE INDEX (\w+)/)?.[1]
    if (!expectedIndexes.has(name)) throw new Error('Unexpected index statement')
    if (!current.indexes.some(i => i.name === name)) {
      // Send exactly one top-level statement: CONCURRENTLY cannot run in a transaction block.
      await query(stage, statement.replace(/^CREATE INDEX /, 'CREATE INDEX CONCURRENTLY ') + ';', false)
      console.log(JSON.stringify({ stage, indexBuiltConcurrently: name }))
      current = await snapshot(stage)
      checkIndexes(current, false)
    }
  }
  checkIndexes(current, true)
  if (!current.history.some(h => h.version === migrations[0].version)) {
    await query(stage, `BEGIN; SET LOCAL lock_timeout='2s';
      DO $performance_history$ BEGIN ${historyGuard(migrations[0])} END; $performance_history$;
      ${historyInsert(migrations[0])} COMMIT;`, false)
  }
  if (!current.history.some(h => h.version === migrations[1].version)) {
    const beforePolicyJson = literal(JSON.stringify(before.policies)), expectedPolicyJson = literal(JSON.stringify(receipt.expectedPolicies))
    const rows = await query(stage, `BEGIN ISOLATION LEVEL REPEATABLE READ;
      SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='45s';
      DO $performance_guard$ BEGIN
        IF NOT pg_try_advisory_xact_lock(hashtextextended('chucklesome:performance:20261010',0))
        THEN RAISE EXCEPTION 'Performance migration already running'; END IF;
        ${historyGuard(migrations[1])}
        IF (${policySelect}) IS DISTINCT FROM ${beforePolicyJson}::jsonb THEN RAISE EXCEPTION 'Image policies changed'; END IF;
      END; $performance_guard$;
      ${accessSql(before.actors, 'chucklesome.performance_before')}
      ${migrations[1].source}
      ${accessSql(before.actors, 'chucklesome.performance_after')}
      DO $performance_assert$ BEGIN
        IF current_setting('chucklesome.performance_before')::jsonb IS DISTINCT FROM current_setting('chucklesome.performance_after')::jsonb
        THEN RAISE EXCEPTION 'Image visibility changed'; END IF;
        IF (${policySelect}) IS DISTINCT FROM ${expectedPolicyJson}::jsonb THEN RAISE EXCEPTION 'Unexpected policy expressions'; END IF;
      END; $performance_assert$;
      ${historyInsert(migrations[1])}
      SELECT jsonb_build_object('visibility_preserved',true,'cases',current_setting('chucklesome.performance_after')::jsonb) AS result;
      COMMIT;`, false)
    await save(stage + '-applied-policy-checks', rows.find(r => r.result)?.result)
    console.log(JSON.stringify({ stage, policiesApplied: 4, visibilityPreserved: true }))
  }
  await verify(stage)
}
async function verify(stage) {
  const before = await load(stage + '-before'), receipt = await load(stage + '-dry-run'), after = await snapshot(stage)
  unchangedMetadata(before, after)
  checkIndexes(after, true)
  if (canonical(after.policies) !== canonical(receipt.expectedPolicies)) throw new Error(stage + ': unexpected final image policies')
  const rows = await query(stage, migrations.map(spec => `SELECT ${literal(spec.version)} AS version,EXISTS(SELECT
    FROM supabase_migrations.schema_migrations WHERE version=${literal(spec.version)} AND name=${literal(spec.name)}
    AND statements=ARRAY[${literal(spec.source)}]) AS matches`).join(' UNION ALL ') + ';')
  if (after.history.length !== 2 || rows.some(r => !r.matches)) throw new Error(stage + ': migration history does not match')
  await save(stage + '-after', after)
  const plans = await benchmark(stage, before, 'after')
  const advisors = await request(stage, '/advisors/performance')
  await save(stage + '-after-advisors', advisors)
  const counts = {}
  for (const lint of advisors.lints ?? []) counts[lint.name] = (counts[lint.name] ?? 0) + 1
  const timings = Object.fromEntries(Object.entries(plans).map(([name, samples]) => [name,
    samples.map(p => p['Execution Time']).sort((a, b) => a - b)[1]]))
  await save(stage + '-verification', { indexes: 4, policies: 4, metadataPreserved: true, advisors: counts, medianExecutionMs: timings })
  console.log(JSON.stringify({ stage, verified: true, indexes: 4, policies: 4, advisors: counts, medianExecutionMs: timings }))
}

if (mode === '--check' || mode === '--dry-run') {
  const results = await Promise.allSettled(Object.keys(projects).map(stage => mode === '--check' ? check(stage) : dryRun(stage)))
  for (const result of results) if (result.status === 'rejected') throw result.reason
} else {
  // Production follows a successful complete staging rollout and verification.
  for (const stage of ['staging', 'production']) await (mode === '--apply' ? apply(stage) : verify(stage))
}
