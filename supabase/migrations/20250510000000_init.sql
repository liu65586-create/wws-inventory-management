-- WWS Inventory: initial schema + RLS (shared data for all authenticated users)

create extension if not exists "pgcrypto";

-- 1. profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

-- 8. app_config (global defaults; extensible)
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value)
values
  ('shipping_days', '18'::jsonb),
  ('safety_warning_threshold_days', '10'::jsonb),
  ('default_lead_time_days', '7'::jsonb)
on conflict (key) do nothing;

-- 2. sku_master
create table if not exists public.sku_master (
  id serial primary key,
  sku_code text not null unique,
  image_url text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  global_lead_time_days int not null default 18,
  global_reorder_days int not null default 10,
  prep_cycle_days int not null default 7
);

-- 3. sales_history
create table if not exists public.sales_history (
  id serial primary key,
  sku_code text not null references public.sku_master (sku_code) on delete cascade,
  sale_date date not null,
  quantity int not null,
  source text not null default 'upload',
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (sku_code, sale_date, source)
);

-- 4. warehouses
create table if not exists public.warehouses (
  id serial primary key,
  warehouse_name text not null,
  api_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. inventory_snapshots
create table if not exists public.inventory_snapshots (
  id serial primary key,
  sku_code text not null references public.sku_master (sku_code) on delete cascade,
  warehouse_id int not null references public.warehouses (id) on delete cascade,
  available_qty int not null default 0,
  in_transit_qty int not null default 0,
  snapshot_date date not null,
  source text not null default 'upload',
  created_at timestamptz not null default now(),
  unique (sku_code, warehouse_id, snapshot_date, source)
);

-- 6. competitor_links
create table if not exists public.competitor_links (
  id serial primary key,
  sku_code text not null references public.sku_master (sku_code) on delete cascade,
  platform text not null default 'temu',
  competitor_url text not null,
  product_title text,
  first_crawled_at timestamptz not null default now(),
  last_crawled_at timestamptz not null default now(),
  unique (sku_code, competitor_url)
);

-- 7. competitor_sales_history
create table if not exists public.competitor_sales_history (
  id serial primary key,
  competitor_link_id int not null references public.competitor_links (id) on delete cascade,
  sale_date date not null,
  daily_sales int not null default 0,
  crawled_at timestamptz not null default now(),
  unique (competitor_link_id, sale_date)
);

-- 8. user_activity_logs
create table if not exists public.user_activity_logs (
  id serial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Optional: pre-aggregated sales curves (stub for nightly jobs)
create table if not exists public.sales_daily_rollups (
  id serial primary key,
  sku_code text not null references public.sku_master (sku_code) on delete cascade,
  rollup_date date not null,
  window_days int not null default 30,
  series jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (sku_code, rollup_date, window_days)
);

-- Indexes
create index if not exists idx_sales_history_sku_date on public.sales_history (sku_code, sale_date desc);
create index if not exists idx_inventory_snapshots_sku_wh on public.inventory_snapshots (sku_code, warehouse_id, snapshot_date desc);
create index if not exists idx_competitor_sales_link on public.competitor_sales_history (competitor_link_id, sale_date desc);

-- Auth: auto profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.app_config enable row level security;
alter table public.sku_master enable row level security;
alter table public.sales_history enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.competitor_links enable row level security;
alter table public.competitor_sales_history enable row level security;
alter table public.user_activity_logs enable row level security;
alter table public.sales_daily_rollups enable row level security;

-- Shared team model: any authenticated user can read/write business tables
create policy "profiles_select_own_or_all" on public.profiles
  for select to authenticated
  using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id);

create policy "app_config_authenticated_all" on public.app_config
  for all to authenticated
  using (true)
  with check (true);

create policy "sku_master_authenticated_all" on public.sku_master
  for all to authenticated
  using (true)
  with check (true);

create policy "sales_history_authenticated_all" on public.sales_history
  for all to authenticated
  using (true)
  with check (true);

create policy "warehouses_authenticated_all" on public.warehouses
  for all to authenticated
  using (true)
  with check (true);

create policy "inventory_snapshots_authenticated_all" on public.inventory_snapshots
  for all to authenticated
  using (true)
  with check (true);

create policy "competitor_links_authenticated_all" on public.competitor_links
  for all to authenticated
  using (true)
  with check (true);

create policy "competitor_sales_authenticated_all" on public.competitor_sales_history
  for all to authenticated
  using (true)
  with check (true);

create policy "activity_logs_select_own" on public.user_activity_logs
  for select to authenticated
  using (true);

create policy "activity_logs_insert" on public.user_activity_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "sales_rollups_authenticated_all" on public.sales_daily_rollups
  for all to authenticated
  using (true)
  with check (true);

-- Storage bucket for SKU images (run in Supabase SQL if storage API preferred)
insert into storage.buckets (id, name, public)
values ('sku-images', 'sku-images', true)
on conflict (id) do nothing;

create policy "sku_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'sku-images');

create policy "sku_images_authenticated_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sku-images');

create policy "sku_images_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'sku-images');

create policy "sku_images_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sku-images');
