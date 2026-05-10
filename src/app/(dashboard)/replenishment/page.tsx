"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReplenishmentRow } from "@/lib/replenishment-types";
import { createClient } from "@/lib/supabase/client";

async function loadRepl() {
  const res = await fetch("/api/replenishment");
  const json = (await res.json()) as {
    rows?: ReplenishmentRow[];
    warehouses?: { id: number; warehouse_name: string }[];
    shipping_days?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "加载失败");
  return json;
}

function toCsv(rows: ReplenishmentRow[], wh: { warehouse_name: string }[]) {
  const whNames = wh.map((w) => w.warehouse_name);
  const header = [
    "SKU",
    "近7天日均",
    ...whNames,
    "可售总库存",
    "在途",
    "总库存",
    "可售天数",
    "总库存天数",
    "备货周期",
    "安全净值",
    "建议补货",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.sku_code,
        r.avg_daily_7.toFixed(2),
        ...whNames.map((n) => String(r.warehouses[n] ?? 0)),
        r.available_total,
        r.in_transit_total,
        r.total_inventory,
        r.available_days === null ? "" : r.available_days.toFixed(2),
        r.total_days === null ? "" : r.total_days.toFixed(2),
        r.prep_cycle_days,
        r.safety_net === null ? "" : r.safety_net.toFixed(2),
        r.suggested_reorder,
      ].join(","),
    );
  }
  return lines.join("\n");
}

export default function ReplenishmentPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["replenishment"],
    queryFn: loadRepl,
    refetchInterval: 5 * 60 * 1000,
  });

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<keyof ReplenishmentRow | "sku_code">("sku_code");
  const [sortAsc, setSortAsc] = useState(true);

  const wh = q.data?.warehouses ?? [];

  const rows = useMemo(() => {
    let r = [...(q.data?.rows ?? [])];
    if (filter.trim()) {
      const f = filter.trim().toLowerCase();
      r = r.filter((x) => x.sku_code.toLowerCase().includes(f));
    }
    r.sort((a, b) => {
      const ka = sortKey === "sku_code" ? a.sku_code : a[sortKey];
      const kb = sortKey === "sku_code" ? b.sku_code : b[sortKey];
      if (typeof ka === "number" && typeof kb === "number") {
        return sortAsc ? ka - kb : kb - ka;
      }
      return sortAsc
        ? String(ka).localeCompare(String(kb))
        : String(kb).localeCompare(String(ka));
    });
    return r;
  }, [q.data?.rows, filter, sortKey, sortAsc]);

  async function updateSku(sku: string, patch: { prep_cycle_days?: number; global_reorder_days?: number }) {
    const supabase = createClient();
    const { error } = await supabase.from("sku_master").update(patch).eq("sku_code", sku);
    if (error) alert(error.message);
    await qc.invalidateQueries({ queryKey: ["replenishment"] });
  }

  async function updateShipping(days: number) {
    const supabase = createClient();
    const { error } = await supabase
      .from("app_config")
      .upsert({ key: "shipping_days", value: days }, { onConflict: "key" });
    if (error) alert(error.message);
    await qc.invalidateQueries({ queryKey: ["replenishment"] });
  }

  function exportCsv() {
    const blob = new Blob([toCsv(rows, wh)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "replenishment.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">补货参考</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
          >
            导出补货单 CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-[hsl(var(--border))] p-3 text-sm">
        <label className="block">
          全局海运天数（默认 18）
          <GlobalShippingEditor
            initial={q.data?.shipping_days ?? 18}
            onSave={(d) => void updateShipping(d)}
          />
        </label>
        <label className="block flex-1 min-w-[200px]">
          筛选 SKU
          <input
            className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="包含匹配"
          />
        </label>
      </div>

      {q.isLoading && <p className="text-sm">加载中…</p>}
      {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}

      <div className="overflow-x-auto rounded border border-[hsl(var(--border))]">
        <table className="min-w-[1100px] w-full text-left text-xs">
          <thead className="bg-[hsl(var(--muted))]">
            <tr>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("sku_code")}>
                SKU
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("avg_daily_7")}>
                近7天日均
              </th>
              {wh.map((w) => (
                <th key={w.id} className="px-2 py-2">
                  {w.warehouse_name}
                </th>
              ))}
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("available_total")}>
                可售总库存
              </th>
              <th className="px-2 py-2">在途</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("total_inventory")}>
                总库存
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("available_days")}>
                可售天数
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("total_days")}>
                总库存天数
              </th>
              <th className="px-2 py-2">备货周期</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("safety_net")}>
                安全净值
              </th>
              <th className="px-2 py-2">预警</th>
              <th className="px-2 py-2">建议补货</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku_code} className="border-t border-[hsl(var(--border))]">
                <td className="px-2 py-2 font-medium">{r.sku_code}</td>
                <td className="px-2 py-2">{r.avg_daily_7.toFixed(2)}</td>
                {wh.map((w) => (
                  <td key={w.id} className="px-2 py-2">
                    {r.warehouses[w.warehouse_name] ?? 0}
                  </td>
                ))}
                <td className="px-2 py-2">{r.available_total}</td>
                <td className="px-2 py-2">{r.in_transit_total}</td>
                <td className="px-2 py-2">{r.total_inventory}</td>
                <td className="px-2 py-2">
                  {r.available_days === null ? "—" : r.available_days.toFixed(1)}
                </td>
                <td className="px-2 py-2">
                  {r.total_days === null ? "—" : r.total_days.toFixed(1)}
                </td>
                <td className="px-2 py-2">
                  <input
                    key={`${r.sku_code}-prep-${r.prep_cycle_days}`}
                    className="w-16 rounded border border-[hsl(var(--border))] bg-transparent px-1 py-1"
                    type="number"
                    defaultValue={r.prep_cycle_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0) void updateSku(r.sku_code, { prep_cycle_days: v });
                    }}
                  />
                </td>
                <td
                  className={
                    r.alert ? "bg-red-100 px-2 py-2 text-red-900 dark:bg-red-950 dark:text-red-100" : "px-2 py-2"
                  }
                >
                  {r.safety_net === null ? "—" : r.safety_net.toFixed(1)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span>{r.alert ? "是" : "否"}</span>
                    <input
                      key={`${r.sku_code}-thr-${r.reorder_threshold}`}
                      title="阈值（写入 sku_master.global_reorder_days）"
                      className="w-14 rounded border border-[hsl(var(--border))] bg-transparent px-1 py-1"
                      type="number"
                      defaultValue={r.reorder_threshold}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0) {
                          void updateSku(r.sku_code, { global_reorder_days: v });
                        }
                      }}
                    />
                  </div>
                </td>
                <td className="px-2 py-2">{r.suggested_reorder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        计算：日均 = 近7天总销量 / 7；可售天数 = 可售总库存 / 日均；总库存天数 = 总库存 / 日均；安全净值 = 可售天数 − 海运天数 −
        备货周期；当安全净值小于 SKU 阈值（右侧输入，存于 global_reorder_days）时高亮。建议补货 = ceil(日均 × (海运 + 备货周期))。
      </p>
    </div>
  );
}

function GlobalShippingEditor(props: { initial: number; onSave: (d: number) => void }) {
  const [v, setV] = useState(props.initial);
  useEffect(() => setV(props.initial), [props.initial]);
  return (
    <div className="mt-1 flex gap-2">
      <input
        className="w-24 rounded border border-[hsl(var(--border))] bg-transparent px-2 py-2"
        type="number"
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
      />
      <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => props.onSave(v)}>
        保存
      </button>
    </div>
  );
}
