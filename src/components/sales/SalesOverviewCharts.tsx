"use client";

import {
  ArcElement,
  BarElement,
  BarController,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Tooltip,
  Filler,
} from "chart.js";
import { useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { subDays, formatISO } from "date-fns";

ChartJS.register(
  ArcElement,
  BarElement,
  BarController,
  CategoryScale,
  Legend,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Tooltip,
  Filler,
);

/** `date` 为横轴；其余键为 SKU 代码 → 销量（number） */
export type HistPoint = { date: string; [sku: string]: string | number };

export function SalesOverviewCharts(props: {
  pieLabels: string[];
  pieValues: number[];
  history: HistPoint[];
  skuKeys: string[];
}) {
  const { pieLabels, pieValues, history, skuKeys } = props;
  const [mode, setMode] = useState<"stack" | "line">("stack");
  const [days, setDays] = useState(30);

  const end = new Date();
  const start = subDays(end, days - 1);
  const startStr = formatISO(start, { representation: "date" });

  const filtered = useMemo(
    () => history.filter((h) => h.date >= startStr),
    [history, startStr],
  );

  const labels = filtered.map((h) => h.date);
  const palette = [
    "#2563eb",
    "#16a34a",
    "#db2777",
    "#ca8a04",
    "#7c3aed",
    "#0d9488",
    "#ea580c",
    "#4f46e5",
  ];

  const topSkus = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sku of skuKeys) {
      let t = 0;
      for (const row of filtered) {
        t += Number(row[sku] ?? 0);
      }
      totals.set(sku, t);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filtered, skuKeys]);

  const barDatasets = topSkus.map(([sku], idx) => ({
    label: sku,
    data: filtered.map((row) => Number(row[sku] ?? 0)),
    backgroundColor: palette[idx % palette.length],
    stack: "a",
  }));

  const lineDatasets = topSkus.map(([sku], idx) => ({
    label: sku,
    data: filtered.map((row) => Number(row[sku] ?? 0)),
    borderColor: palette[idx % palette.length],
    backgroundColor: `${palette[idx % palette.length]}22`,
    fill: true,
    tension: 0.25,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-[hsl(var(--border))] p-4 lg:col-span-1">
        <div className="mb-2 text-sm font-medium">SKU 销量占比（当日）</div>
        <div className="h-64">
          <Doughnut
            data={{
              labels: pieLabels,
              datasets: [
                {
                  data: pieValues,
                  backgroundColor: pieLabels.map(
                    (_, i) => palette[i % palette.length],
                  ),
                },
              ],
            }}
            options={{
              plugins: { legend: { position: "bottom" } },
              maintainAspectRatio: false,
            }}
          />
        </div>
      </div>
      <div className="rounded-lg border border-[hsl(var(--border))] p-4 lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">销量历史</div>
          <select
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>近 7 天</option>
            <option value={14}>近 14 天</option>
            <option value={30}>近 30 天</option>
            <option value={60}>近 60 天</option>
          </select>
          <select
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as "stack" | "line")}
          >
            <option value="stack">堆叠柱状</option>
            <option value="line">折线（Top10）</option>
          </select>
        </div>
        <div className="h-72">
          {mode === "stack" ? (
            <Bar
              data={{ labels, datasets: barDatasets }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true } },
              }}
            />
          ) : (
            <Line
              data={{ labels, datasets: lineDatasets }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: {}, y: {} },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
