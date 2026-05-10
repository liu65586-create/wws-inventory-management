"use client";

import { useMemo, useState } from "react";
import { FixedSizeList as List } from "react-window";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { formatISO, subDays } from "date-fns";

export type SalesRow = {
  sku: string;
  todayQty: number;
  monthSeries: { d: string; q: number }[];
};

function Sparkline({ data }: { data: { d: string; q: number }[] }) {
  const chartData = data.map((x) => ({ name: x.d, q: x.q }));
  return (
    <div style={{ width: 120, height: 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" hide />
          <Tooltip
            formatter={(v: number) => [v, "销量"]}
            labelFormatter={(l) => String(l)}
          />
          <Line type="monotone" dataKey="q" stroke="#2563eb" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SalesTable(props: { rows: SalesRow[] }) {
  const [sortDesc, setSortDesc] = useState(true);
  const sorted = useMemo(() => {
    const r = [...props.rows];
    r.sort((a, b) => (sortDesc ? b.todayQty - a.todayQty : a.todayQty - b.todayQty));
    return r;
  }, [props.rows, sortDesc]);

  if (sorted.length > 100) {
    const Row = ({
      index,
      style,
    }: {
      index: number;
      style: React.CSSProperties;
    }) => {
      const row = sorted[index]!;
      return (
        <div style={style} className="flex items-center border-b border-[hsl(var(--border))] text-sm">
          <div className="w-40 shrink-0 truncate px-2">{row.sku}</div>
          <div className="w-24 shrink-0 px-2">{row.todayQty}</div>
          <div className="min-w-0 flex-1 px-2">
            <Sparkline data={row.monthSeries} />
          </div>
        </div>
      );
    };
    return (
      <div>
        <div className="mb-2 flex gap-2 text-sm">
          <button
            type="button"
            className="underline"
            onClick={() => setSortDesc((s) => !s)}
          >
            按今日销量排序（{sortDesc ? "高→低" : "低→高"}）
          </button>
          <span className="text-muted-foreground">虚拟滚动已启用（{sorted.length} 行）</span>
        </div>
        <div className="rounded border border-[hsl(var(--border))]">
          <div className="flex border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-xs font-medium">
            <div className="w-40 px-2 py-2">SKU</div>
            <div className="w-24 px-2 py-2">今日销量</div>
            <div className="flex-1 px-2 py-2">近30天</div>
          </div>
          <List height={560} itemCount={sorted.length} itemSize={48} width="100%">
            {Row}
          </List>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-[hsl(var(--border))]">
      <div className="mb-2 text-sm">
        <button type="button" className="underline" onClick={() => setSortDesc((s) => !s)}>
          按今日销量排序（{sortDesc ? "高→低" : "低→高"}）
        </button>
      </div>
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-[hsl(var(--muted))] text-xs">
          <tr>
            <th className="px-2 py-2">SKU</th>
            <th className="px-2 py-2">今日销量</th>
            <th className="px-2 py-2">近1个月销量</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.sku} className="border-t border-[hsl(var(--border))]">
              <td className="px-2 py-2 font-medium">{row.sku}</td>
              <td className="px-2 py-2">{row.todayQty}</td>
              <td className="px-2 py-2">
                <Sparkline data={row.monthSeries} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function buildMonthSeries(
  sku: string,
  bySkuDate: Map<string, Map<string, number>>,
  days = 30,
) {
  const end = new Date();
  const series: { d: string; q: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = formatISO(subDays(end, i), { representation: "date" });
    const q = bySkuDate.get(sku)?.get(d) ?? 0;
    series.push({ d, q });
  }
  return series;
}
