-- Requires nonchalant migration 011_create_caption_generation_jobs.
-- Admins read a bounded, sanitized projection with their own JWT. Raw task
-- snapshots, intermediate outputs, lease tokens and worker RPCs stay private.
CREATE OR REPLACE FUNCTION public.admin_list_caption_jobs(
  p_since timestamptz DEFAULT now() - interval '7 days',
  p_status text DEFAULT NULL,
  p_search text DEFAULT '',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
  v_search text := btrim(coalesce(p_search, ''));
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    OR public.is_superadmin(auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Superadmin access required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('queued','running','completed','partially_completed','failed') THEN
    RAISE EXCEPTION 'Invalid job status' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset < 0 OR length(v_search) > 200 THEN
    RAISE EXCEPTION 'Invalid pagination or search' USING ERRCODE = '22023';
  END IF;

  WITH summaries AS MATERIALIZED (
    SELECT j.id, j.user_id, j.client_id, j.created_at,
      coalesce(max(t.updated_at), j.created_at) AS updated_at,
      count(t.id)::integer AS task_count,
      count(*) FILTER (WHERE t.status = 'completed')::integer AS completed_tasks,
      count(*) FILTER (WHERE t.status = 'failed')::integer AS failed_tasks,
      coalesce(sum(jsonb_array_length(t.outputs)), 0)::integer AS completed_steps,
      coalesce(sum(jsonb_array_length(t.steps)), 0)::integer AS total_steps,
      coalesce(sum(cardinality(t.caption_ids)), 0)::integer AS caption_count,
      count(*) FILTER (WHERE t.status = 'running' AND t.lease_expires_at <= now())::integer AS expired_leases,
      count(*) FILTER (WHERE t.status = 'queued' AND t.attempts > 0)::integer AS retrying_tasks,
      CASE
        WHEN count(t.id) > 0 AND bool_and(t.status = 'completed') THEN 'completed'
        WHEN count(t.id) > 0 AND bool_and(t.status = 'failed') THEN 'failed'
        WHEN count(t.id) > 0 AND bool_and(t.status IN ('completed','failed')) THEN 'partially_completed'
        WHEN bool_or(t.status <> 'queued' OR jsonb_array_length(t.outputs) > 0 OR t.attempts > 0) THEN 'running'
        ELSE 'queued'
      END AS status
    FROM public.caption_generation_jobs j
    LEFT JOIN public.caption_generation_tasks t ON t.job_id = j.id
    WHERE j.created_at >= greatest(coalesce(p_since, now() - interval '7 days'), now() - interval '90 days')
      AND (v_search = '' OR j.id::text = v_search OR j.user_id::text = v_search
        OR position(lower(v_search) IN lower(coalesce(j.client_id, ''))) > 0
        OR EXISTS (
          SELECT 1 FROM public.caption_generation_tasks searched
          JOIN public.humor_flavors f ON f.id = searched.humor_flavor_id
          WHERE searched.job_id = j.id AND (searched.image_id::text = v_search
            OR searched.humor_flavor_id::text = v_search
            OR position(lower(v_search) IN lower(f.slug)) > 0)
        ))
    GROUP BY j.id
  ), page AS (
    SELECT * FROM summaries WHERE p_status IS NULL OR status = p_status
    ORDER BY created_at DESC, id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'jobs', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC, id DESC) FROM page), '[]'::jsonb),
    'filtered_count', (SELECT count(*) FROM summaries WHERE p_status IS NULL OR status = p_status),
    'counts', (SELECT jsonb_build_object('total', count(*),
      'queued', count(*) FILTER (WHERE status = 'queued'),
      'running', count(*) FILTER (WHERE status = 'running'),
      'completed', count(*) FILTER (WHERE status = 'completed'),
      'partially_completed', count(*) FILTER (WHERE status = 'partially_completed'),
      'failed', count(*) FILTER (WHERE status = 'failed')) FROM summaries)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_caption_job(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    OR public.is_superadmin(auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Superadmin access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'id', j.id, 'user_id', j.user_id, 'client_id', j.client_id, 'created_at', j.created_at,
    'study_id', j.request->'studyId', 'study_image_set_id', j.request->'studyImageSetId',
    'tasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'image_id', t.image_id, 'humor_flavor_id', t.humor_flavor_id,
      'humor_flavor_slug', f.slug,
      'caption_request_id', t.caption_request_id, 'llm_prompt_chain_id', t.llm_prompt_chain_id,
      'status', t.status, 'attempts', t.attempts,
      'completed_steps', jsonb_array_length(t.outputs), 'total_steps', jsonb_array_length(t.steps),
      'caption_ids', t.caption_ids, 'error', t.error,
      'created_at', t.created_at, 'updated_at', t.updated_at,
      'available_at', t.available_at, 'dispatched_at', t.dispatched_at, 'lease_expires_at', t.lease_expires_at,
      'steps', (SELECT jsonb_agg(jsonb_build_object(
        'number', s.ordinality, 'step_id', s.value->'step'->'id',
        'type', s.value->'stepType'->>'slug', 'model', s.value->'model'->>'name',
        'provider', s.value->'provider'->>'name'
      ) ORDER BY s.ordinality) FROM jsonb_array_elements(t.steps) WITH ORDINALITY s)
    ) ORDER BY t.created_at, t.id)
    FROM public.caption_generation_tasks t
    LEFT JOIN public.humor_flavors f ON f.id = t.humor_flavor_id
    WHERE t.job_id = j.id), '[]'::jsonb)
  ) INTO v_result FROM public.caption_generation_jobs j WHERE j.id = p_job_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_caption_jobs(timestamptz,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_caption_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_caption_jobs(timestamptz,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_caption_job(uuid) TO authenticated;

-- Supports the bounded dashboard range without changing worker access.
CREATE INDEX IF NOT EXISTS caption_generation_jobs_created_at_idx
  ON public.caption_generation_jobs (created_at DESC, id DESC);
NOTIFY pgrst, 'reload schema';
