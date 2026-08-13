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

-- Notifications / Notes
create table if not exists public.ledger_notifications (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  priority text not null default 'general' check(priority in ('important','warning','general')),
  show_until date null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ledger_notifications enable row level security;
drop policy if exists "ledger notifications select" on public.ledger_notifications;
create policy "ledger notifications select" on public.ledger_notifications for select to anon,authenticated using(true);
drop policy if exists "ledger notifications insert" on public.ledger_notifications;
create policy "ledger notifications insert" on public.ledger_notifications for insert to anon,authenticated with check(true);
drop policy if exists "ledger notifications update" on public.ledger_notifications;
create policy "ledger notifications update" on public.ledger_notifications for update to anon,authenticated using(true) with check(true);
drop policy if exists "ledger notifications delete" on public.ledger_notifications;
create policy "ledger notifications delete" on public.ledger_notifications for delete to anon,authenticated using(true);
alter table public.ledger_notifications replica identity full;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ledger_notifications')
 then alter publication supabase_realtime add table public.ledger_notifications; end if;
end $$;
