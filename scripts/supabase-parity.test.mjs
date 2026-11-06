import test from 'node:test'
import assert from 'node:assert/strict'
import { authPatch, authState, fingerprint, differences, verifyHistory, baselineVersion,
  migrationStatementsHash } from './supabase-parity.mjs'

const fixture = stage => ({
  columns: [{ key: 'public.experiments.env', schema: 'public', default_expression: `'${stage}'::text`, position: 2, comment: 'Example' }],
  indexes: [{ key: 'public.example_idx', schema: 'public', definition: 'CREATE INDEX example_idx ON public.example USING btree (id)', valid: true }],
  policies: [{ key: 'public.example.owner', schema: 'public', using_expression: '(profile_id = auth.uid())', roles: ['authenticated'] },
    { key: 'storage.objects.images', schema: 'storage', using_expression: "bucket_id = 'images'" }],
  sequences: [{ key: 'public.example_id_seq', schema: 'public', acl: ['authenticated=U/postgres'] }],
  functions: [{ key: 'public.example()', schema: 'public', definition: 'SECURITY DEFINER SELECT 1' }],
  publications: [{ key: 'supabase_realtime', tables: [{ schemaname: 'public', tablename: 'example', attnames: ['id', 'name'] }] }],
  relations: [{ key: 'realtime.messages_20261010', schema: 'realtime', kind: 'r' }],
  extensions: [{ key: 'hypopg', schema: 'extensions', version: '1.4.1' }],
})
const rawAuth = { external_google_enabled: true, external_email_enabled: true,
  external_phone_enabled: true, external_anonymous_users_enabled: true, external_github_enabled: false,
  external_google_secret: 'do-not-copy', saml_enabled: true, passkey_enabled: true,
  custom_oauth_enabled: true, sessions_timebox: 168,
  sessions_inactivity_timeout: 24, sessions_single_per_user: true, refresh_token_rotation_enabled: true,
  jwt_exp: 3600, disable_signup: false }

test('Google-only patch disables alternative sign-in without changing credentials or JWT expiry', () => {
  const patch = authPatch(rawAuth)
  assert.deepEqual(Object.keys(patch).filter(key => key.startsWith('external') && patch[key]), ['external_google_enabled'])
  assert.equal(patch.saml_enabled, false)
  assert.equal(patch.passkey_enabled, false)
  assert.equal(patch.custom_oauth_enabled, false)
  assert.equal(patch.sessions_timebox, 0)
  assert.equal(patch.sessions_inactivity_timeout, 0)
  assert.equal(patch.sessions_single_per_user, false)
  assert.equal('external_google_secret' in patch, false)
  assert.equal('jwt_exp' in patch, false)
  assert.throws(() => authState(rawAuth), /Auth differs/)
  assert.deepEqual(authState({ ...rawAuth, ...patch }).enabledProviders, ['external_google_enabled'])
})
test('future enabled providers also fail the Google-only check', () => {
  const configured = { ...rawAuth, ...authPatch(rawAuth), external_new_provider_enabled: true }
  assert.throws(() => authState(configured), /external_new_provider_enabled/)
})
test('only expected environment differences and managed partitions are normalized', () => {
  const staging = fixture('staging'), production = fixture('production')
  production.columns[0].position = 9
  production.columns[0].comment = 'Different documentation'
  production.relations = []
  production.publications[0].tables[0].attnames.reverse()
  assert.deepEqual(differences(fingerprint(staging, 'staging'), fingerprint(production, 'production')), [])
  staging.columns[0].default_expression = "'production'::text"
  assert.throws(() => fingerprint(staging, 'staging'), /incorrect experiments.env/)
})
for (const [label, mutate, category] of [
  ['policy access', value => { value.policies[0].using_expression = 'true' }, 'policies'],
  ['storage access', value => { value.policies[1].using_expression = 'true' }, 'policies'],
  ['sequence grants', value => { value.sequences[0].acl.push('anon=rwU/postgres') }, 'sequences'],
  ['function definition', value => { value.functions[0].definition = 'SECURITY INVOKER SELECT 1' }, 'functions'],
  ['column type', value => { value.columns[0].type = 'varchar' }, 'columns'],
  ['missing index', value => { value.indexes = [] }, 'indexes'],
  ['extension version', value => { value.extensions[0].version = '2.0.0' }, 'extensions'],
]) test(`detects ${label} drift`, () => {
  const before = fixture('staging'), after = structuredClone(before)
  mutate(after)
  assert.equal(differences(fingerprint(before, 'staging'), fingerprint(after, 'staging'))[0].category, category)
})
test('historical ledgers are immutable and future migrations need matching tracked source', () => {
  const historical = [{ key: '20200101000000', name: 'legacy', statements_hash: 'legacy-hash' }]
  const sources = [{ version: baselineVersion, name: 'baseline', statementsHash: 'source-hash' }]
  const snapshot = { migration_history: [...historical, { key: baselineVersion, name: 'baseline', statements_hash: 'source-hash' }] }
  assert.equal(verifyHistory(snapshot, historical, sources).shared.length, 1)
  snapshot.migration_history[0] = { ...historical[0], statements_hash: 'edited' }
  assert.throws(() => verifyHistory(snapshot, historical, sources), /Historical migration/)
  snapshot.migration_history[0] = historical[0]
  snapshot.migration_history[1].statements_hash = 'edited'
  assert.throws(() => verifyHistory(snapshot, historical, sources), /Untracked or edited/)
})
test('migration source fingerprint preserves literal newlines, quotes, and backslashes', () => {
  assert.notEqual(migrationStatementsHash('SELECT 1;\n'), migrationStatementsHash('SELECT 1;'))
  assert.match(migrationStatementsHash('SELECT \'"\\\\\';\n'), /^[a-f0-9]{32}$/)
})
