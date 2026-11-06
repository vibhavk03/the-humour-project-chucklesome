grant select, insert, update, delete on table public.auth_clients to authenticated;
grant usage, select on sequence public.auth_clients_id_seq to authenticated;

grant select on table public.auth_tokens to authenticated;

alter table public.auth_clients enable row level security;
alter table public.auth_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_clients'
      and policyname = 'Superadmins can read auth clients'
  ) then
    create policy "Superadmins can read auth clients"
      on public.auth_clients
      for select
      to authenticated
      using ((select public.is_superadmin(auth.uid())));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_clients'
      and policyname = 'Superadmins can create auth clients'
  ) then
    create policy "Superadmins can create auth clients"
      on public.auth_clients
      for insert
      to authenticated
      with check ((select public.is_superadmin(auth.uid())));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_clients'
      and policyname = 'Superadmins can update auth clients'
  ) then
    create policy "Superadmins can update auth clients"
      on public.auth_clients
      for update
      to authenticated
      using ((select public.is_superadmin(auth.uid())))
      with check ((select public.is_superadmin(auth.uid())));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_clients'
      and policyname = 'Superadmins can delete auth clients'
  ) then
    create policy "Superadmins can delete auth clients"
      on public.auth_clients
      for delete
      to authenticated
      using ((select public.is_superadmin(auth.uid())));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_tokens'
      and policyname = 'Superadmins can read auth tokens'
  ) then
    create policy "Superadmins can read auth tokens"
      on public.auth_tokens
      for select
      to authenticated
      using ((select public.is_superadmin(auth.uid())));
  end if;
end $$;
