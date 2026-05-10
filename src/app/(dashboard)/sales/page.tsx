"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { formatISO } from "date-fns";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { SalesUploadModal } from "@/components/sales/SalesUploadModal";
import type { HistPoint } from "@/components/sales/SalesOverviewCharts";
import {
  SalesTable,
  buildMonthSeries,
  type SalesRow,
} from "@/components/sales/SalesTable";

const SalesOverviewCharts = dynamic(
  () =>
    import("@/components/sales/SalesOverviewCharts").then((m) => m.SalesOverviewCharts),
  { ssr: false, loading: () => <div className="h-40 text-sm">图表加载中…</div> },
);

async function loadSalesData() {
  const supabase = createClient();
  const { data: skus, error: skuErr } = await supabase
    .from("sku_master")
    .select("sku_code")
    .order("sku_code", { ascending: true });
  if (skuErr) throw new Error(skuErr.message);

  const start = formatISO(
    new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    { representation: "date" },
  );
  const { data: hist, error: histErr } = await supabase
    .from("sales_history")
    .select("sku_code,sale_date,quantity")
    .gte("sale_date", start);
  if (histErr) throw new Error(histErr.message);

  const bySkuDate = new Map<string, Map<string, number>>();
  for (const row of hist ?? []) {
    const sku = String(row.sku_code);
    const d = String(row.sale_date);
    if (!bySkuDate.has(sku)) bySkuDate.set(sku, new Map());
    const m = bySkuDate.get(sku)!;
    m.set(d, (m.get(d) ?? 0) + Number(row.quantity ?? 0));
  }

  const today = formatISO(new Date(), { representation: "date" });
  const skuList = (skus ?? []).map((s) => String(s.sku_code));
  const rows: SalesRow[] = skuList.map((sku) => ({
    sku,
    todayQty: bySkuDate.get(sku)?.get(today) ?? 0,
    monthSeries: buildMonthSeries(sku, bySkuDate, 30),
  }));

  const dates = [...new Set((hist ?? []).map((h) => String(h.sale_date)))].sort();
  const historyPoints = dates.map((date) => {
    const point: HistPoint = { date };
    for (const sku of skuList) {
      point[sku] = bySkuDate.get(sku)?.get(date) ?? 0;
    }
    return point;
  });

  return {
    rows,
    skuKeys: skuList,
    history: historyPoints,
    today,
    bySkuDate,
  };
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["SKU", "销售日期", "销量"],
    ["DEMO-SKU-001", "2026-05-01", 12],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "销量");
  XLSX.writeFile(wb, "sales_template.xlsx");
}

export default function SalesPage() {
  const q = useQuery({
    queryKey: ["sales-dashboard"],
    queryFn: loadSalesData,
  });

  const pie = (() => {
    const rows = q.data?.rows ?? [];
    const labels = rows.map((r) => r.sku);
    const values = rows.map((r) => r.todayQty);
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum === 0) {
      return { labels: ["暂无当日数据"], values: [1] };
    }
    return { labels, values };
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">销量</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
          >
            下载模板
          </button>
          <SalesUploadModal onDone={() => void q.refetch()} />
        </div>
      </div>

      {q.isLoading && <p className="text-sm">加载中…</p>}
      {q.error && (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      )}

      {q.data && (
        <>
          <SalesOverviewCharts
            pieLabels={pie.labels}
            pieValues={pie.values}
            history={q.data.history}
            skuKeys={q.data.skuKeys}
          />
          <SalesTable rows={q.data.rows} />
        </>
      )}
    </div>
  );
}
