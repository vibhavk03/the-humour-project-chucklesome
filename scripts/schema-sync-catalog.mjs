// Fixed read-only catalog query used to verify the October 10 schema alignment.
export const catalogSql = String.raw`
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '45s';
WITH ns AS (SELECT * FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'),
relations AS (SELECT c.*, n.nspname FROM pg_class c JOIN ns n ON n.oid=c.relnamespace),
ext_objects AS (SELECT d.classid,d.objid,e.extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.deptype='e' AND d.refclassid='pg_extension'::regclass)
SELECT jsonb_build_object(
'metadata',jsonb_build_object('captured_at',now(),'server_version',current_setting('server_version'),'query_role',current_user),
'schemas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT nspname AS key,pg_get_userbyid(nspowner) AS owner,nspacl IS NULL AS default_acl,ARRAY(SELECT a::text FROM unnest(COALESCE(nspacl,acldefault('n',nspowner))) a ORDER BY a::text) AS acl FROM ns) x),
'relations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT nspname||'.'||relname AS key,nspname AS schema,relkind AS kind,pg_get_userbyid(relowner) AS owner,
 relpersistence AS persistence,relrowsecurity AS rls,relforcerowsecurity AS force_rls,relreplident AS replica_identity,
 relacl IS NULL AS default_acl,ARRAY(SELECT a::text FROM unnest(COALESCE(relacl,acldefault('r',relowner))) a ORDER BY a::text) AS acl,ARRAY(SELECT a FROM unnest(reloptions) a ORDER BY a) AS options,
 CASE WHEN relkind='p' THEN pg_get_partkeydef(oid) END AS partition_key,pg_get_expr(relpartbound,oid) AS partition_bound,
 obj_description(oid,'pg_class') AS comment
 FROM relations WHERE relkind IN ('r','p','f','v','m')) x),
'columns',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT c.nspname||'.'||c.relname||'.'||a.attname AS key,c.nspname AS schema,a.attnum AS position,
 format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_expression,
 a.attidentity AS identity,a.attgenerated AS generated,a.attstorage AS storage,a.attcompression AS compression,
 CASE WHEN a.attcollation<>0 THEN a.attcollation::regcollation::text END AS collation,
 ARRAY(SELECT z::text FROM unnest(a.attacl) z ORDER BY z::text) AS acl,col_description(c.oid,a.attnum) AS comment
 FROM relations c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE c.relkind IN ('r','p','f','v','m','c') AND a.attnum>0 AND NOT a.attisdropped) x),
'constraints',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT n.nspname||'.'||COALESCE(c.relname,t.typname)||'.'||con.conname AS key,n.nspname AS schema,
 con.contype AS type,pg_get_constraintdef(con.oid,false) AS definition,con.convalidated AS validated,
 con.condeferrable AS deferrable,con.condeferred AS initially_deferred,con.connoinherit AS no_inherit
 FROM pg_constraint con JOIN ns n ON n.oid=con.connamespace LEFT JOIN pg_class c ON c.oid=con.conrelid LEFT JOIN pg_type t ON t.oid=con.contypid) x),
'indexes',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT c.nspname||'.'||c.relname AS key,c.nspname AS schema,pg_get_indexdef(c.oid,0,false) AS definition,
 i.indisvalid AS valid,i.indisready AS ready,i.indisreplident AS replica_identity,i.indisclustered AS clustered,
 ARRAY(SELECT a FROM unnest(c.reloptions) a ORDER BY a) AS options
 FROM relations c JOIN pg_index i ON i.indexrelid=c.oid) x),
'functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS key,n.nspname AS schema,
 pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,
 p.proacl IS NULL AS default_acl,ARRAY(SELECT a::text FROM unnest(COALESCE(p.proacl,acldefault('f',p.proowner))) a ORDER BY a::text) AS acl
 FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p')
 AND NOT EXISTS(SELECT FROM ext_objects e WHERE e.classid='pg_proc'::regclass AND e.objid=p.oid)) x),
'policies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT c.nspname||'.'||c.relname||'.'||p.polname AS key,c.nspname AS schema,p.polcmd AS command,p.polpermissive AS permissive,
 ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r)::text END FROM unnest(p.polroles) r ORDER BY 1) AS roles,
 pg_get_expr(p.polqual,p.polrelid,false) AS using_expression,pg_get_expr(p.polwithcheck,p.polrelid,false) AS check_expression
 FROM pg_policy p JOIN relations c ON c.oid=p.polrelid) x),
'triggers',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT c.nspname||'.'||c.relname||'.'||t.tgname AS key,c.nspname AS schema,t.tgenabled AS enabled,pg_get_triggerdef(t.oid,false) AS definition
 FROM pg_trigger t JOIN relations c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal) x),
'views',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT nspname||'.'||relname AS key,nspname AS schema,pg_get_viewdef(oid,false) AS definition FROM relations WHERE relkind IN ('v','m')) x),
'types',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT n.nspname||'.'||t.typname AS key,n.nspname AS schema,t.typtype AS kind,pg_get_userbyid(t.typowner) AS owner,
 t.typacl IS NULL AS default_acl,ARRAY(SELECT a::text FROM unnest(COALESCE(t.typacl,acldefault('T',t.typowner))) a ORDER BY a::text) AS acl,
 CASE WHEN t.typtype='d' THEN format_type(t.typbasetype,t.typtypmod) END AS base_type,t.typnotnull AS not_null,t.typdefault AS default_expression,
 CASE WHEN t.typtype='e' THEN ARRAY(SELECT enumlabel::text FROM pg_enum WHERE enumtypid=t.oid ORDER BY enumsortorder) END AS labels
 FROM pg_type t JOIN ns n ON n.oid=t.typnamespace LEFT JOIN pg_class c ON c.oid=t.typrelid
 WHERE (t.typtype IN ('e','d') OR (t.typtype='c' AND c.relkind='c'))
 AND NOT EXISTS(SELECT FROM ext_objects e WHERE e.classid='pg_type'::regclass AND e.objid=t.oid)) x),
'sequences',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT c.nspname||'.'||c.relname AS key,c.nspname AS schema,pg_get_userbyid(c.relowner) AS owner,
 c.relacl IS NULL AS default_acl,ARRAY(SELECT a::text FROM unnest(COALESCE(c.relacl,acldefault('s',c.relowner))) a ORDER BY a::text) AS acl,format_type(s.seqtypid,NULL) AS type,
 s.seqstart::text AS start,s.seqincrement::text AS increment,s.seqmax::text AS max,s.seqmin::text AS min,s.seqcache::text AS cache,s.seqcycle AS cycle,
 (SELECT jsonb_agg(jsonb_build_object('table',rc.nspname||'.'||rc.relname,'column',a.attname,'dependency',d.deptype) ORDER BY rc.nspname,rc.relname,a.attname)
 FROM pg_depend d JOIN relations rc ON rc.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=rc.oid AND a.attnum=d.refobjsubid
 WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')) AS owned_by
 FROM pg_sequence s JOIN relations c ON c.oid=s.seqrelid) x),
'default_privileges',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT pg_get_userbyid(d.defaclrole)||':'||COALESCE(n.nspname,'*')||':'||d.defaclobjtype::text AS key,n.nspname AS schema,
 ARRAY(SELECT a::text FROM unnest(d.defaclacl) a ORDER BY a::text) AS acl
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace) x),
'extensions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT e.extname AS key,n.nspname AS schema,e.extversion AS version,e.extrelocatable AS relocatable,pg_get_userbyid(e.extowner) AS owner
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace) x),
'extension_objects',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT e.extname||':'||i.type||':'||i.identity AS key,e.extname AS extension,i.type AS kind,i.schema AS schema,i.identity AS identity
 FROM ext_objects e CROSS JOIN LATERAL pg_identify_object(e.classid,e.objid,0) i) x),
'extension_functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS key,n.nspname AS schema,e.extname AS extension,
 pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,
 p.proacl IS NULL AS default_acl,ARRAY(SELECT a::text FROM unnest(COALESCE(p.proacl,acldefault('f',p.proowner))) a ORDER BY a::text) AS acl
 FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace JOIN ext_objects e ON e.classid='pg_proc'::regclass AND e.objid=p.oid
 WHERE p.prokind IN ('f','p')) x),
'publications',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT p.pubname AS key,pg_get_userbyid(p.pubowner) AS owner,p.puballtables AS all_tables,p.pubinsert AS inserts,p.pubupdate AS updates,
 p.pubdelete AS deletes,p.pubtruncate AS truncates,p.pubviaroot AS via_root,
 (SELECT jsonb_agg(to_jsonb(z) ORDER BY z.schemaname,z.tablename) FROM
 (SELECT schemaname,tablename,attnames,rowfilter FROM pg_publication_tables pt WHERE pt.pubname=p.pubname) z) AS tables
 FROM pg_publication p) x),
'roles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT rolname AS key,rolsuper AS superuser,rolinherit AS inherit,rolcreaterole AS create_role,rolcreatedb AS create_database,
 rolcanlogin AS login,rolreplication AS replication,rolbypassrls AS bypass_rls,rolconnlimit AS connection_limit
 FROM pg_roles) x),
'role_memberships',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT pg_get_userbyid(m.roleid)||':'||pg_get_userbyid(m.member)||':'||pg_get_userbyid(m.grantor) AS key,m.admin_option,m.inherit_option,m.set_option
 FROM pg_auth_members m) x),
'event_triggers',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT evtname AS key,evtevent AS event,pg_get_userbyid(evtowner) AS owner,evtfoid::regprocedure::text AS function,evtenabled AS enabled,evttags AS tags
 FROM pg_event_trigger) x),
'rules',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT c.nspname||'.'||c.relname||'.'||r.rulename AS key,c.nspname AS schema,pg_get_ruledef(r.oid,false) AS definition
 FROM pg_rewrite r JOIN relations c ON c.oid=r.ev_class WHERE r.rulename <> '_RETURN') x),
'migration_history',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM (
 SELECT version AS key,name,md5(statements::text) AS statements_hash FROM supabase_migrations.schema_migrations) x)
) AS snapshot;
COMMIT;
`
