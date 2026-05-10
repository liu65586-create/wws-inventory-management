import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSalesWorkbook } from "@/lib/excel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  let rows;
  try {
    rows = parseSalesWorkbook(buffer);
  } catch {
    return NextResponse.json({ error: "Excel 解析失败" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "没有有效数据行：未识别到 SKU 列（如 SKU货号/SKU码）与日期列（如 订单创建时间）。也支持固定列「SKU、销售日期、销量」。订单明细无「销量」列时按每行 1 件汇总到当天。",
      },
      { status: 400 },
    );
  }

  const skuCodes = [...new Set(rows.map((r) => r.sku))];
  const skuRows = skuCodes.map((sku_code) => ({
    sku_code,
    created_by: user?.id ?? null,
  }));

  const { error: skuErr } = await supabase
    .from("sku_master")
    .upsert(skuRows, { onConflict: "sku_code", ignoreDuplicates: false });
  if (skuErr) {
    return NextResponse.json({ error: skuErr.message }, { status: 500 });
  }

  const salesRows = rows.map((r) => ({
    sku_code: r.sku,
    sale_date: r.saleDate,
    quantity: r.quantity,
    source: "upload" as const,
    uploaded_by: user?.id ?? null,
  }));

  const chunk = 300;
  for (let i = 0; i < salesRows.length; i += chunk) {
    const part = salesRows.slice(i, i + chunk);
    const { error } = await supabase
      .from("sales_history")
      .upsert(part, { onConflict: "sku_code,sale_date,source" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (user) {
    await supabase.from("user_activity_logs").insert({
      user_id: user.id,
      action: "upload_sales",
      details: { rows: rows.length },
    });
  }

  return NextResponse.json({ ok: true, imported: rows.length });
}
