// Read-only schema, Auth, extension, and migration-history verification.
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { catalogSql } from './schema-sync-catalog.mjs'
import { projects, baselineVersion, canonical, fingerprint, differences, authState, verifyHistory,
  migrationStatementsHash } from './supabase-parity.mjs'

const mode = process.argv[2] ?? '--live'
if (process.argv.length > 3 || !['--live', '--offline', '--capture-baseline'].includes(mode))
  throw new Error('Use --live, --offline, or --capture-baseline')
const root = fileURLToPath(new URL('../', import.meta.url))
const baselinePath = root + 'supabase/baseline/current.json'
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
if (baseline.formatVersion !== 1 || baseline.baselineVersion !== baselineVersion || canonical(baseline.projects) !== canonical(projects))
  throw new Error('Unsupported baseline or project configuration')
const sources = []
for (const file of (await readdir(root + 'supabase/migrations')).sort()) {
  const match = file.match(/^(\d{14})_(.+)\.sql$/)
  if (!match || match[1] < baselineVersion) continue
  if (sources.some(source => source.version === match[1])) throw new Error('Duplicate migration version: ' + match[1])
  const source = await readFile(root + 'supabase/migrations/' + file, 'utf8')
  sources.push({ version: match[1], name: match[2], statementsHash: migrationStatementsHash(source) })
}
if (!sources.some(source => source.version === baselineVersion)) throw new Error('Baseline migration file is missing')
if (mode === '--offline') {
  if (!baseline.schema.columns?.length || !baseline.schema.policies?.length || !baseline.historicalMigrations.staging || !baseline.historicalMigrations.production)
    throw new Error('Incomplete baseline')
  for (const [stage, history] of Object.entries(baseline.historicalMigrations)) {
    if (!projects[stage] || history.some(item => item.key >= baselineVersion)) throw new Error('Invalid historical migration archive')
  }
  verifyHistory({ migration_history: [...baseline.historicalMigrations.staging, ...baseline.sharedMigrations] },
    baseline.historicalMigrations.staging, sources)
  console.log(JSON.stringify({ offlineBaselineValid: true, sharedMigrationFiles: sources.length, baselineVersion }))
  process.exit(0)
}

let token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  if (process.env.CI) throw new Error('Set the SUPABASE_ACCESS_TOKEN Actions secret to a logged-in Supabase account token; no service-role key is used')
  const stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  token = stored.startsWith('go-keyring-base64:') ? Buffer.from(stored.slice(18), 'base64').toString('utf8') :
    stored.startsWith('go-keyring-encoded:') ? Buffer.from(stored.slice(19), 'hex').toString('utf8') : stored
}
async function request(stage, path, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projects[stage]}${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(55_000),
  })
  if (!response.ok) throw new Error(`${stage}: read-only comparison failed: HTTP ${response.status}`)
  return response.json()
}
const results = await Promise.allSettled(Object.keys(projects).map(async stage => {
  const requests = await Promise.allSettled([
    request(stage, '/database/query', { query: catalogSql, read_only: true }), request(stage, '/config/auth'),
  ])
  const errors = requests.filter(result => result.status === 'rejected')
  if (errors.length) throw errors[0].reason
  const [rows, rawAuth] = requests.map(result => result.value)
  const snapshot = rows.find(row => row.snapshot)?.snapshot
  if (!snapshot) throw new Error(stage + ': no schema snapshot returned')
  const schema = fingerprint(snapshot, stage)
  const auth = authState(rawAuth)
  const history = verifyHistory(snapshot, baseline.historicalMigrations[stage], sources)
  if (history.pending.length) throw new Error(stage + ': pending migrations: ' + history.pending.map(item => item.version).join(', '))
  if (canonical(auth) !== canonical(baseline.auth)) throw new Error(stage + ': Auth defaults changed from the reviewed baseline')
  return { stage, schema, auth, history: history.shared }
}))
const failures = results.filter(result => result.status === 'rejected')
if (failures.length) {
  for (const failure of failures) console.error(failure.reason.message)
  process.exit(1)
}
const [staging, production] = results.map(result => result.value)
const environmentDrift = differences(staging.schema, production.schema)
if (environmentDrift.length || canonical(staging.history) !== canonical(production.history))
  throw new Error('Staging and production differ: ' + JSON.stringify(environmentDrift) + ' (shared migration histories must also match)')
if (mode === '--capture-baseline') {
  await writeFile(baselinePath, JSON.stringify({ ...baseline, capturedAt: new Date().toISOString(), schema: staging.schema,
    sharedMigrations: staging.history }, null, 2) + '\n')
  console.log(JSON.stringify({ baselineUpdated: true, environmentsMatch: true, migrationCount: staging.history.length }))
} else {
  const baselineDrift = differences(baseline.schema, staging.schema)
  if (baselineDrift.length) throw new Error('Live schema differs from the reviewed baseline: ' + JSON.stringify(baselineDrift))
  console.log(JSON.stringify({ stagingMatchesBaseline: true, productionMatchesBaseline: true,
    googleOnly: true, sessionsRenewIndefinitely: true, sharedMigrationCount: staging.history.length, historicalRecordsPreserved: true }))
}
