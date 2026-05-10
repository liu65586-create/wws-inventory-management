"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

async function loadCompetitor() {
  const supabase = createClient();
  const { data: skus } = await supabase.from("sku_master").select("sku_code").order("sku_code");
  const skuList = (skus ?? []).map((s) => String(s.sku_code));
  const { data: links } = await supabase.from("competitor_links").select("*");
  const { data: daily } = await supabase.from("competitor_sku_daily").select("*").order("stat_date");

  const bySkuLinks = new Map<string, typeof links>();
  for (const l of links ?? []) {
    const k = String(l.sku_code);
    if (!bySkuLinks.has(k)) bySkuLinks.set(k, []);
    bySkuLinks.get(k)!.push(l);
  }

  const bySkuDaily = new Map<string, typeof daily>();
  for (const d of daily ?? []) {
    const k = String(d.sku_code);
    if (!bySkuDaily.has(k)) bySkuDaily.set(k, []);
    bySkuDaily.get(k)!.push(d);
  }

  return { skuList, links: links ?? [], bySkuLinks, bySkuDaily };
}

type DailyPoint = {
  stat_date: string;
  link_count: number;
  total_competitor_sales: number;
};

function MiniSeries({
  data,
  k,
}: {
  data: DailyPoint[];
  k: keyof Pick<DailyPoint, "link_count" | "total_competitor_sales">;
}) {
  const chart = data.map((r) => ({
    name: String(r.stat_date),
    v: Number(r[k] ?? 0),
  }));
  return (
    <div className="h-10 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart}>
          <XAxis dataKey="name" hide />
          <Tooltip />
          <Line type="monotone" dataKey="v" stroke="#7c3aed" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistoryModal(props: {
  title: string;
  sku: string;
  metric: "links" | "sales";
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["competitor-history", props.sku, props.metric],
    queryFn: async () => {
      const res = await fetch(
        `/api/competitor/history?sku=${encodeURIComponent(props.sku)}&metric=${props.metric}`,
      );
      const json = (await res.json()) as {
        points?: { stat_date: string; link_count?: number; total_competitor_sales?: number }[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "加载失败");
      return json.points ?? [];
    },
  });

  const data =
    q.data?.map((p) => ({
      name: String(p.stat_date),
      v:
        props.metric === "links"
          ? Number(p.link_count ?? 0)
          : Number(p.total_competitor_sales ?? 0),
    })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-medium">{props.title}</div>
          <button type="button" onClick={props.onClose}>
            关闭
          </button>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="v" stroke="#2563eb" dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function CompetitorPage() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["competitor"], queryFn: loadCompetitor });
  const [skuInput, setSkuInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<
    | null
    | { sku: string; metric: "links" | "sales"; title: string }
  >(null);

  const rows = useMemo(() => {
    const skuList = q.data?.skuList ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return skuList.map((sku) => {
      const ls = q.data?.bySkuLinks.get(sku) ?? [];
      const dailyRows = (q.data?.bySkuDaily.get(sku) ?? []).sort((a, b) =>
        String(a.stat_date).localeCompare(String(b.stat_date)),
      );
      const last = dailyRows[dailyRows.length - 1];
      const totalToday =
        last && String(last.stat_date) === today
          ? Number(last.total_competitor_sales ?? 0)
          : 0;
      return {
        sku,
        linkCount: ls.length,
        todayTotal: totalToday,
        dailyRows: dailyRows.map((d) => ({
          stat_date: String(d.stat_date),
          link_count: Number(d.link_count ?? 0),
          total_competitor_sales: Number(d.total_competitor_sales ?? 0),
        })),
      };
    });
  }, [q.data]);

  async function runCrawl() {
    const sku = skuInput.trim();
    if (!sku) return;
    setBusy(true);
    const res = await fetch("/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skuCode: sku, keyword: keyword.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      alert(j.error ?? "抓取失败");
      return;
    }
    await q.refetch();
    router.push(`/competitor/results?sku=${encodeURIComponent(sku)}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">竞品动态</h1>

      <div className="rounded-lg border border-[hsl(var(--border))] p-4">
        <div className="mb-2 text-sm font-medium">抓取同款（Mock，前 50 条）</div>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-[200px] flex-1 rounded border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
            placeholder="输入 SKU"
            value={skuInput}
            onChange={(e) => setSkuInput(e.target.value)}
          />
          <input
            className="min-w-[200px] flex-1 rounded border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
            placeholder="竞品搜索关键词（预留，以图搜图可后续接入）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void runCrawl()}
            className="rounded bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            {busy ? "抓取中…" : "开始抓取"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          说明：当前为合规演示用的 Mock 数据与占位链接。真实 Temu 抓取需自行评估条款与风险，可替换为 Temu 开放 API。
        </p>
      </div>

      {q.isLoading && <p className="text-sm">加载中…</p>}
      {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}

      <div className="overflow-x-auto rounded border border-[hsl(var(--border))]">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-[hsl(var(--muted))] text-xs">
            <tr>
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2">同款链接数</th>
              <th className="px-2 py-2">当日竞品总销量</th>
              <th className="px-2 py-2">链接数走势</th>
              <th className="px-2 py-2">销量走势</th>
              <th className="px-2 py-2">详情</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="border-t border-[hsl(var(--border))]">
                <td className="px-2 py-2 font-medium">{r.sku}</td>
                <td className="px-2 py-2">{r.linkCount}</td>
                <td className="px-2 py-2">{r.todayTotal}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <MiniSeries data={r.dailyRows} k="link_count" />
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() =>
                        setModal({
                          sku: r.sku,
                          metric: "links",
                          title: `${r.sku} 同款链接数历史`,
                        })
                      }
                    >
                      放大
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <MiniSeries data={r.dailyRows} k="total_competitor_sales" />
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() =>
                        setModal({
                          sku: r.sku,
                          metric: "sales",
                          title: `${r.sku} 竞品销量历史`,
                        })
                      }
                    >
                      放大
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <Link className="underline" href={`/competitor/results?sku=${encodeURIComponent(r.sku)}`}>
                    打开列表
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <HistoryModal
          title={modal.title}
          sku={modal.sku}
          metric={modal.metric}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
