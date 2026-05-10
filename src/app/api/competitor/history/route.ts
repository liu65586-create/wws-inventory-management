import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.getUser();

  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku");
  const metric = searchParams.get("metric") ?? "sales";
  if (!sku) {
    return NextResponse.json({ error: "缺少 sku" }, { status: 400 });
  }

  if (metric === "links") {
    const { data, error } = await supabase
      .from("competitor_sku_daily")
      .select("stat_date,link_count")
      .eq("sku_code", sku)
      .order("stat_date", { ascending: true })
      .limit(60);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ points: data ?? [] });
  }

  const { data, error } = await supabase
    .from("competitor_sku_daily")
    .select("stat_date,total_competitor_sales")
    .eq("sku_code", sku)
    .order("stat_date", { ascending: true })
    .limit(60);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ points: data ?? [] });
}
