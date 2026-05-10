"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Warehouse = {
  id: number;
  warehouse_name: string;
  api_config: Record<string, unknown>;
  is_active: boolean;
};

async function loadWarehouses() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Warehouse[];
}

export default function InventoryApiSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["warehouses-settings"], queryFn: loadWarehouses });
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  async function saveRow(w: Warehouse) {
    const raw = drafts[w.id] ?? JSON.stringify(w.api_config ?? {}, null, 2);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      alert("JSON 格式不正确");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("warehouses")
      .update({ api_config: parsed })
      .eq("id", w.id);
    if (error) {
      alert(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["warehouses-settings"] });
    await qc.invalidateQueries({ queryKey: ["inventory"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">库存 API 设置（预留）</h1>
      <p className="text-sm text-muted-foreground">
        为每个仓库配置 API 地址、Token、字段映射等 JSON。后续可由服务端定时任务读取并拉取库存。
      </p>
      {q.isLoading && <p className="text-sm">加载中…</p>}
      {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}
      <div className="space-y-4">
        {(q.data ?? []).map((w) => (
          <div key={w.id} className="rounded border border-[hsl(var(--border))] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-medium">
                {w.warehouse_name}{" "}
                <span className="text-xs font-normal text-muted-foreground">#{w.id}</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={w.is_active}
                  onChange={async (e) => {
                    const supabase = createClient();
                    await supabase
                      .from("warehouses")
                      .update({ is_active: e.target.checked })
                      .eq("id", w.id);
                    await qc.invalidateQueries({ queryKey: ["warehouses-settings"] });
                  }}
                />
                启用
              </label>
            </div>
            <textarea
              className="h-40 w-full rounded border border-[hsl(var(--border))] bg-transparent p-2 font-mono text-xs"
              defaultValue={JSON.stringify(w.api_config ?? {}, null, 2)}
              onChange={(e) => setDrafts((d) => ({ ...d, [w.id]: e.target.value }))}
            />
            <button
              type="button"
              className="mt-2 rounded border px-3 py-1 text-sm"
              onClick={() => void saveRow(w)}
            >
              保存 JSON
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
