-- Disposable database only: test the old access contract and the new policies.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
$$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,is_superadmin boolean NOT NULL);
INSERT INTO public.profiles VALUES
 ('00000000-0000-0000-0000-000000000001',true),
 ('00000000-0000-0000-0000-000000000002',false),
 ('00000000-0000-0000-0000-000000000003',false);
CREATE FUNCTION public.is_superadmin(user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM public.profiles WHERE id=user_id AND is_superadmin=true)
$$;
CREATE TABLE public.images(id uuid PRIMARY KEY,profile_id uuid REFERENCES public.profiles,
  is_public boolean,is_common_use boolean,url text);
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
GRANT SELECT ON public.images TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.images TO authenticated;
CREATE POLICY "Anonymous users can view public or common-use images" ON public.images FOR SELECT TO anon
  USING(is_public=true OR is_common_use=true);
CREATE POLICY "Own images + common use + public view" ON public.images FOR SELECT TO authenticated
  USING(profile_id=auth.uid() OR is_common_use=true OR is_public=true OR public.is_superadmin(auth.uid()));
CREATE POLICY "Authenticated users can upload their own images" ON public.images FOR INSERT TO authenticated
  WITH CHECK(profile_id=auth.uid() AND (is_common_use IS FALSE OR (is_common_use IS TRUE AND public.is_superadmin(auth.uid()))));
CREATE POLICY "Own image update + admin update all" ON public.images FOR UPDATE TO authenticated
  USING(profile_id=auth.uid() OR public.is_superadmin(auth.uid()))
  WITH CHECK(profile_id=auth.uid() OR public.is_superadmin(auth.uid()));
CREATE POLICY "Own image delete + admin delete all" ON public.images FOR DELETE TO authenticated
  USING(profile_id=auth.uid() OR public.is_superadmin(auth.uid()));

-- Exhaust owner and visibility combinations, including nullable flags and owners.
CREATE TABLE public.performance_test_fixtures AS
 SELECT gen_random_uuid() AS id,owner.profile_id,visibility.is_public,common_use.is_common_use
 FROM (VALUES
   ('00000000-0000-0000-0000-000000000001'::uuid),
   ('00000000-0000-0000-0000-000000000002'::uuid),
   ('00000000-0000-0000-0000-000000000003'::uuid),(NULL::uuid)) owner(profile_id)
 CROSS JOIN (VALUES(true),(false),(NULL::boolean)) visibility(is_public)
 CROSS JOIN (VALUES(true),(false),(NULL::boolean)) common_use(is_common_use);
INSERT INTO public.images SELECT *, 'https://example.com/fixture' FROM public.performance_test_fixtures;
GRANT SELECT ON public.performance_test_fixtures TO anon,authenticated;
CREATE FUNCTION public.performance_assert(ok boolean,description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %',description; END IF; END;
$$;
CREATE FUNCTION public.test_image_actor(actor uuid,admin boolean,anonymous boolean,phase text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE f record; expected boolean; got boolean; changed integer; checks integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'is_anonymous',anonymous)::text,true);
  FOR f IN SELECT * FROM public.performance_test_fixtures LOOP
    expected:=coalesce(f.profile_id=actor OR f.is_public=true OR f.is_common_use=true OR admin,false);
    SELECT EXISTS(SELECT FROM public.images WHERE id=f.id) INTO got;
    PERFORM public.performance_assert(got=expected,phase||': authenticated visibility'); checks:=checks+1;

    -- Each successful write is rolled back in its own exception subtransaction.
    -- Denied writes must still fail under the actual authenticated database role.
    got:=false;
    BEGIN
      UPDATE public.images SET url='https://example.com/update-check' WHERE id=f.id;
      GET DIAGNOSTICS changed=ROW_COUNT; got:=changed=1;
      RAISE SQLSTATE 'ZX001';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
    END;
    expected:=coalesce(f.profile_id=actor OR admin,false);
    PERFORM public.performance_assert(got=expected,phase||': authenticated update'); checks:=checks+1;

    got:=false;
    BEGIN
      DELETE FROM public.images WHERE id=f.id;
      GET DIAGNOSTICS changed=ROW_COUNT; got:=changed=1;
      RAISE SQLSTATE 'ZX001';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
    END;
    PERFORM public.performance_assert(got=expected,phase||': authenticated delete'); checks:=checks+1;

    got:=false;
    BEGIN
      INSERT INTO public.images(id,profile_id,is_public,is_common_use,url)
      VALUES(gen_random_uuid(),f.profile_id,f.is_public,f.is_common_use,'https://example.com/insert-check');
      got:=true; RAISE SQLSTATE 'ZX001';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
      WHEN insufficient_privilege THEN NULL;
    END;
    expected:=coalesce(f.profile_id=actor AND
      (f.is_common_use IS FALSE OR (f.is_common_use IS TRUE AND admin)),false);
    PERFORM public.performance_assert(got=expected,phase||': authenticated insert'); checks:=checks+1;
  END LOOP;
  -- Changing ownership must obey UPDATE WITH CHECK, including for an admin.
  got:=false;
  BEGIN
    UPDATE public.images SET profile_id='00000000-0000-0000-0000-000000000003'
      WHERE id=(SELECT id FROM public.performance_test_fixtures WHERE profile_id=actor LIMIT 1);
    GET DIAGNOSTICS changed=ROW_COUNT; got:=changed=1;
    RAISE SQLSTATE 'ZX001';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
  expected:=actor IS NOT NULL AND (admin OR actor='00000000-0000-0000-0000-000000000003'::uuid);
  PERFORM public.performance_assert(got=expected,phase||': owner reassignment'); checks:=checks+1;
  PERFORM public.performance_assert(current_user='authenticated',phase||': actual role was authenticated');
  RETURN checks;
