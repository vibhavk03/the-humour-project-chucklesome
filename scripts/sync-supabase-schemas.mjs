// Fixed October 10 schema alignment and Sidechat removal; never accepts raw SQL.
// Uses the saved Supabase CLI login, without requesting a service-role key.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { catalogSql } from './schema-sync-catalog.mjs'

const mode = process.argv[2] ?? '--inspect'
if (process.argv.length > 3 || !['--inspect', '--backup', '--dry-run', '--apply', '--verify'].includes(mode))
  throw new Error('Use --inspect, --backup, --dry-run, --apply, or --verify')
const projects = { staging: 'qihsgnfjqmkjmoowyfbn', production: 'kglxxmrvmrxiyigarjfh' }
const deletionTables = ['sidechat_posts', 'sidechat_comments']
const root = fileURLToPath(new URL('../', import.meta.url))
const workDir = root + '.data/schema-sync-20261010/'
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const token = stored.startsWith('go-keyring-base64:') ? Buffer.from(stored.slice(18), 'base64').toString('utf8') :
  stored.startsWith('go-keyring-encoded:') ? Buffer.from(stored.slice(19), 'hex').toString('utf8') : stored
await mkdir(workDir, { recursive: true, mode: 0o700 })

async function query(stage, sql, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projects[stage]}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(110_000),
  })
  if (!response.ok) {
    const details = await response.json().catch(() => null)
    throw new Error(stage + ': HTTP ' + response.status + ': ' + String(details?.message ?? details?.error ?? '').slice(0, 1000))
  }
  return response.json()
}

