// Applies only the two reviewed image replacement migrations to the existing databases.
// Reuses the Supabase CLI login; credentials never appear in arguments or output.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const [stage, mode = '--check', migrationOption = '--replacement', ...extra] = process.argv.slice(2)
const projects = { staging: 'qihsgnfjqmkjmoowyfbn', production: 'kglxxmrvmrxiyigarjfh' }
if (!projects[stage] || !['--check', '--apply', '--verify', '--smoke'].includes(mode) ||
    !['--replacement', '--reuse-uploaded-images'].includes(migrationOption) || extra.length)
  throw new Error('Use staging|production and --check|--apply|--verify, or --smoke --reuse-uploaded-images')
const reuseImages = migrationOption === '--reuse-uploaded-images'
if (mode === '--smoke' && !reuseImages) throw new Error('Smoke checks apply only to image reuse')
const replacementMigration = await readFile(new URL('../../nonchalant/database/migrations/026_save_quick_study_before_image_replacement.sql', import.meta.url), 'utf8')
const migration = reuseImages
  ? await readFile(new URL('../../nonchalant/database/migrations/027_reuse_uploaded_quick_study_images.sql', import.meta.url), 'utf8')
  : replacementMigration
const migrationName = reuseImages ? 'reuse_uploaded_quick_study_images' : 'save_quick_study_before_image_replacement'
const version = reuseImages ? '20261009000001' : '20261009000000'
const saveFunctionBody = sql => {
  const body = sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.save_quick_study_import\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1]
  if (!body) throw new Error('Reviewed SQL contains no import save function')
  return body.trim()
}
const baseSaveBody = saveFunctionBody(replacementMigration)
const reuseSaveBody = reuseImages ? saveFunctionBody(migration) : null
const functions = [
  'get_quick_study_import_job(uuid,uuid)', 'get_legacy_quick_study_import_job(uuid,uuid)',
  'save_quick_study_import(uuid,uuid,jsonb,jsonb,text)', 'finish_external_image_replacement(uuid,uuid,text,text)',
  'list_external_image_replacement_jobs(uuid,text,integer,integer,boolean)',
  'retry_external_image_replacement_job(uuid,uuid)', 'acknowledge_external_image_replacement_failures(uuid,timestamptz)',
  'retry_quick_study_import_job(uuid,uuid)',
]
const newFunctions = functions.filter(name => !['get_quick_study_import_job(uuid,uuid)', 'retry_quick_study_import_job(uuid,uuid)'].includes(name))
const literal = value => "'" + value.replaceAll("'", "''") + "'"
const rpcNames = 'ARRAY[' + functions.map(literal).join(',') + ']::text[]'
const newRpcNames = 'ARRAY[' + newFunctions.map(literal).join(',') + ']::text[]'
const newColumns = `SELECT table_name,column_name FROM information_schema.columns
  WHERE table_schema='public' AND
    ((table_name='quick_study_import_jobs' AND column_name IN ('save_mode','image_host')) OR
     (table_name='quick_study_import_tasks' AND column_name IN ('replacement_result','failure_acknowledged_at')))`
