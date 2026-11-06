-- Run only against the disposable database created by test-caption-jobs-db.sh.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb
$$;
CREATE FUNCTION public.is_superadmin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT $1 = '00000000-0000-0000-0000-000000000001'::uuid
$$;
CREATE TABLE public.humor_flavors(id bigint PRIMARY KEY, slug text);
CREATE TABLE public.caption_generation_jobs (
  id uuid PRIMARY KEY, user_id uuid, client_id text, request jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.caption_generation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.caption_generation_jobs,
  image_id uuid DEFAULT '00000000-0000-0000-0000-000000000010', humor_flavor_id bigint DEFAULT 98,
  caption_request_id bigint DEFAULT 1, llm_prompt_chain_id bigint DEFAULT 1,
  status text DEFAULT 'queued', attempts integer DEFAULT 0,
  steps jsonb DEFAULT '[{"step":{"id":151,"llm_system_prompt":"DO NOT EXPOSE"},"stepType":{"slug":"general"},"model":{"name":"Test model"},"provider":{"name":"Test provider"}}]',
  outputs jsonb DEFAULT '[]', caption_ids uuid[] DEFAULT '{}', error text,
  available_at timestamptz DEFAULT now(), dispatched_at timestamptz, lease_expires_at timestamptz,
  lease_token uuid DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.caption_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caption_generation_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.caption_generation_jobs, public.caption_generation_tasks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.caption_generation_jobs, public.caption_generation_tasks TO service_role;
INSERT INTO public.humor_flavors VALUES (98, 'flavor-test');
INSERT INTO public.caption_generation_jobs(id,client_id,request)
SELECT ('00000000-0000-0000-0001-' || lpad(n::text,12,'0'))::uuid, 'test-client', '{"studyId":5,"topics":"DO NOT EXPOSE"}'
FROM generate_series(1,7) n;
INSERT INTO public.caption_generation_jobs(id,client_id,request,created_at)
VALUES ('00000000-0000-0000-0001-000000000008','old-client','{}',now()-interval '100 days');
INSERT INTO public.caption_generation_tasks(job_id,status,outputs,attempts,lease_expires_at)
SELECT id, CASE right(id::text,1) WHEN '1' THEN 'queued' WHEN '2' THEN 'running' WHEN '3' THEN 'completed'
  WHEN '4' THEN 'failed' WHEN '5' THEN 'completed' ELSE 'queued' END,
  CASE WHEN right(id::text,1) IN ('3','5','7') THEN '["DO NOT EXPOSE"]'::jsonb ELSE '[]'::jsonb END,
  CASE WHEN right(id::text,1) = '6' THEN 2 ELSE 0 END,
  CASE WHEN right(id::text,1) = '2' THEN now()-interval '1 minute' END
FROM public.caption_generation_jobs;
INSERT INTO public.caption_generation_tasks(job_id,status,error)
VALUES ('00000000-0000-0000-0001-000000000005','failed','Provider timed out');

\ir ../migrations/20260922030241_caption_job_observability.sql

CREATE FUNCTION public.test_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', description; END IF; END;
$$;

SELECT public.test_assert(NOT has_function_privilege('anon','public.admin_get_caption_job(uuid)','EXECUTE'), 'anon has no RPC access');
SELECT public.test_assert(NOT has_table_privilege('authenticated','public.caption_generation_tasks','SELECT'), 'raw task access remains denied');
SELECT public.test_assert(NOT has_table_privilege('authenticated','public.caption_generation_tasks','UPDATE'), 'worker mutation access remains denied');
SELECT public.test_assert(has_table_privilege('service_role','public.caption_generation_tasks','UPDATE'), 'worker privileges preserved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002"}',false);
DO $$ BEGIN
  BEGIN PERFORM public.admin_list_caption_jobs(); RAISE EXCEPTION 'nonadmin list allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.admin_get_caption_job('00000000-0000-0000-0001-000000000001'); RAISE EXCEPTION 'nonadmin detail allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","is_anonymous":true}',false);
DO $$ BEGIN
  BEGIN PERFORM public.admin_list_caption_jobs(); RAISE EXCEPTION 'anonymous admin allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.admin_get_caption_job('00000000-0000-0000-0001-000000000001'); RAISE EXCEPTION 'anonymous detail allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{}',false);
DO $$ BEGIN
  BEGIN PERFORM public.admin_list_caption_jobs(); RAISE EXCEPTION 'missing user allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","is_anonymous":false}',false);
SELECT public.test_assert(public.admin_list_caption_jobs()->'counts' = '{"total":7,"queued":1,"running":3,"completed":1,"failed":1,"partially_completed":1}', 'all job statuses, retries, checkpoints and time bounds');
SELECT public.test_assert(public.admin_list_caption_jobs(p_status=>'running')->>'filtered_count' = '3', 'status filter');
SELECT public.test_assert(public.admin_list_caption_jobs(p_status=>'failed')->'counts'->>'total' = '7', 'counts ignore status filter');
SELECT public.test_assert(public.admin_list_caption_jobs(p_search=>'98')->>'filtered_count' = '7', 'flavor ID search');
SELECT public.test_assert(public.admin_list_caption_jobs(p_search=>'FLAVOR-TEST')->>'filtered_count' = '7', 'case insensitive slug search');
SELECT public.test_assert(public.admin_list_caption_jobs(p_search=>'%')->>'filtered_count' = '0', 'search is literal not wildcard');
SELECT public.test_assert(public.admin_list_caption_jobs(p_search=>'00000000-0000-0000-0001-000000000002')->'jobs'->0->>'expired_leases' = '1', 'expired worker lease');
SELECT public.test_assert(jsonb_array_length(public.admin_list_caption_jobs(p_limit=>2,p_offset=>2)->'jobs') = 2, 'pagination');
SELECT public.test_assert(public.admin_list_caption_jobs(p_limit=>2,p_offset=>99)->'jobs' = '[]', 'empty page');
SELECT public.test_assert(public.admin_get_caption_job('00000000-0000-0000-0001-000000000008')->>'client_id' = 'old-client', 'old jobs accessible by direct ID');
SELECT public.test_assert(public.admin_get_caption_job('00000000-0000-0000-0001-000000000099') IS NULL, 'missing job');
SELECT public.test_assert(position('DO NOT EXPOSE' IN public.admin_get_caption_job('00000000-0000-0000-0001-000000000003')::text) = 0, 'no snapshots outputs or request topics leaked');
SELECT public.test_assert(NOT (public.admin_get_caption_job('00000000-0000-0000-0001-000000000003')->'tasks'->0 ? 'lease_token'), 'no worker lease token leaked');
SELECT public.test_assert(public.admin_get_caption_job('00000000-0000-0000-0001-000000000003')->'tasks'->0->'steps'->0->>'model' = 'Test model', 'safe step metadata');
DO $$ BEGIN
  BEGIN PERFORM public.admin_list_caption_jobs(p_limit=>1000); RAISE EXCEPTION 'unbounded limit allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.admin_list_caption_jobs(p_status=>'unknown'); RAISE EXCEPTION 'invalid status allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Caption job observability database checks passed' AS result;