const postStateSql = `SELECT jsonb_build_object(
  'rows',(SELECT count(*) FROM public.sidechat_posts),
  'fingerprint',(SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY id,md5(to_jsonb(t)::text)),'')) FROM public.sidechat_posts t),
  'incoming_foreign_keys',(SELECT COALESCE(jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))),'[]'::jsonb)
    FROM pg_constraint WHERE confrelid='public.sidechat_posts'::regclass),
  'dependents',(SELECT COALESCE(jsonb_agg(pg_describe_object(classid,objid,objsubid)),'[]'::jsonb) FROM pg_depend
    WHERE refclassid='pg_class'::regclass AND refobjid='public.sidechat_posts'::regclass AND deptype='n'
      AND NOT (classid='pg_constraint'::regclass AND objid IN (SELECT oid FROM pg_constraint WHERE conrelid='public.sidechat_posts'::regclass))),
  'prompt_dependencies',(SELECT COALESCE(jsonb_agg(jsonb_build_object('step_id',id,'flavor_id',humor_flavor_id)),'[]'::jsonb)
    FROM public.humor_flavor_steps WHERE llm_user_prompt LIKE '%'||chr(36)||'{sidechatFromLast%' OR llm_system_prompt LIKE '%'||chr(36)||'{sidechatFromLast%')
) AS state;`
async function postState(stage) {
  const rows = await query(stage, "BEGIN READ ONLY; SET LOCAL statement_timeout='45s'; " + postStateSql + ' COMMIT;')
  return rows.find(row => row.state)?.state
}
async function snapshot(stage, label) {
  const rows = await query(stage, catalogSql)
  const result = rows.find(row => row.snapshot)?.snapshot
  if (!result) throw new Error(stage + ': missing catalog snapshot')
  result.metadata.project_ref = projects[stage]
  for (const [category, objects] of Object.entries(result)) if (category !== 'metadata' && objects === null) result[category] = []
  await writeFile(workDir + label + '-' + stage + '.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  return result
}

async function deletionState(stage, table) {
  if (!deletionTables.includes(table)) throw new Error('Unexpected backup table')
  const exists = (await query(stage, 'SELECT to_regclass(' + literal('public.' + table) + ') IS NOT NULL AS present;'))[0].present
  if (!exists) return null
  const rows = await query(stage, `BEGIN READ ONLY; SET LOCAL statement_timeout='45s';
    SELECT jsonb_build_object('rows',count(*),'fingerprint',md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY id,md5(to_jsonb(t)::text)),''))) AS state
    FROM public.${table} t; COMMIT;`)
  return rows.find(row => row.state)?.state
}

async function backup(stage, table) {
  const before = await deletionState(stage, table)
  if (!before) {
    console.log(JSON.stringify({ stage, table, present: false }))
    return
  }
  const backupDir = workDir + 'backups/' + stage + '/'
  await mkdir(backupDir, { recursive: true, mode: 0o700 })
  await writeFile(backupDir + table + '.jsonl', '', { mode: 0o600 })
  let rowCount = 0
  for (let offset = 0; offset < before.rows; offset += 500) {
    const rows = await query(stage, `BEGIN READ ONLY; SET LOCAL statement_timeout='30s';
      SELECT to_jsonb(t)::text AS row_json FROM public.${table} t ORDER BY id,md5(to_jsonb(t)::text) LIMIT 500 OFFSET ${offset}; COMMIT;`)
    if (!rows.length) throw new Error(stage + ': backup pagination ended early')
    await appendFile(backupDir + table + '.jsonl', rows.map(row => row.row_json).join('\n') + '\n')
    rowCount += rows.length
  }
  const after = await deletionState(stage, table)
  if (rowCount !== before.rows || before.rows !== after.rows || before.fingerprint !== after.fingerprint)
    throw new Error(stage + ': Sidechat rows changed during export; retry backup')
  const bytes = await readFile(backupDir + table + '.jsonl')
  const fingerprint = createHash('md5').update(bytes.toString('utf8').trimEnd().split('\n').filter(Boolean)
    .map(row => createHash('md5').update(row).digest('hex')).join('|')).digest('hex')
  if (fingerprint !== before.fingerprint) throw new Error(stage + ': local backup fingerprint does not match database')
  const manifest = { project_ref: projects[stage], table: 'public.' + table, rows: rowCount,
    fingerprint, sha256: createHash('sha256').update(bytes).digest('hex'), backed_up_at: new Date().toISOString() }
  await writeFile(backupDir + table + '-manifest.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ stage, backup: manifest, backupDir }))
}

async function backupPrompts(stage) {
  const rows = await query(stage, `BEGIN READ ONLY;
    SELECT id,to_jsonb(t)::text AS row_json FROM public.humor_flavor_steps t
    WHERE llm_user_prompt LIKE '%'||chr(36)||'{sidechatFromLast%' OR llm_system_prompt LIKE '%'||chr(36)||'{sidechatFromLast%' ORDER BY id; COMMIT;`)
  const backupDir = workDir + 'backups/' + stage + '/'
  const text = rows.map(row => row.row_json).join('\n') + (rows.length ? '\n' : '')
  await writeFile(backupDir + 'sidechat_prompt_steps.jsonl', text, { mode: 0o600 })
  const manifest = { project_ref: projects[stage], sha256: createHash('sha256').update(text).digest('hex'),
    rows: rows.map(row => ({ id: row.id, md5: createHash('md5').update(row.row_json).digest('hex') })) }
  await writeFile(backupDir + 'sidechat_prompt_steps-manifest.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ stage, promptStepBackups: rows.length }))
}

const catalogSelect = catalogSql.slice(catalogSql.indexOf('WITH ns AS'), catalogSql.lastIndexOf('COMMIT;')).trim()
const publicCategories = ['relations', 'columns', 'constraints', 'indexes', 'functions', 'policies', 'triggers', 'views', 'types', 'sequences']
function normalizedPublic(catalog) {
  return Object.fromEntries(publicCategories.map(category => [category, (catalog[category] ?? [])
    .filter(row => row.schema === 'public').map(row => {
      const normalized = { ...row }
      delete normalized.position
      delete normalized.comment
      return normalized
    })
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)]))
}
function assertPublicSql(expected, tempName) {
  // JSONB comparisons ignore object-key order. Arrays are ordered by identity.
  return `DO $schema_sync_verify$
    DECLARE expected jsonb := ${literal(JSON.stringify(expected))}::jsonb; actual jsonb; category text; wanted jsonb; current_snapshot jsonb; difference_keys text;
    BEGIN
      SELECT snapshot INTO current_snapshot FROM pg_temp.${tempName};
      FOR category,wanted IN SELECT key,value FROM jsonb_each(expected) LOOP
        SELECT COALESCE(jsonb_agg(value - 'position' - 'comment' ORDER BY (value->>'key') COLLATE "C"),'[]'::jsonb) INTO actual
          FROM jsonb_array_elements(COALESCE(current_snapshot->category,'[]'::jsonb)) WHERE value->>'schema'='public';
        IF actual IS DISTINCT FROM wanted THEN
          SELECT string_agg(COALESCE(a.value->>'key',b.value->>'key'),', ') INTO difference_keys FROM
            jsonb_array_elements(actual) a FULL JOIN jsonb_array_elements(wanted) b ON a.value->>'key'=b.value->>'key'
            WHERE a.value IS DISTINCT FROM b.value;
          RAISE EXCEPTION 'Public catalog mismatch in %: %',category,left(difference_keys,1000);
        END IF;
      END LOOP;
    END; $schema_sync_verify$;`
}

const migrationSpecs = [
  { file: '20261009000002_image_content_hashes.sql', version: '20261009000002', name: 'image_content_hashes' },
  { file: '20261010150000_align_production_application_schema.sql', version: '20261010150000', name: 'align_production_application_schema' },
  { file: '20261010150001_drop_sidechat_tables.sql', version: '20261010150001', name: 'drop_sidechat_tables' },
]
async function preparedMigrations() {
  const plan = JSON.parse(await readFile(workDir + 'plan.json', 'utf8'))
  if (!plan.replace_sidechat_prompts || JSON.stringify(plan.projects) !== JSON.stringify(projects) ||
      JSON.stringify(plan.delete_tables) !== JSON.stringify(deletionTables)) throw new Error('Unexpected alignment plan')
  return Promise.all(migrationSpecs.map(async spec => {
    const source = await readFile(root + 'supabase/migrations/' + spec.file, 'utf8')
    const sha256 = createHash('sha256').update(source).digest('hex')
    if (plan.migrations.find(row => row.file === spec.file)?.sha256 !== sha256) throw new Error('Migration checksum changed: ' + spec.file)
    // The reviewed hash migration has its own transaction wrapper. The runner
    // applies all production changes inside one surrounding transaction.
    const body = source.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
    return { ...spec, source, body, sha256 }
  }))
}

async function applyStage(stage, dryRun) {
  const migrations = (await preparedMigrations()).filter(spec => stage === 'production' || spec.name === 'drop_sidechat_tables')
  if (!dryRun) {
    const receipt = JSON.parse(await readFile(workDir + 'dry-run-' + stage + '.json', 'utf8'))
    if (!receipt.dryRun || !receipt.verified || JSON.stringify(receipt.migrations) !== JSON.stringify(migrations.map(({ name, sha256 }) => ({ name, sha256 }))))
      throw new Error(stage + ': these exact migrations must pass --dry-run before applying')
    const historySql = migrations.map(spec => `SELECT version,name,statements=ARRAY[${literal(spec.source)}] AS matches
      FROM supabase_migrations.schema_migrations WHERE version=${literal(spec.version)} OR name=${literal(spec.name)}`).join(' UNION ALL ')
    const recorded = await query(stage, historySql + ';')
    if (recorded.length) {
      if (recorded.length !== migrations.length || recorded.some(row => !row.matches || !migrations.some(spec => spec.version === row.version && spec.name === row.name)))
        throw new Error(stage + ': partial or different migration history; inspect before resuming')
      console.log(JSON.stringify({ stage, alreadyApplied: true }))
      return
    }
  }
  const baseline = JSON.parse(await readFile(workDir + 'before-' + stage + '.json', 'utf8'))
  const expected = JSON.parse(await readFile(workDir + 'expected-public-' + stage + '.json', 'utf8'))
  const backupDir = workDir + 'backups/' + stage + '/'
  const backupGuards = []
  const existingDeletionTables = []
  for (const table of deletionTables) {
    if (!baseline.relations.some(row => row.key === 'public.' + table)) continue
    const manifest = JSON.parse(await readFile(backupDir + table + '-manifest.json', 'utf8'))
    const bytes = await readFile(backupDir + table + '.jsonl')
    if (manifest.project_ref !== projects[stage] || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256)
      throw new Error(stage + ': invalid verified backup for ' + table)
    existingDeletionTables.push('public.' + table)
    backupGuards.push(`IF (SELECT count(*) FROM public.${table}) <> ${manifest.rows}
        OR (SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY id,md5(to_jsonb(t)::text)),'')) FROM public.${table} t) <> ${literal(manifest.fingerprint)}
      THEN RAISE EXCEPTION 'Backup no longer matches ${table}; export again before removing it'; END IF;`)
  }
  const promptBackup = JSON.parse(await readFile(backupDir + 'sidechat_prompt_steps-manifest.json', 'utf8'))
  const promptBytes = await readFile(backupDir + 'sidechat_prompt_steps.jsonl')
  if (promptBackup.project_ref !== projects[stage] || createHash('sha256').update(promptBytes).digest('hex') !== promptBackup.sha256)
    throw new Error(stage + ': invalid Sidechat prompt backup')
  for (const row of promptBackup.rows)
    backupGuards.push(`IF (SELECT md5(to_jsonb(t)::text) FROM public.humor_flavor_steps t WHERE id=${row.id}) IS DISTINCT FROM ${literal(row.md5)}
      THEN RAISE EXCEPTION 'Sidechat prompt ${row.id} changed since backup'; END IF;`)
  const expectedIds = promptBackup.rows.map(row => Number(row.id)).sort((a, b) => a - b)
  backupGuards.push(`IF (SELECT COALESCE(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM public.humor_flavor_steps
    WHERE llm_user_prompt LIKE '%'||chr(36)||'{sidechatFromLast%' OR llm_system_prompt LIKE '%'||chr(36)||'{sidechatFromLast%') <> ${literal(JSON.stringify(expectedIds))}::jsonb
    THEN RAISE EXCEPTION 'Configured Sidechat prompt dependencies changed'; END IF;`)
  backupGuards.push(`IF EXISTS(SELECT FROM public.caption_generation_tasks WHERE status IN ('queued','running') AND steps::text LIKE '%sidechatFromLast%')
    THEN RAISE EXCEPTION 'An active caption task still has a Sidechat prompt snapshot; let it finish before removing its source table'; END IF;`)
  const migrationGuard = migrations.map(spec => `IF EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE version=${literal(spec.version)} OR name=${literal(spec.name)})
    THEN RAISE EXCEPTION 'Migration ${spec.name} already recorded'; END IF;`).join('\n')
  const appliedSql = migrations.map(spec => spec.body + '\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(' +
    literal(spec.version) + ',' + literal(spec.name) + ',ARRAY[' + literal(spec.source) + ']);').join('\n')
  const retainedCounts = `jsonb_build_object('captions',(SELECT count(*) FROM public.captions),'images',(SELECT count(*) FROM public.images),
    'profiles',(SELECT count(*) FROM public.profiles),'caption_votes',(SELECT count(*) FROM public.caption_votes),
    'studies',(SELECT count(*) FROM public.studies),'humor_flavors',(SELECT count(*) FROM public.humor_flavors),
    'caption_examples',(SELECT count(*) FROM public.caption_examples),'humor_flavor_steps',(SELECT count(*) FROM public.humor_flavor_steps))`
  const statement = `BEGIN ISOLATION LEVEL REPEATABLE READ;
    SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='90s'; SET LOCAL search_path=pg_catalog,public,extensions;
    LOCK TABLE ${existingDeletionTables.join(',')} IN ACCESS EXCLUSIVE MODE;
    LOCK TABLE public.humor_flavor_steps IN SHARE ROW EXCLUSIVE MODE;
    DO $schema_sync_guard$ BEGIN
      IF NOT pg_try_advisory_xact_lock(hashtextextended('chucklesome:schema-sync:20261010',0)) THEN RAISE EXCEPTION 'Schema alignment already running'; END IF;
      ${migrationGuard}
      ${backupGuards.join('\n')}
    END; $schema_sync_guard$;
    CREATE TEMP TABLE schema_sync_counts ON COMMIT DROP AS SELECT ${retainedCounts} AS counts;
    SET LOCAL search_path=pg_catalog;
    CREATE TEMP TABLE schema_sync_before ON COMMIT DROP AS ${catalogSelect}
    ${assertPublicSql(normalizedPublic(baseline), 'schema_sync_before')}
    SET LOCAL search_path=pg_catalog,public,extensions;
    ${appliedSql}
    SET LOCAL search_path=pg_catalog;
    CREATE TEMP TABLE schema_sync_after ON COMMIT DROP AS ${catalogSelect}
    ${assertPublicSql(expected, 'schema_sync_after')}
    DO $schema_sync_data_guard$ BEGIN
      IF ${retainedCounts} IS DISTINCT FROM (SELECT counts FROM pg_temp.schema_sync_counts) THEN RAISE EXCEPTION 'Retained application row counts changed'; END IF;
      IF to_regclass('public.sidechat_posts') IS NOT NULL OR to_regclass('public.sidechat_comments') IS NOT NULL THEN RAISE EXCEPTION 'Sidechat tables were not removed'; END IF;
      IF EXISTS(SELECT FROM public.humor_flavor_steps WHERE llm_user_prompt LIKE '%'||chr(36)||'{sidechatFromLast%' OR llm_system_prompt LIKE '%'||chr(36)||'{sidechatFromLast%') THEN RAISE EXCEPTION 'Sidechat prompt dependency remains'; END IF;
    END; $schema_sync_data_guard$;
    SELECT jsonb_build_object('verified',true,'retained_counts',(SELECT counts FROM pg_temp.schema_sync_counts),
      'public_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
      'prompt_steps_updated',${expectedIds.length}) AS result;
    ${dryRun ? 'ROLLBACK' : 'COMMIT'};`
  await writeFile(workDir + (dryRun ? 'dry-run' : 'apply') + '-' + stage + '.sql', statement, { mode: 0o600 })
  const rows = await query(stage, statement, false)
  const result = rows.find(row => row.result)?.result
  if (!result?.verified) throw new Error(stage + ': migration did not return verification')
  await writeFile(workDir + (dryRun ? 'dry-run' : 'applied') + '-' + stage + '.json', JSON.stringify({ stage, dryRun, migrations: migrations.map(({ name, sha256 }) => ({ name, sha256 })), ...result }, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ stage, dryRun, ...result }, null, 2))
}

async function verifyStage(stage) {
  const actual = await snapshot(stage, 'after')
  const expected = JSON.parse(await readFile(workDir + 'expected-public-' + stage + '.json', 'utf8'))
  const actualPublic = normalizedPublic(actual)
  // Compare canonical JSON with alphabetically ordered property names.
  const canonical = value => JSON.stringify(value, (_key, val) => val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val)
  if (canonical(actualPublic) !== canonical(expected)) throw new Error(stage + ': committed public schema does not match the expected catalog')
  for (const spec of migrationSpecs.filter(row => stage === 'production' || row.name === 'drop_sidechat_tables')) {
    if (!actual.migration_history.some(row => row.key === spec.version && row.name === spec.name)) throw new Error(stage + ': missing migration history ' + spec.name)
  }
  const tokens = await query(stage, "SELECT count(*) AS remaining FROM public.humor_flavor_steps WHERE llm_user_prompt LIKE '%'||chr(36)||'{sidechatFromLast%' OR llm_system_prompt LIKE '%'||chr(36)||'{sidechatFromLast%';")
  if (tokens[0].remaining !== 0) throw new Error(stage + ': a Sidechat prompt dependency remains')
  console.log(JSON.stringify({ stage, verifiedCommittedSchema: true, publicTables: actual.relations.filter(row => row.schema === 'public' && row.kind === 'r').length }))
}

if (mode === '--inspect') {
  const results = await Promise.allSettled(Object.keys(projects).map(async stage => {
    const catalog = await snapshot(stage, 'before')
    const sidechat = await postState(stage)
    const result = { stage, project: projects[stage], publicTables: catalog.relations.filter(row => row.schema === 'public' && row.kind === 'r').length, sidechat }
    await writeFile(workDir + 'preflight-' + stage + '.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
    return result
  }))
  for (const result of results) if (result.status === 'fulfilled') console.log(JSON.stringify(result.value, null, 2)); else throw result.reason
} else if (mode === '--backup') {
  for (const stage of Object.keys(projects)) {
    for (const table of deletionTables) await backup(stage, table)
    await backupPrompts(stage)
  }
} else if (mode === '--dry-run') {
  for (const stage of ['production', 'staging']) await applyStage(stage, true)
} else if (mode === '--apply') {
  for (const stage of ['production', 'staging']) {
    await applyStage(stage, false)
    await verifyStage(stage)
  }
} else if (mode === '--verify') {
  for (const stage of Object.keys(projects)) await verifyStage(stage)
} else {
  throw new Error('Unrecognized schema alignment mode')
}