const snapshot = `SELECT json_build_object(
  'history',(SELECT coalesce(json_agg(h),'[]'::json) FROM
    (SELECT version,name,statements FROM supabase_migrations.schema_migrations
      WHERE name=${literal(migrationName)} OR version=${literal(version)}) h),
  'baseInstalled',EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE name='quick_study_import_jobs'),
  'replacementHistory',(SELECT coalesce(json_agg(h),'[]'::json) FROM
    (SELECT version,name,statements FROM supabase_migrations.schema_migrations
      WHERE name='save_quick_study_before_image_replacement' OR version='20261009000000') h),
  'saveBody',(SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.save_quick_study_import(uuid,uuid,jsonb,jsonb,text)')),
  'reuseIndex',(SELECT json_build_object('valid',x.indisvalid,'ready',x.indisready,'definition',pg_get_indexdef(x.indexrelid))
    FROM pg_index x WHERE x.indexrelid=to_regclass('public.quick_study_import_tasks_reusable_source_idx')),
  'tables',(SELECT coalesce(json_agg(t),'[]'::json) FROM
    (SELECT c.relname,c.relrowsecurity,
      has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
      has_table_privilege('anon',c.oid,'INSERT') AS anon_insert
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND relname IN ('quick_study_import_jobs','quick_study_import_tasks')) t),
  'columns',(SELECT coalesce(json_agg(c),'[]'::json) FROM (${newColumns}) c),
  'indexes',(SELECT coalesce(json_agg(indexname),'[]'::json) FROM pg_indexes WHERE schemaname='public'
    AND indexname IN ('quick_study_import_tasks_source_hash_idx','quick_study_import_tasks_failed_alerts_idx','quick_study_import_jobs_user_id_idx')),
  'rpcs',(SELECT json_agg(f) FROM
    (SELECT name,to_regprocedure('public.'||name) IS NOT NULL AS exists,
      CASE WHEN to_regprocedure('public.'||name) IS NOT NULL THEN
        has_function_privilege('authenticated',to_regprocedure('public.'||name),'EXECUTE') ELSE false END AS authenticated_execute,
      CASE WHEN to_regprocedure('public.'||name) IS NOT NULL THEN
        has_function_privilege('anon',to_regprocedure('public.'||name),'EXECUTE') ELSE false END AS anon_execute,
      CASE WHEN to_regprocedure('public.'||name) IS NOT NULL THEN
        has_function_privilege('service_role',to_regprocedure('public.'||name),'EXECUTE') ELSE false END AS worker_execute
      FROM unnest(${rpcNames}) name) f)
) AS snapshot;`
const settings = "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='60s';"
const imageHost = stage === 'production' ? 'images.crackd.ai' : 'images.almostcrackd.ai'
// Exercise the deployed save function without committing fixtures or sending SQS
// messages. Prefer real completed upload history; otherwise seed a temporary
// source mapping to an existing hosted image, then roll back the entire check.
const smokeSql = `BEGIN; ${settings} SET LOCAL ROLE service_role;
  DO $image_reuse_smoke$
  DECLARE
    v_source TEXT; v_url TEXT; v_image UUID; v_actor UUID; v_seed UUID := gen_random_uuid();
    v_import UUID := gen_random_uuid(); v_result JSONB; v_rows JSONB; v_before JSONB;
    v_fixture BOOLEAN := false; v_count INTEGER;
  BEGIN
    SELECT t.source_url, i.url, i.id, j.user_id INTO v_source, v_url, v_image, v_actor
    FROM public.quick_study_import_tasks t JOIN public.quick_study_import_jobs j ON j.id=t.job_id
    JOIN public.images i ON i.id=t.image_id
    WHERE t.status='completed' AND i.url=t.image_url
      AND (j.save_mode='worker' OR t.replacement_result IN ('replaced','reused'))
      AND (j.save_mode='worker' OR j.image_host=${literal(imageHost)})
      AND left(i.url,length(${literal('https://' + imageHost + '/')}))=${literal('https://' + imageHost + '/')}
      AND left(t.source_url,length(${literal('https://' + imageHost + '/')}))<>${literal('https://' + imageHost + '/')}
    ORDER BY t.updated_at DESC,t.id DESC LIMIT 1 FOR SHARE OF i;
    IF NOT FOUND THEN
      v_fixture := true;
      SELECT id INTO v_actor FROM public.profiles WHERE is_superadmin IS TRUE ORDER BY id LIMIT 1;
      SELECT id,url INTO v_image,v_url FROM public.images
        WHERE left(url,length(${literal('https://' + imageHost + '/')}))=${literal('https://' + imageHost + '/')}
        ORDER BY id LIMIT 1 FOR SHARE;
      IF v_actor IS NULL OR v_image IS NULL THEN RAISE EXCEPTION 'No hosted image and actor available for rollback smoke check'; END IF;
      v_source := 'https://example.com/image-reuse-deployment-check/' || v_seed::TEXT;
      INSERT INTO public.quick_study_import_jobs(id,user_id,request,save_mode,image_host)
        VALUES(v_seed,v_actor,'{}','immediate',${literal(imageHost)});
      INSERT INTO public.quick_study_import_tasks(job_id,source_url,target_image_id,rows,image_id,image_url,status,replacement_result)
        VALUES(v_seed,v_source,v_image,'[{"key":"seed"}]',v_image,v_url,'completed','replaced');
    END IF;
    SELECT to_jsonb(i) INTO v_before FROM public.images i WHERE i.id=v_image;
    v_rows := '[{"key":"a","ordinal":0,"caption":"Image reuse deployment check A","userId":null,"flavorId":null,"meta":null},
      {"key":"b","ordinal":1,"caption":"Image reuse deployment check B","userId":null,"flavorId":null,"meta":null}]';
    v_result := public.save_quick_study_import(v_import,v_actor,jsonb_build_object('rows',v_rows),
      jsonb_build_array(jsonb_build_object('sourceUrl',v_source,'rows',v_rows)),${literal(imageHost)});
    IF v_result->>'savedImmediately'<>'true' OR (v_result->>'replacementsPending')::INTEGER<>0
      OR jsonb_array_length(v_result->'rows')<>2 OR EXISTS(SELECT FROM jsonb_array_elements(v_result->'rows') r
        WHERE r->>'imageId' IS DISTINCT FROM v_image::TEXT OR r->>'previewUrl' IS DISTINCT FROM v_url
          OR r->>'status' IS DISTINCT FROM 'complete' OR r->>'captionId' IS NULL) THEN
      RAISE EXCEPTION 'Deployed save did not reuse the existing image with two immediate captions';
    END IF;
    SELECT count(*) INTO v_count FROM public.quick_study_import_tasks
      WHERE job_id=v_import AND image_id=v_image AND target_image_id=v_image
        AND status='completed' AND replacement_result='reused' AND attempts=0;
    IF v_count<>1 OR (SELECT count(*) FROM public.dispatch_quick_study_import_tasks(v_import))<>0 THEN
      RAISE EXCEPTION 'Deployed reuse queued work or returned an incorrect task result';
    END IF;
    IF (SELECT to_jsonb(i) FROM public.images i WHERE i.id=v_image) IS DISTINCT FROM v_before THEN
      RAISE EXCEPTION 'Reuse changed the existing image record';
    END IF;
    PERFORM set_config('codex.image_reuse_smoke',jsonb_build_object('passed',true,'captions',2,
      'sameImageId',true,'queuedUploads',0,'basis',CASE WHEN v_fixture THEN 'rollback_fixture' ELSE 'completed_upload_history' END)::TEXT,true);
  END; $image_reuse_smoke$;
  SELECT current_setting('codex.image_reuse_smoke')::JSONB AS snapshot;
  ROLLBACK;`
