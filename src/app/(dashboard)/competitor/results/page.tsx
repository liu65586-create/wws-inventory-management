"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

async function loadResults(sku: string) {
  const supabase = createClient();
  const { data: links, error } = await supabase
    .from("competitor_links")
    .select("*")
    .eq("sku_code", sku)
    .order("id", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  const ids = (links ?? []).map((l) => l.id);
  const { data: hist } =
    ids.length > 0
      ? await supabase
          .from("competitor_sales_history")
          .select("*")
          .in("competitor_link_id", ids)
          .order("sale_date", { ascending: true })
      : { data: [] as { competitor_link_id: number; sale_date: string; daily_sales: number }[] };

  const byLink = new Map<number, { sale_date: string; daily_sales: number }[]>();
  for (const h of hist ?? []) {
    const id = Number(h.competitor_link_id);
    if (!byLink.has(id)) byLink.set(id, []);
    byLink.get(id)!.push({
      sale_date: String(h.sale_date),
      daily_sales: Number(h.daily_sales ?? 0),
    });
  }
  return { links: links ?? [], byLink };
}

function LinkSpark({ rows }: { rows: { sale_date: string; daily_sales: number }[] }) {
  const data = rows.map((r) => ({ name: r.sale_date, q: r.daily_sales }));
  return (
    <div className="h-12 w-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="name" hide />
          <Tooltip />
          <Line type="monotone" dataKey="q" stroke="#16a34a" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompetitorResultsContent() {
  const sp = useSearchParams();
  const sku = sp.get("sku") ?? "";
  const q = useQuery({
    queryKey: ["competitor-results", sku],
    queryFn: () => loadResults(sku),
    enabled: Boolean(sku),
  });

  if (!sku) {
    return <p className="text-sm">缺少 sku 参数</p>;
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">竞品结果：{sku}</h1>
      {q.isLoading && <p className="text-sm">加载中…</p>}
      {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}
      <div className="overflow-x-auto rounded border border-[hsl(var(--border))]">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-[hsl(var(--muted))] text-xs">
            <tr>
              <th className="px-2 py-2">标题</th>
              <th className="px-2 py-2">链接</th>
              <th className="px-2 py-2">今日销量</th>
              <th className="px-2 py-2">近7天</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.links ?? []).map((l) => {
              const series = q.data?.byLink.get(Number(l.id)) ?? [];
              const today = new Date().toISOString().slice(0, 10);
              const todayQty = series.find((x) => x.sale_date === today)?.daily_sales ?? 0;
              return (
                <tr key={l.id} className="border-t border-[hsl(var(--border))]">
                  <td className="max-w-[220px] truncate px-2 py-2">{String(l.product_title)}</td>
                  <td className="max-w-[260px] truncate px-2 py-2">
                    <a className="text-blue-600 underline" href={String(l.competitor_url)} target="_blank" rel="noreferrer">
                      {String(l.competitor_url)}
                    </a>
                  </td>
                  <td className="px-2 py-2">{todayQty}</td>
                  <td className="px-2 py-2">
                    <LinkSpark rows={series} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CompetitorResultsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">加载中…</p>}>
      <CompetitorResultsContent />
    </Suspense>
  );
}
