import { createHash } from 'node:crypto'

export const projects = { staging: 'qihsgnfjqmkjmoowyfbn', production: 'kglxxmrvmrxiyigarjfh' }
export const baselineVersion = '20261010180000'
export const migrationName = 'align_environment_permissions_and_extensions'
export const appSchemas = ['public', 'funnystudy_notifications']
export const canonical = value => JSON.stringify(value, (_key, val) => val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val)
export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')

export function authPatch(raw) {
  const providers = Object.entries(raw).filter(([key, value]) => /^external_.*_enabled$/.test(key) && typeof value === 'boolean')
  if (!providers.some(([key]) => key === 'external_google_enabled')) throw new Error('Google Auth setting is missing')
  const patch = Object.fromEntries(providers.map(([key]) => [key, key === 'external_google_enabled']))
  // MFA factors are not alternative login providers and remain unchanged.
  for (const key of ['saml_enabled', 'passkey_enabled', 'custom_oauth_enabled']) if (key in raw) patch[key] = false
  return { ...patch, sessions_timebox: 0, sessions_inactivity_timeout: 0,
    sessions_single_per_user: false, refresh_token_rotation_enabled: true }
}

export function safeAuth(raw) {
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) =>
    (/^external_.*_enabled$/.test(key) && typeof value === 'boolean') ||
    ['saml_enabled', 'passkey_enabled', 'custom_oauth_enabled', 'sessions_timebox', 'sessions_inactivity_timeout', 'sessions_single_per_user',
      'refresh_token_rotation_enabled', 'jwt_exp', 'disable_signup'].includes(key)))
}

export function authState(raw) {
  const patch = authPatch(raw)
  const wrong = Object.keys(patch).filter(key => raw[key] !== patch[key])
  if (wrong.length) throw new Error('Auth differs from Google-only renewable sessions: ' + wrong.join(', '))
  return { enabledProviders: Object.keys(raw).filter(key => /^external_.*_enabled$/.test(key) && raw[key] === true).sort(),
    saml_enabled: raw.saml_enabled ?? false, passkey_enabled: raw.passkey_enabled ?? false,
    custom_oauth_enabled: raw.custom_oauth_enabled ?? false, sessions_timebox: raw.sessions_timebox,
    sessions_inactivity_timeout: raw.sessions_inactivity_timeout,
    sessions_single_per_user: raw.sessions_single_per_user,
    refresh_token_rotation_enabled: raw.refresh_token_rotation_enabled,
    jwt_exp: raw.jwt_exp, disable_signup: raw.disable_signup }
}

export function normalizeSnapshot(snapshot, stage) {
  if (!projects[stage]) throw new Error('Unknown environment')
  const result = {}
  const categories = ['schemas', 'relations', 'columns', 'constraints', 'indexes', 'functions', 'policies',
    'triggers', 'views', 'types', 'sequences', 'default_privileges', 'rules']
  for (const category of categories) {
    result[category] = (snapshot[category] ?? []).filter(item =>
      appSchemas.includes(item.schema ?? item.key) ||
      (category === 'policies' && item.schema === 'storage') ||
      (category === 'default_privileges' && item.schema === null)
    ).map(item => {
      const normalized = { ...item }
      // Comments and physical attribute numbers do not affect API behavior.
      delete normalized.comment
      delete normalized.position
      if (category === 'columns' && item.key === 'public.experiments.env') {
        if (item.default_expression !== `'${stage}'::text`) throw new Error(`${stage}: incorrect experiments.env default`)
        normalized.default_expression = "'<environment>'::text"
      }
      return normalized
    }).sort((a, b) => a.key.localeCompare(b.key))
  }
  result.extensions = (snapshot.extensions ?? []).map(item => ({ ...item })).sort((a, b) => a.key.localeCompare(b.key))
  result.publications = (snapshot.publications ?? []).filter(item => item.key === 'supabase_realtime').map(item => ({ ...item,
    tables: (item.tables ?? []).filter(table => appSchemas.includes(table.schemaname)).map(table => ({ ...table,
      attnames: table.attnames ? [...table.attnames].sort() : null,
    })).sort((a, b) => `${a.schemaname}.${a.tablename}`.localeCompare(`${b.schemaname}.${b.tablename}`)),
  }))
  return result
}

// Store opaque hashes, rather than function bodies or default expressions that
// could contain credentials, in the reviewed baseline committed to the repo.
export function fingerprint(snapshot, stage) {
  return Object.fromEntries(Object.entries(normalizeSnapshot(snapshot, stage)).map(([category, items]) =>
    [category, items.map(item => ({ key: item.key, sha256: sha256(item) }))]))
}

export function differences(expected, actual) {
  const changes = []
  for (const category of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const before = new Map((expected[category] ?? []).map(item => [item.key, item.sha256]))
    const after = new Map((actual[category] ?? []).map(item => [item.key, item.sha256]))
    for (const key of new Set([...before.keys(), ...after.keys()])) if (before.get(key) !== after.get(key))
      changes.push({ category, key, status: !before.has(key) ? 'added' : !after.has(key) ? 'removed' : 'changed' })
  }
  return changes
}

export function verifyHistory(snapshot, historical, sources) {
  const history = snapshot.migration_history ?? []
  const archived = history.filter(item => item.key < baselineVersion)
  if (canonical(archived) !== canonical(historical)) throw new Error('Historical migration records changed')
  const shared = history.filter(item => item.key >= baselineVersion)
  if (!shared.some(item => item.key === baselineVersion)) throw new Error('Shared migration baseline is missing')
  for (const item of shared) {
    const source = sources.find(file => file.version === item.key)
    if (!source || source.name !== item.name || source.statementsHash !== item.statements_hash)
      throw new Error('Untracked or edited shared migration: ' + item.key)
  }
  const pending = sources.filter(source => !shared.some(item => item.key === source.version))
  return { shared, pending }
}

export function migrationStatementsHash(source) {
  // PostgreSQL ARRAY[text]::text escaping, matching the migration ledger.
  const arrayText = '{"' + source.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"}'
  return createHash('md5').update(arrayText).digest('hex')
}
