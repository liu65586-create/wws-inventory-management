import { NextResponse } from "next/server";
import { addDays, formatISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  skuCode: string;
  keyword?: string;
};

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "无效 JSON" }, { status: 400 });
  }
  const skuCode = body.skuCode?.trim();
  if (!skuCode) {
    return NextResponse.json({ error: "缺少 skuCode" }, { status: 400 });
  }

  await supabase.from("sku_master").upsert(
    { sku_code: skuCode, created_by: user?.id ?? null },
    { onConflict: "sku_code", ignoreDuplicates: false },
  );

  const { data: existing } = await supabase
    .from("competitor_links")
    .select("id,last_crawled_at")
    .eq("sku_code", skuCode)
    .order("last_crawled_at", { ascending: false })
    .limit(1);

  const last = existing?.[0]?.last_crawled_at
    ? new Date(existing[0].last_crawled_at as string)
    : null;
  if (last && Date.now() - last.getTime() < 24 * 60 * 60 * 1000) {
    return NextResponse.json({
      ok: true,
      cached: true,
      message: "24 小时内已抓取，返回缓存提示",
    });
  }

  const seed = hashString(skuCode + (body.keyword ?? ""));
  const now = new Date();
  const links: {
    sku_code: string;
    platform: string;
    competitor_url: string;
    product_title: string;
    first_crawled_at: string;
    last_crawled_at: string;
  }[] = [];

  for (let i = 0; i < 50; i++) {
    const stagger = subDays(now, (seed + i) % 7);
    links.push({
      sku_code: skuCode,
      platform: "temu",
      competitor_url: `https://example.com/temu-mock/${skuCode}/${i + 1}`,
      product_title: `Mock 竞品 ${i + 1}（${body.keyword ?? "同款"}）`,
      first_crawled_at: stagger.toISOString(),
      last_crawled_at: now.toISOString(),
    });
  }

  const { data: upserted, error: upErr } = await supabase
    .from("competitor_links")
    .upsert(links, { onConflict: "sku_code,competitor_url" })
    .select("id");
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const ids = (upserted ?? []).map((r) => r.id as number);
  const salesRows: {
    competitor_link_id: number;
    sale_date: string;
    daily_sales: number;
  }[] = [];

  for (const id of ids) {
    for (let d = 0; d < 7; d++) {
      const day = subDays(now, d);
      const dayStr = formatISO(day, { representation: "date" });
      const daily_sales = ((seed + id + d) % 97) + 3;
      salesRows.push({ competitor_link_id: id, sale_date: dayStr, daily_sales });
    }
  }

  const chunk = 400;
  for (let i = 0; i < salesRows.length; i += chunk) {
    const part = salesRows.slice(i, i + chunk);
    const { error } = await supabase
      .from("competitor_sales_history")
      .upsert(part, { onConflict: "competitor_link_id,sale_date" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: linkRows } = await supabase
    .from("competitor_links")
    .select("id,first_crawled_at")
    .eq("sku_code", skuCode);

  const linkList = linkRows ?? [];
  const linkIds = linkList.map((l) => l.id as number);
  const { data: histRows } =
    linkIds.length > 0
      ? await supabase
          .from("competitor_sales_history")
          .select("competitor_link_id,sale_date,daily_sales")
          .in("competitor_link_id", linkIds)
      : { data: [] as { competitor_link_id: number; sale_date: string; daily_sales: number }[] };

  const salesByDate = new Map<string, number>();
  for (const r of histRows ?? []) {
    const d = String(r.sale_date);
    salesByDate.set(d, (salesByDate.get(d) ?? 0) + Number(r.daily_sales ?? 0));
  }

  for (let i = 0; i < 14; i++) {
    const day = subDays(now, i);
    const dayStr = formatISO(day, { representation: "date" });
    const end = addDays(day, 1);
    const linkCount = linkList.filter(
      (l) => new Date(String(l.first_crawled_at)) <= end,
    ).length;
    const total = salesByDate.get(dayStr) ?? 0;
    await supabase.from("competitor_sku_daily").upsert(
      {
        sku_code: skuCode,
        stat_date: dayStr,
        link_count: linkCount,
        total_competitor_sales: total,
      },
      { onConflict: "sku_code,stat_date" },
    );
  }

  if (user) {
    await supabase.from("user_activity_logs").insert({
      user_id: user.id,
      action: "crawl_competitor",
      details: { skuCode, mock: true },
    });
  }

  return NextResponse.json({ ok: true, links: upserted?.length ?? 50, mock: true });
}
