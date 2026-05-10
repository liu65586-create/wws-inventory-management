-- 开放权限：RLS 对 public（含 anon + authenticated）一律放行；便于内网/演示。
-- 生产环境请勿使用此策略。

-- 业务表：移除旧策略
drop policy if exists "profiles_select_own_or_all" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "app_config_authenticated_all" on public.app_config;
drop policy if exists "sku_master_authenticated_all" on public.sku_master;
drop policy if exists "sales_history_authenticated_all" on public.sales_history;
drop policy if exists "warehouses_authenticated_all" on public.warehouses;
drop policy if exists "inventory_snapshots_authenticated_all" on public.inventory_snapshots;
drop policy if exists "competitor_links_authenticated_all" on public.competitor_links;
drop policy if exists "competitor_sales_authenticated_all" on public.competitor_sales_history;
drop policy if exists "activity_logs_select_own" on public.user_activity_logs;
drop policy if exists "activity_logs_insert" on public.user_activity_logs;
drop policy if exists "sales_rollups_authenticated_all" on public.sales_daily_rollups;
drop policy if exists "competitor_sku_daily_authenticated_all" on public.competitor_sku_daily;

create policy "profiles_open_all" on public.profiles
  for all to public using (true) with check (true);

create policy "app_config_open_all" on public.app_config
  for all to public using (true) with check (true);

create policy "sku_master_open_all" on public.sku_master
  for all to public using (true) with check (true);

create policy "sales_history_open_all" on public.sales_history
  for all to public using (true) with check (true);

create policy "warehouses_open_all" on public.warehouses
  for all to public using (true) with check (true);

create policy "inventory_snapshots_open_all" on public.inventory_snapshots
  for all to public using (true) with check (true);

create policy "competitor_links_open_all" on public.competitor_links
  for all to public using (true) with check (true);

create policy "competitor_sales_open_all" on public.competitor_sales_history
  for all to public using (true) with check (true);

create policy "activity_logs_open_all" on public.user_activity_logs
  for all to public using (true) with check (true);

create policy "sales_rollups_open_all" on public.sales_daily_rollups
  for all to public using (true) with check (true);

create policy "competitor_sku_daily_open_all" on public.competitor_sku_daily
  for all to public using (true) with check (true);

-- Storage：sku-images 桶读写对所有人开放（仅该桶）
drop policy if exists "sku_images_public_read" on storage.objects;
drop policy if exists "sku_images_authenticated_write" on storage.objects;
drop policy if exists "sku_images_authenticated_update" on storage.objects;
drop policy if exists "sku_images_authenticated_delete" on storage.objects;

create policy "sku_images_open_all" on storage.objects
  for all to public
  using (bucket_id = 'sku-images')
  with check (bucket_id = 'sku-images');

-- 确保 API（anon）具备基础权限
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
