import { NextResponse } from "next/server";
import { subDays, formatISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import type { ReplenishmentRow } from "@/lib/replenishment-types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  await supabase.auth.getUser();

  const { data: cfgRows } = await supabase.from("app_config").select("key,value");
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));

  const shippingDays = Number(cfg.shipping_days ?? 18);
  const shipping = Number.isFinite(shippingDays) ? shippingDays : 18;

  const { data: skus } = await supabase.from("sku_master").select("*");
  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("*")
    .eq("is_active", true)
    .order("id", { ascending: true });

  const start = formatISO(subDays(new Date(), 6), { representation: "date" });
  const { data: sales } = await supabase
    .from("sales_history")
    .select("sku_code,sale_date,quantity")
    .gte("sale_date", start);

  const salesMap = new Map<string, number>();
  for (const s of sales ?? []) {
    const k = String(s.sku_code);
    salesMap.set(k, (salesMap.get(k) ?? 0) + Number(s.quantity ?? 0));
  }

  const { data: inv } = await supabase.from("inventory_snapshots").select("*");

  const latestByKey = new Map<
    string,
    { available: number; in_transit: number; snapshot_date: string }
  >();
  for (const row of inv ?? []) {
    const key = `${row.sku_code}:${row.warehouse_id}`;
    const snap = String(row.snapshot_date);
    const cur = latestByKey.get(key);
    if (!cur || snap >= cur.snapshot_date) {
      latestByKey.set(key, {
        available: Number(row.available_qty ?? 0),
        in_transit: Number(row.in_transit_qty ?? 0),
        snapshot_date: snap,
      });
    }
  }

  const rows: ReplenishmentRow[] = (skus ?? []).map((sku) => {
    const skuCode = String(sku.sku_code);
    const sum7 = salesMap.get(skuCode) ?? 0;
    const avgDaily = sum7 / 7;
    const warehousesQty: Record<string, number> = {};
    let availableTotal = 0;
    let inTransitTotal = 0;
    for (const w of warehouses ?? []) {
      const k = `${skuCode}:${w.id}`;
      const cell = latestByKey.get(k);
      const q = cell?.available ?? 0;
      warehousesQty[String(w.warehouse_name)] = q;
      availableTotal += q;
      inTransitTotal += cell?.in_transit ?? 0;
    }
    const totalInventory = availableTotal + inTransitTotal;
    const availableDays =
      avgDaily > 0 ? availableTotal / avgDaily : availableTotal > 0 ? null : 0;
    const totalDays =
      avgDaily > 0 ? totalInventory / avgDaily : totalInventory > 0 ? null : 0;

    const prep = Number(sku.prep_cycle_days ?? 7);
    const threshold = Number(sku.global_reorder_days ?? 10);

    const safetyNet =
      availableDays === null
        ? null
        : availableDays - shipping - prep;
    const alert =
      safetyNet !== null && Number.isFinite(threshold)
        ? safetyNet < threshold
        : false;

    const suggested =
      avgDaily > 0
        ? Math.ceil(avgDaily * (shipping + prep))
        : 0;

    return {
      sku_code: skuCode,
      avg_daily_7: avgDaily,
      warehouses: warehousesQty,
      available_total: availableTotal,
      in_transit_total: inTransitTotal,
      total_inventory: totalInventory,
      available_days: availableDays,
      total_days: totalDays,
      prep_cycle_days: prep,
      shipping_days: shipping,
      safety_net: safetyNet,
      alert,
      suggested_reorder: suggested,
      reorder_threshold: threshold,
    };
  });

  return NextResponse.json({
    rows,
    warehouses: warehouses ?? [],
    shipping_days: shipping,
  });
}