const verifyBase = state => {
  if (!state.baseInstalled || state.tables.length !== 2 ||
      state.tables.some(t => !t.relrowsecurity || t.authenticated_select || t.anon_insert))
    throw new Error('The original queue migration must be installed with restricted access')
}
const verifyReplacement = state => {
  verifyBase(state)
  const history = state.replacementHistory[0]
  if (state.replacementHistory.length !== 1 || history.name !== 'save_quick_study_before_image_replacement' ||
      history.version !== '20261009000000' || history.statements?.[0]?.trim() !== replacementMigration.trim())
    throw new Error('The reviewed immediate-save migration must be installed first')
  if (state.columns.length !== 4 || state.indexes.length !== 3 ||
      state.rpcs.length !== functions.length ||
      state.rpcs.some(f => !f.exists || f.authenticated_execute || f.anon_execute || !f.worker_execute))
    throw new Error('Replacement schema or permissions verification failed')
}
const verify = state => {
  verifyBase(state)
  const history = state.history[0]
  if (state.history.length !== 1 || history.name !== migrationName || history.version !== version ||
      history.statements?.[0]?.trim() !== migration.trim()) throw new Error('Migration history does not match reviewed SQL')
  if (state.columns.length !== 4 || state.indexes.length !== 3 ||
      state.rpcs.length !== functions.length ||
      state.rpcs.some(f => !f.exists || f.authenticated_execute || f.anon_execute || !f.worker_execute))
    throw new Error('Replacement schema or permissions verification failed')
  if (reuseImages) {
    verifyReplacement(state)
    if (state.saveBody?.trim() !== reuseSaveBody || !state.reuseIndex?.valid || !state.reuseIndex?.ready ||
        state.reuseIndex.definition !== "CREATE INDEX quick_study_import_tasks_reusable_source_idx ON public.quick_study_import_tasks USING btree (md5(source_url), updated_at DESC, id DESC) WHERE ((status = 'completed'::text) AND (image_id IS NOT NULL))")
      throw new Error('Reuse function or index does not match reviewed SQL')
  }
}
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
      const message = typeof details?.message === 'string' ? details.message :
        typeof details?.error === 'string' ? details.error : null
      throw new Error('Supabase Management API returned HTTP ' + response.status +
        (message ? ': ' + message.slice(0, 500) : ''))
    }
    const rows = await response.json()
    const state = rows.find(row => row.snapshot)?.snapshot
    if (!state) throw new Error('Database did not return a migration snapshot')
    return state
  }
  let state = await query(`BEGIN READ ONLY; ${settings} ${snapshot} COMMIT;`, true)
  verifyBase(state)
  if (reuseImages) verifyReplacement(state)
  const exists = state.history.length > 0
  if (exists) verify(state)
  else if (reuseImages ? state.reuseIndex || state.saveBody?.trim() !== baseSaveBody :
      state.columns.length || state.rpcs.some(f => newFunctions.includes(f.name) && f.exists))
    throw new Error('Unrecorded replacement objects exist; refusing to overwrite')
  if (['--verify', '--smoke'].includes(mode) && !exists) throw new Error('Replacement migration is not installed')
  if (mode === '--apply' && !exists) {
    const body = migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
    state = await query(`BEGIN; ${settings}
      DO $$ BEGIN
        IF NOT pg_try_advisory_xact_lock(hashtextextended('nonchalant:quick-study-import-jobs',0)) THEN
          RAISE EXCEPTION 'Queue migration already running';
        END IF;
        IF EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE name=${literal(migrationName)} OR version=${literal(version)})
          OR ${reuseImages
            ? `to_regclass('public.quick_study_import_tasks_reusable_source_idx') IS NOT NULL
              OR (SELECT btrim(prosrc, chr(10) || chr(13) || chr(9) || ' ') FROM pg_proc WHERE oid=to_regprocedure('public.save_quick_study_import(uuid,uuid,jsonb,jsonb,text)')) IS DISTINCT FROM ${literal(baseSaveBody)}`
            : `EXISTS(${newColumns})
              OR EXISTS(SELECT FROM unnest(${newRpcNames}) name WHERE to_regprocedure('public.'||name) IS NOT NULL)`} THEN
          RAISE EXCEPTION 'Migration state changed since preflight';
        END IF;
      END; $$;
      ${body}
      INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES(${literal(version)},${literal(migrationName)},ARRAY[${literal(migration)}]);
      ${snapshot} COMMIT;`, false)
    verify(state)
  }
  const smoke = mode === '--smoke' ? await query(smokeSql, false) : undefined
  console.log(JSON.stringify({ stage, project: projects[stage], mode, migration: migrationName,
    sha256: createHash('sha256').update(migration).digest('hex'), installed: exists || mode === '--apply',
    applied: mode === '--apply' && !exists, functionsVerified: state.rpcs.filter(f => f.exists).length,
    ...(smoke ? { smoke } : {}) }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ stage, mode, error: error.message }))
  process.exitCode = 1
}
