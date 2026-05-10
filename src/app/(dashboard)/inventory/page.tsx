"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatISO } from "date-fns";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type Warehouse = { id: number; warehouse_name: string; is_active: boolean };
type Sku = { sku_code: string; image_url: string | null };

async function loadInventory() {
  const supabase = createClient();
  const [{ data: warehouses }, { data: skus }, { data: inv }] = await Promise.all([
    supabase.from("warehouses").select("*").order("id", { ascending: true }),
    supabase.from("sku_master").select("sku_code,image_url").order("sku_code"),
    supabase.from("inventory_snapshots").select("*"),
  ]);
  return {
    warehouses: (warehouses ?? []) as Warehouse[],
    skus: (skus ?? []) as Sku[],
    inv: inv ?? [],
  };
}

function latestSnapshot(
  inv: { sku_code: string; warehouse_id: number; available_qty: number; in_transit_qty: number; snapshot_date: string }[],
  sku: string,
  wid: number,
) {
  let best: (typeof inv)[number] | null = null;
  for (const row of inv) {
    if (String(row.sku_code) !== sku || Number(row.warehouse_id) !== wid) continue;
    if (!best || String(row.snapshot_date) >= String(best.snapshot_date)) best = row;
  }
  return best;
}

function WarehouseModal(props: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!props.open) return null;

  async function addWh() {
    if (!name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("warehouses").insert({
      warehouse_name: name.trim(),
      is_active: true,
      api_config: {},
    });
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setName("");
    await qc.invalidateQueries({ queryKey: ["inventory"] });
    props.onSaved();
    props.onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-medium">添加仓库</div>
          <button type="button" onClick={props.onClose}>
            关闭
          </button>
        </div>
        <input
          className="mb-3 w-full rounded border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
          placeholder="仓库名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void addWh()}
          className="rounded bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          保存
        </button>
      </div>
    </div>
  );
}

function InventoryUploadModal(props: {
  warehouses: Warehouse[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [wid, setWid] = useState<number>(props.warehouses[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("warehouseId", String(wid));
    fd.append("snapshotDate", formatDate(new Date()));
    const res = await fetch("/api/upload/inventory", { method: "POST", body: fd });
    const json = (await res.json()) as { ok?: boolean; error?: string; imported?: number };
    setBusy(false);
    e.target.value = "";
    if (!res.ok) {
      setMsg(json.error ?? "上传失败");
      return;
    }
    setMsg(`已导入 ${json.imported ?? 0} 行`);
    props.onDone();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
      >
        上传库存 Excel
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium">上传库存</div>
              <button type="button" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
            <label className="mb-2 block text-sm">
              选择仓库
              <select
                className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-2"
                value={wid}
                onChange={(e) => setWid(Number(e.target.value))}
              >
                {props.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.warehouse_name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              列：SKU、可用库存、在途库存（可选）。日期默认当天。
            </p>
            <label className="block cursor-pointer rounded border border-dashed border-[hsl(var(--border))] px-3 py-6 text-center text-sm">
              {busy ? "处理中…" : "选择 Excel"}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void onFile(e)} />
            </label>
            {msg && <p className="mt-2 text-sm">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inventory"], queryFn: loadInventory });
  const [whOpen, setWhOpen] = useState(false);

  const rows = useMemo(() => {
    const data = q.data;
    if (!data) return [];
    return data.skus.map((s) => {
      const perWh: Record<number, { av: number; tr: number }> = {};
      for (const w of data.warehouses) {
        const snap = latestSnapshot(data.inv as never, s.sku_code, w.id);
        perWh[w.id] = {
          av: snap ? Number(snap.available_qty) : 0,
          tr: snap ? Number(snap.in_transit_qty) : 0,
        };
      }
      const sellable = Object.values(perWh).reduce((a, x) => a + x.av, 0);
      const transit = Object.values(perWh).reduce((a, x) => a + x.tr, 0);
      return { sku: s.sku_code, image_url: s.image_url, perWh, sellable, transit, total: sellable + transit };
    });
  }, [q.data]);

  async function uploadSkuImage(sku: string, file: File) {
    const supabase = createClient();
    const path = `${sku}/${formatISO(new Date(), { representation: "date" })}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("sku-images").upload(path, file, {
      upsert: true,
    });
    if (upErr) {
      alert(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("sku-images").getPublicUrl(path);
    const { error } = await supabase
      .from("sku_master")
      .update({ image_url: pub.publicUrl })
      .eq("sku_code", sku);
    if (error) {
      alert(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["inventory"] });
  }

  function downloadInvTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["SKU", "可用库存", "在途库存"],
      ["DEMO-SKU-001", 120, 30],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "库存");
    XLSX.writeFile(wb, "inventory_template.xlsx");
  }

  const warehouses = q.data?.warehouses ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">库存</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWhOpen(true)}
            className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
          >
            仓库配置
          </button>
          <button
            type="button"
            onClick={downloadInvTemplate}
            className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
          >
            下载模板
          </button>
          <InventoryUploadModal warehouses={warehouses} onDone={() => void q.refetch()} />
        </div>
      </div>

      <WarehouseModal
        open={whOpen}
        onClose={() => setWhOpen(false)}
        onSaved={() => void q.refetch()}
      />

      {q.isLoading && <p className="text-sm">加载中…</p>}
      {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}

      <div className="overflow-x-auto rounded border border-[hsl(var(--border))]">
        <table className="min-w-[720px] w-full border-collapse text-sm">
          <thead className="bg-[hsl(var(--muted))] text-xs">
            <tr>
              <th className="sticky left-0 z-10 bg-[hsl(var(--muted))] px-2 py-2 text-left">SKU</th>
              <th className="px-2 py-2 text-left">图片</th>
              {warehouses.map((w) => (
                <th key={w.id} className="whitespace-nowrap px-2 py-2 text-left">
                  {w.warehouse_name}
                  <div className="text-[10px] font-normal text-muted-foreground">可售</div>
                </th>
              ))}
              <th className="px-2 py-2 text-left">可售总库存</th>
              <th className="px-2 py-2 text-left">在途</th>
              <th className="px-2 py-2 text-left">总库存</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="border-t border-[hsl(var(--border))]">
                <td className="sticky left-0 z-10 bg-[hsl(var(--background))] px-2 py-2 font-medium">
                  {r.sku}
                </td>
                <td className="px-2 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    {r.image_url ? (
                      <Image
                        src={r.image_url}
                        alt={r.sku}
                        width={40}
                        height={40}
                        className="rounded border border-[hsl(var(--border))] object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-[hsl(var(--border))] text-[10px]">
                        无
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadSkuImage(r.sku, f);
                      }}
                    />
                  </label>
                </td>
                {warehouses.map((w) => (
                  <td key={w.id} className="whitespace-nowrap px-2 py-2">
                    {r.perWh[w.id]?.av ?? 0}
                  </td>
                ))}
                <td className="px-2 py-2">{r.sellable}</td>
                <td className="px-2 py-2">{r.transit}</td>
                <td className="px-2 py-2">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
