-- Retire Sidechat tables in both environments after verified local backups.
-- Remove the configured Sidechat input tokens before removing their source table.
-- Comments and posts are dropped together; RESTRICT rejects unreviewed dependencies.
SET LOCAL search_path = pg_catalog, public, extensions;
UPDATE public.humor_flavor_steps
SET llm_user_prompt = replace(replace(replace(replace(llm_user_prompt,
    '${sidechatFromLast6Hours}', 'No sidechat posts found.'),
    '${sidechatFromLast24Hours}', 'No sidechat posts found.'),
    '${sidechatFromLast7Days}', 'No sidechat posts found.'),
    '${sidechatFromLast30Days}', 'No sidechat posts found.'),
  llm_system_prompt = replace(replace(replace(replace(llm_system_prompt,
    '${sidechatFromLast6Hours}', 'No sidechat posts found.'),
    '${sidechatFromLast24Hours}', 'No sidechat posts found.'),
    '${sidechatFromLast7Days}', 'No sidechat posts found.'),
    '${sidechatFromLast30Days}', 'No sidechat posts found.')
WHERE llm_user_prompt LIKE '%' || chr(36) || '{sidechatFromLast%'
   OR llm_system_prompt LIKE '%' || chr(36) || '{sidechatFromLast%';
DO $sidechat_prompt_guard$
BEGIN
  IF EXISTS (SELECT FROM public.humor_flavor_steps
    WHERE llm_user_prompt LIKE '%' || chr(36) || '{sidechatFromLast%'
       OR llm_system_prompt LIKE '%' || chr(36) || '{sidechatFromLast%') THEN
    RAISE EXCEPTION 'Unrecognized Sidechat placeholder remains; aborting removal';
  END IF;
END;
$sidechat_prompt_guard$;
DROP TABLE IF EXISTS public.sidechat_comments, public.sidechat_posts RESTRICT;
NOTIFY pgrst, 'reload schema';
