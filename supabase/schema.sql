-- Private per-account storage. Each signed-in user can access only their own row.
create table if not exists public.finance_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"transactions": [], "events": [], "goals": [], "lists": [], "budgets": []}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint finance_data_is_object check (jsonb_typeof(data) = 'object')
);

alter table public.finance_data enable row level security;

drop policy if exists "Users can read their own finance data" on public.finance_data;
create policy "Users can read their own finance data"
  on public.finance_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own finance data" on public.finance_data;
create policy "Users can create their own finance data"
  on public.finance_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own finance data" on public.finance_data;
create policy "Users can update their own finance data"
  on public.finance_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.finance_data from public, anon, authenticated;
grant select, insert, update on public.finance_data to authenticated;
