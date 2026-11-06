alter policy "Superadmins can read auth clients"
  on public.auth_clients
  using (
    coalesce(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) is false
    and (select public.is_superadmin(auth.uid()))
  );

alter policy "Superadmins can create auth clients"
  on public.auth_clients
  with check (
    coalesce(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) is false
    and (select public.is_superadmin(auth.uid()))
  );

alter policy "Superadmins can update auth clients"
  on public.auth_clients
  using (
    coalesce(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) is false
    and (select public.is_superadmin(auth.uid()))
  )
  with check (
    coalesce(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) is false
    and (select public.is_superadmin(auth.uid()))
  );

alter policy "Superadmins can delete auth clients"
  on public.auth_clients
  using (
    coalesce(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) is false
    and (select public.is_superadmin(auth.uid()))
  );

alter policy "Superadmins can read auth tokens"
  on public.auth_tokens
  using (
    coalesce(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) is false
    and (select public.is_superadmin(auth.uid()))
  );
