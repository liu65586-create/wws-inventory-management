import { NextResponse } from "next/server";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { parseInventoryWorkbook } from "@/lib/excel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const form = await request.formData();
  const file = form.get("file");
  const warehouseIdRaw = form.get("warehouseId");
  const snapshotDateRaw = form.get("snapshotDate");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  const warehouseId = Number(warehouseIdRaw);
  if (!Number.isFinite(warehouseId)) {
    return NextResponse.json({ error: "缺少仓库" }, { status: 400 });
  }

  const snapshotDate =
    typeof snapshotDateRaw === "string" && snapshotDateRaw
      ? snapshotDateRaw.slice(0, 10)
      : formatDate(new Date());

  const buffer = await file.arrayBuffer();
  let rows;
  try {
    rows = parseInventoryWorkbook(buffer);
  } catch {
    return NextResponse.json({ error: "Excel 解析失败" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "没有有效数据行" }, { status: 400 });
  }

  const skuRows = [...new Set(rows.map((r) => r.sku))].map((sku_code) => ({
    sku_code,
    created_by: user?.id ?? null,
  }));
  const { error: skuErr } = await supabase
    .from("sku_master")
    .upsert(skuRows, { onConflict: "sku_code", ignoreDuplicates: false });
  if (skuErr) {
    return NextResponse.json({ error: skuErr.message }, { status: 500 });
  }

  const invRows = rows.map((r) => ({
    sku_code: r.sku,
    warehouse_id: warehouseId,
    available_qty: r.available,
    in_transit_qty: r.inTransit,
    snapshot_date: snapshotDate,
    source: "upload" as const,
  }));

  const { error } = await supabase
    .from("inventory_snapshots")
    .upsert(invRows, {
      onConflict: "sku_code,warehouse_id,snapshot_date,source",
    });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (user) {
    await supabase.from("user_activity_logs").insert({
      user_id: user.id,
      action: "upload_inventory",
      details: { warehouseId, rows: rows.length, snapshotDate },
    });
  }

  return NextResponse.json({ ok: true, imported: rows.length });
}
