// Deploy only the reviewed SHA-256 registry migration. SQL and project IDs are
// fixed; the Supabase CLI login never appears in arguments or output.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const [stage, mode = '--check', ...extra] = process.argv.slice(2)
const projects = { staging: 'qihsgnfjqmkjmoowyfbn', production: 'kglxxmrvmrxiyigarjfh' }
if (!projects[stage] || !['--check', '--apply', '--verify', '--smoke'].includes(mode) || extra.length)
  throw new Error('Use staging|production and --check|--apply|--verify|--smoke')
const migration = await readFile(new URL('../../nonchalant/database/migrations/028_image_content_hashes.sql', import.meta.url), 'utf8')
const previous = await readFile(new URL('../../nonchalant/database/migrations/027_reuse_uploaded_quick_study_images.sql', import.meta.url), 'utf8')
const migrationName = 'image_content_hashes'
const version = '20261009000002'
const literal = value => "'" + value.replaceAll("'", "''") + "'"
const functions = [
  ['claim_image_content_upload(text,text)', false],
  ['finish_image_content_upload(uuid,uuid,text,text)', false],
  ['release_image_content_upload(uuid,uuid)', false],
  ['find_image_content_duplicate(text,text,uuid,text,boolean)', false],
  ['find_ready_image_content_asset(text,text)', false],
  ['sync_image_content_hashes()', true],
]
const functionBodies = new Map([...migration.matchAll(/CREATE FUNCTION public\.(\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)]
  .map(match => [match[1], match[2].trim()]))
if (functionBodies.size !== functions.length) throw new Error('Reviewed migration must contain six hash functions')
const rpcNames = 'ARRAY[' + functions.map(([name]) => literal(name)).join(',') + ']::text[]'
const indexes = new Map([
  ['image_content_assets_stored_hash_idx', "CREATE INDEX image_content_assets_stored_hash_idx ON public.image_content_assets USING btree (image_host, stored_sha256) WHERE (status = 'ready'::text)"],
  ['image_content_assets_storage_key_idx', "CREATE INDEX image_content_assets_storage_key_idx ON public.image_content_assets USING btree (image_host, storage_key) WHERE (status = 'ready'::text)"],
  ['image_content_hashes_asset_idx', 'CREATE INDEX image_content_hashes_asset_idx ON public.image_content_hashes USING btree (asset_id)'],
  ['images_content_url_hash_idx', 'CREATE INDEX images_content_url_hash_idx ON public.images USING btree (md5(url)) WHERE (url IS NOT NULL)'],
])
const settings = "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='60s';"
const snapshot = `SELECT json_build_object(
  'history',(SELECT coalesce(json_agg(h),'[]'::json) FROM
    (SELECT version,name,statements FROM supabase_migrations.schema_migrations
      WHERE name=${literal(migrationName)} OR version=${literal(version)}) h),
  'previousHistory',(SELECT coalesce(json_agg(h),'[]'::json) FROM
    (SELECT version,name,statements FROM supabase_migrations.schema_migrations
      WHERE name='reuse_uploaded_quick_study_images' OR version='20261009000001') h),
  'tables',(SELECT coalesce(json_agg(t),'[]'::json) FROM
    (SELECT c.relname,c.relrowsecurity,
      (has_table_privilege('authenticated',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'INSERT')
        OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE')) AS authenticated_access,
      (has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('anon',c.oid,'INSERT')
        OR has_table_privilege('anon',c.oid,'UPDATE') OR has_table_privilege('anon',c.oid,'DELETE')) AS anon_access,
      (has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT')
        AND has_table_privilege('service_role',c.oid,'UPDATE') AND has_table_privilege('service_role',c.oid,'DELETE')) AS worker_access
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('image_content_assets','image_content_hashes')) t),
  'indexes',(SELECT coalesce(json_agg(x),'[]'::json) FROM
    (SELECT c.relname AS name,i.indisvalid AS valid,i.indisready AS ready,pg_get_indexdef(c.oid) AS definition
      FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN (${[...indexes.keys()].map(literal).join(',')})) x),
  'rpcs',(SELECT json_agg(f) FROM
    (SELECT name,p.prosrc AS body,p.prosecdef AS security_definer,p.proconfig AS config,
      coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) AS authenticated_execute,
      coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) AS anon_execute,
      coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) AS worker_execute
      FROM unnest(${rpcNames}) name LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.'||name)) f),
  'trigger',(SELECT json_build_object('enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))
    FROM pg_trigger t WHERE t.tgrelid='public.images'::regclass AND t.tgname='images_sync_content_hashes'),
  'cascadeKeys',(SELECT coalesce(json_agg(pg_get_constraintdef(oid)),'[]'::json) FROM pg_constraint
    WHERE conrelid=to_regclass('public.image_content_hashes') AND contype='f' AND confdeltype='c'),
  'counts',CASE WHEN to_regclass('public.image_content_hashes') IS NULL THEN NULL ELSE
    (SELECT json_build_object('stagingHosted',count(*) FILTER (WHERE url LIKE 'https://images.almostcrackd.ai/%'),
      'productionHosted',count(*) FILTER (WHERE url LIKE 'https://images.crackd.ai/%')) FROM public.images) END
) AS snapshot;`
const absent = `to_regclass('public.image_content_assets') IS NULL AND to_regclass('public.image_content_hashes') IS NULL
  AND NOT EXISTS(SELECT FROM unnest(${rpcNames}) name WHERE to_regprocedure('public.'||name) IS NOT NULL)
  AND NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.images'::regclass AND tgname='images_sync_content_hashes')
  AND NOT EXISTS(SELECT FROM pg_indexes WHERE schemaname='public' AND indexname IN (${[...indexes.keys()].map(literal).join(',')}))`
const verifyPrevious = state => {
  const history = state.previousHistory[0]
  if (state.previousHistory.length !== 1 || history.version !== '20261009000001' ||
      history.name !== 'reuse_uploaded_quick_study_images' || history.statements?.length !== 1 ||
      history.statements[0].trim() !== previous.trim())
    throw new Error('The reviewed image URL reuse migration must be installed first')
}
const verify = state => {
  verifyPrevious(state)
  const history = state.history[0]
  if (state.history.length !== 1 || history.version !== version || history.name !== migrationName ||
      history.statements?.length !== 1 || history.statements[0].trim() !== migration.trim())
    throw new Error('Migration history does not match reviewed SQL')
  if (state.tables.length !== 2 || state.tables.some(t => !t.relrowsecurity || t.authenticated_access || t.anon_access || !t.worker_access))
    throw new Error('Hash tables must have RLS and backend-only access')
  // images.url is varchar on the hosted databases and text in the local fixture;
  // PostgreSQL renders the implicit text cast in the hosted expression index.
  if (state.indexes.length !== indexes.size || state.indexes.some(i => !i.valid || !i.ready ||
      indexes.get(i.name) !== i.definition.replace('md5((url)::text)', 'md5(url)')))
    throw new Error('Hash indexes do not match reviewed SQL: ' + JSON.stringify(state.indexes))
  if (state.rpcs.length !== functions.length || state.rpcs.some(f => {
    const definition = functions.find(([name]) => name === f.name)
    return !definition || f.body?.trim() !== functionBodies.get(f.name.split('(')[0]) ||
      f.security_definer !== definition[1] || f.authenticated_execute || f.anon_execute ||
      (!definition[1] && !f.worker_execute) || f.config?.length !== 1 || f.config[0] !== 'search_path=public, pg_temp'
  })) throw new Error('Hash functions or permissions do not match reviewed SQL')
  if (state.trigger?.enabled !== 'O' || state.trigger.definition !== 'CREATE TRIGGER images_sync_content_hashes AFTER INSERT OR UPDATE OF url ON public.images FOR EACH ROW EXECUTE FUNCTION sync_image_content_hashes()' ||
      state.cascadeKeys.length !== 2 || !state.cascadeKeys.includes('FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE') ||
      !state.cascadeKeys.includes('FOREIGN KEY (asset_id) REFERENCES image_content_assets(id) ON DELETE CASCADE'))
    throw new Error('Hash trigger or cascading associations do not match reviewed SQL')
}
const imageHost = stage === 'production' ? 'images.crackd.ai' : 'images.almostcrackd.ai'
const otherHost = stage === 'production' ? 'images.almostcrackd.ai' : 'images.crackd.ai'
// No S3 uploads, committed fixtures, or queue messages: all writes roll back.
const smokeSql = `BEGIN; ${settings} SET LOCAL ROLE service_role;
  DO $hash_smoke$
  DECLARE v_actor UUID; v_other UUID := gen_random_uuid(); v_image UUID := gen_random_uuid();
    v_source TEXT := md5(gen_random_uuid()::TEXT)||md5(gen_random_uuid()::TEXT);
    v_stored TEXT := md5(gen_random_uuid()::TEXT)||md5(gen_random_uuid()::TEXT);
    v_claim JSONB; v_asset UUID; v_token UUID; v_url TEXT; v_job UUID := gen_random_uuid();
    v_saved JSONB; v_task UUID; v_target UUID; v_caption UUID; v_worker JSONB;
  BEGIN
    SELECT id INTO v_actor FROM public.profiles WHERE is_superadmin IS TRUE ORDER BY id LIMIT 1;
    IF v_actor IS NULL THEN RAISE EXCEPTION 'No staging actor available for rollback check'; END IF;
    v_claim := public.claim_image_content_upload(${literal(imageHost)},v_source);
    IF v_claim->>'status'<>'claimed' OR public.claim_image_content_upload(${literal(imageHost)},v_source)->>'status'<>'busy'
      THEN RAISE EXCEPTION 'Upload lease concurrency failed'; END IF;
    v_asset := (v_claim->'asset'->>'id')::UUID; v_token := (v_claim->'asset'->>'lease_token')::UUID;
    IF public.finish_image_content_upload(v_asset,gen_random_uuid(),'deployment-check/'||v_asset::TEXT||'.jpg',v_stored)
      THEN RAISE EXCEPTION 'Stale lease published content'; END IF;
    IF NOT public.finish_image_content_upload(v_asset,v_token,'deployment-check/'||v_asset::TEXT||'.jpg',v_stored)
      THEN RAISE EXCEPTION 'Valid lease did not publish content'; END IF;
    IF public.claim_image_content_upload(${literal(imageHost)},v_source)->>'status'<>'ready'
      OR public.claim_image_content_upload(${literal(imageHost)},v_stored)->>'status'<>'ready'
      OR public.find_ready_image_content_asset(${literal(otherHost)},v_stored) IS NOT NULL
      THEN RAISE EXCEPTION 'Source/stored hashes or environment isolation failed'; END IF;
    v_url := 'https://' || ${literal(imageHost)} || '/deployment-check/'||v_asset::TEXT||'.jpg';
    INSERT INTO public.images(id,url,profile_id,is_common_use,is_public) VALUES(v_image,v_url,v_actor,false,false);
    IF public.find_image_content_duplicate(${literal(imageHost)},v_source,v_actor,NULL,false)->>'id' IS DISTINCT FROM v_image::TEXT
      OR public.find_image_content_duplicate(${literal(imageHost)},v_source,v_other,NULL,false) IS NOT NULL
      OR public.find_image_content_duplicate(${literal(imageHost)},v_source,v_actor,NULL,true) IS NOT NULL
      THEN RAISE EXCEPTION 'Image association, ownership, or visibility checks failed'; END IF;
    v_saved := public.save_quick_study_import(v_job,v_actor,'{"rows":[{"key":"hash"}]}',
      jsonb_build_array(jsonb_build_object('sourceUrl','https://example.com/deployment-check/'||v_asset::TEXT,
        'rows',jsonb_build_array(jsonb_build_object('key','hash','ordinal',0,'caption','before','flavorId',NULL,'userId',NULL,'meta',NULL)))),${literal(imageHost)});
    v_target := (v_saved->'rows'->0->>'imageId')::UUID; v_caption := (v_saved->'rows'->0->>'captionId')::UUID;
    SELECT id INTO v_task FROM public.quick_study_import_tasks WHERE job_id=v_job;
    v_worker := public.claim_quick_study_import_task(v_task);
    UPDATE public.captions SET content='edited while upload runs' WHERE id=v_caption;
    IF NOT public.finish_external_image_replacement(v_task,(v_worker->'task'->>'lease_token')::UUID,v_url,${literal(imageHost)})
      THEN RAISE EXCEPTION 'Shared content replacement failed'; END IF;
    IF (SELECT image_id FROM public.captions WHERE id=v_caption) IS DISTINCT FROM v_target
      OR (SELECT content FROM public.captions WHERE id=v_caption) IS DISTINCT FROM 'edited while upload runs'
      OR (SELECT url FROM public.images WHERE id=v_target) IS DISTINCT FROM v_url
      OR NOT EXISTS(SELECT FROM public.image_content_hashes WHERE image_id=v_target)
      THEN RAISE EXCEPTION 'Replacement lost saved IDs, caption edits, or fingerprint'; END IF;
    UPDATE public.images SET url='https://example.com/changed.jpg' WHERE id=v_image;
    IF EXISTS(SELECT FROM public.image_content_hashes WHERE image_id=v_image)
      THEN RAISE EXCEPTION 'Changing URL did not invalidate the fingerprint'; END IF;
    PERFORM set_config('codex.image_hash_smoke','{"passed":true,"leaseConcurrency":true,"environmentIsolation":true,"ownershipIsolation":true,"captionEditsPreserved":true,"rolledBack":true}',true);
  END; $hash_smoke$;
  SELECT current_setting('codex.image_hash_smoke')::JSONB AS snapshot; ROLLBACK;`

try {
  const stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const token = stored.startsWith('go-keyring-base64:') ? Buffer.from(stored.slice(18), 'base64').toString('utf8') :
    stored.startsWith('go-keyring-encoded:') ? Buffer.from(stored.slice(19), 'hex').toString('utf8') : stored
  const query = async (sql, readOnly) => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projects[stage]}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) {
      const details = await response.json().catch(() => null)
      const message = typeof details?.message === 'string' ? details.message : typeof details?.error === 'string' ? details.error : null
      throw new Error('Supabase Management API returned HTTP ' + response.status + (message ? ': ' + message.slice(0, 500) : ''))
    }
    const rows = await response.json()
    const state = rows.find(row => row.snapshot)?.snapshot
    if (!state) throw new Error('Database did not return a migration snapshot')
    return state
  }
  let state = await query(`BEGIN READ ONLY; ${settings} ${snapshot} COMMIT;`, true)
  verifyPrevious(state)
  const exists = state.history.length > 0
  if (exists) verify(state)
  else if (state.tables.length || state.indexes.length || state.trigger || state.rpcs.some(f => f.body))
    throw new Error('Unrecorded hash objects exist; refusing to overwrite')
  if (['--verify', '--smoke'].includes(mode) && !exists) throw new Error('Hash migration is not installed')
  if (mode === '--apply' && !exists) {
    const body = migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
    state = await query(`BEGIN; ${settings}
      DO $image_hash_migration_guard$ BEGIN
        IF NOT pg_try_advisory_xact_lock(hashtextextended('nonchalant:quick-study-import-jobs',0)) THEN
          RAISE EXCEPTION 'Image migration already running'; END IF;
        IF EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE name=${literal(migrationName)} OR version=${literal(version)})
          OR NOT (${absent}) OR NOT EXISTS(SELECT FROM supabase_migrations.schema_migrations
            WHERE version='20261009000001' AND name='reuse_uploaded_quick_study_images' AND statements=ARRAY[${literal(previous)}])
          THEN RAISE EXCEPTION 'Migration state changed since preflight'; END IF;
      END; $image_hash_migration_guard$;
      ${body}
      INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES(${literal(version)},${literal(migrationName)},ARRAY[${literal(migration)}]);
      ${snapshot} COMMIT;`, false)
    verify(state)
  }
  const smoke = mode === '--smoke' ? await query(smokeSql, false) : undefined
  const fingerprints = exists || mode === '--apply' ? await query(`BEGIN READ ONLY; ${settings}
    SELECT json_build_object(
      'hostedImages',count(*),
      'hashedImages',count(*) FILTER (WHERE h.image_url=i.url),
      'remainingImages',count(*) FILTER (WHERE h.image_url IS DISTINCT FROM i.url),
      'remainingFiles',count(DISTINCT i.url) FILTER (WHERE h.image_url IS DISTINCT FROM i.url)) AS snapshot
    FROM public.images i LEFT JOIN public.image_content_hashes h ON h.image_id=i.id
    WHERE i.url LIKE ${literal('https://' + imageHost + '/%')}; COMMIT;`, true) : undefined
  console.log(JSON.stringify({ stage, project: projects[stage], mode, migration: migrationName,
    sha256: createHash('sha256').update(migration).digest('hex'), installed: exists || mode === '--apply',
    applied: mode === '--apply' && !exists, functionsVerified: state.rpcs.filter(f => f.body).length,
    ...(state.counts ? { images: state.counts } : {}), ...(fingerprints ? { fingerprints } : {}),
    ...(smoke ? { smoke } : {}) }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ stage, mode, error: error.message }))
  process.exitCode = 1
}
