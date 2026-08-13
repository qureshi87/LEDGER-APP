-- =========================================================
-- LEDGER-APP
-- CUSTOM MINIMUM STOCK LEVELS
-- Run this ONCE in Supabase SQL Editor.
-- =========================================================

create table if not exists public.product_stock_settings (
  product text primary key,
  minimum_stock integer not null default 0
    check (minimum_stock >= 0),
  updated_at timestamptz not null default now()
);

alter table public.product_stock_settings enable row level security;

-- If your app is an internal/private ledger and the publishable
-- key is used directly from the browser, allow authenticated
-- users to read/write these settings.
--
-- If your current ledger_entries policies use anon instead,
-- change "authenticated" to "anon" to match your existing setup.

drop policy if exists "stock settings select" on public.product_stock_settings;
create policy "stock settings select"
on public.product_stock_settings
for select
to authenticated
using (true);

drop policy if exists "stock settings insert" on public.product_stock_settings;
create policy "stock settings insert"
on public.product_stock_settings
for insert
to authenticated
with check (true);

drop policy if exists "stock settings update" on public.product_stock_settings;
create policy "stock settings update"
on public.product_stock_settings
for update
to authenticated
using (true)
with check (true);

-- Optional: enable realtime for stock-level changes.
alter table public.product_stock_settings replica identity full;

-- Add it to the realtime publication if it is not already there.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_stock_settings'
  ) then
    alter publication supabase_realtime
      add table public.product_stock_settings;
  end if;
end $$;
