-- Only row-independent checks are cached. Roles, commands, and access rules
-- retain their existing meanings, including SQL NULL behavior.
ALTER POLICY "Own images + common use + public view" ON public.images
  USING (
    profile_id = (SELECT auth.uid())
    OR is_common_use = true
    OR is_public = true
    OR (SELECT public.is_superadmin(auth.uid()))
  );

ALTER POLICY "Authenticated users can upload their own images" ON public.images
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND (
      is_common_use IS FALSE
      OR (is_common_use IS TRUE AND (SELECT public.is_superadmin(auth.uid())))
    )
  );

ALTER POLICY "Own image update + admin update all" ON public.images
  USING (
    profile_id = (SELECT auth.uid())
    OR (SELECT public.is_superadmin(auth.uid()))
  )
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    OR (SELECT public.is_superadmin(auth.uid()))
  );

ALTER POLICY "Own image delete + admin delete all" ON public.images
  USING (
    profile_id = (SELECT auth.uid())
    OR (SELECT public.is_superadmin(auth.uid()))
  );