END;
$$;
CREATE FUNCTION public.test_anon_images(phase text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE f record; got boolean; checks integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims','{}',true);
  FOR f IN SELECT * FROM public.performance_test_fixtures LOOP
    SELECT EXISTS(SELECT FROM public.images WHERE id=f.id) INTO got;
    PERFORM public.performance_assert(got=coalesce(f.is_public=true OR f.is_common_use=true,false),phase||': anon visibility');
    checks:=checks+1;
  END LOOP;
  PERFORM public.performance_assert(current_user='anon',phase||': actual role was anon');
  RETURN checks;
END;
$$;

-- Run the same complete matrix before and after applying the policy migration.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000001',true,false,'before admin');
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000002',false,false,'before owner');
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000003',false,false,'before other');
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000002',false,true,'before signed-in anonymous');
SELECT public.test_image_actor(NULL,false,false,'before missing uid');
SET LOCAL ROLE anon;
SELECT public.test_anon_images('before anon');
ROLLBACK;

CREATE TABLE public.caption_votes(id bigint PRIMARY KEY,caption_id uuid,profile_id uuid,vote_value integer);
CREATE UNIQUE INDEX caption_votes_user_caption_unique ON public.caption_votes(profile_id,caption_id);
CREATE TABLE public.captions(id uuid PRIMARY KEY,caption_request_id bigint);
CREATE TABLE public.study_image_set_image_mappings(id bigint PRIMARY KEY,study_image_set_id bigint);
CREATE TABLE public.ops_run_steps(id uuid PRIMARY KEY,ops_run_id uuid);
\ir ../migrations/20261010170000_add_performance_indexes.sql
\ir ../migrations/20261010170001_cache_image_rls_checks.sql

BEGIN;
SET LOCAL ROLE authenticated;
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000001',true,false,'after admin');
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000002',false,false,'after owner');
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000003',false,false,'after other');
SELECT public.test_image_actor('00000000-0000-0000-0000-000000000002',false,true,'after signed-in anonymous');
SELECT public.test_image_actor(NULL,false,false,'after missing uid');
SET LOCAL ROLE anon;
SELECT public.test_anon_images('after anon');
ROLLBACK;
SELECT public.performance_assert((SELECT count(*) FROM public.images)=36,'all write probes rolled back');
SELECT public.performance_assert((SELECT count(*) FROM pg_index WHERE indexrelid IN
 ('public.caption_votes_caption_id_id_idx'::regclass,'public.captions_caption_request_id_idx'::regclass,
  'public.study_image_set_image_mappings_set_id_idx'::regclass,'public.ops_run_steps_ops_run_id_idx'::regclass)
 AND indisvalid AND indisready)=4,'all four indexes are valid');
SELECT public.performance_assert(to_regclass('public.caption_votes_user_caption_unique') IS NOT NULL,
 'vote uniqueness index preserved');
SELECT '1,522 image access checks and four index migrations passed' AS result;
