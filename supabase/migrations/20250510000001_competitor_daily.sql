-- Daily aggregates per SKU for competitor dashboard charts
create table if not exists public.competitor_sku_daily (
  id serial primary key,
  sku_code text not null references public.sku_master (sku_code) on delete cascade,
  stat_date date not null,
  link_count int not null default 0,
  total_competitor_sales int not null default 0,
  created_at timestamptz not null default now(),
  unique (sku_code, stat_date)
);

create index if not exists idx_competitor_sku_daily_sku on public.competitor_sku_daily (sku_code, stat_date desc);

alter table public.competitor_sku_daily enable row level security;

create policy "competitor_sku_daily_authenticated_all" on public.competitor_sku_daily
  for all to authenticated
  using (true)
  with check (true);
