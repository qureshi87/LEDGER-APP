-- LEDGER-APP: minimum stock levels
-- Run ONCE in Supabase SQL Editor.

create table if not exists public.product_stock_settings (
  product text primary key,
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  updated_at timestamptz not null default now()
);

alter table public.product_stock_settings enable row level security;

drop policy if exists "ledger stock settings select" on public.product_stock_settings;
create policy "ledger stock settings select"
on public.product_stock_settings for select to anon, authenticated using (true);

drop policy if exists "ledger stock settings insert" on public.product_stock_settings;
create policy "ledger stock settings insert"
on public.product_stock_settings for insert to anon, authenticated with check (true);

drop policy if exists "ledger stock settings update" on public.product_stock_settings;
create policy "ledger stock settings update"
on public.product_stock_settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "ledger stock settings delete" on public.product_stock_settings;
create policy "ledger stock settings delete"
on public.product_stock_settings for delete to anon, authenticated using (true);

alter table public.product_stock_settings replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
    and schemaname='public'
    and tablename='product_stock_settings'
  ) then
    alter publication supabase_realtime add table public.product_stock_settings;
  end if;
end $$;
