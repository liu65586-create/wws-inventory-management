"use client";

import { useState } from "react";

export function SalesUploadModal(props: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/sales", { method: "POST", body: fd });
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
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm"
      >
        上传销量 Excel
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium">上传销量</div>
              <button
                type="button"
                className="text-sm"
                onClick={() => setOpen(false)}
              >
                关闭
              </button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              支持固定三列：SKU、销售日期、销量。也支持 Temu/领星<strong>订单明细</strong>导出：自动识别「SKU货号 / SKU
              码」、日期（如「订单创建时间」）；无销量列时按每行 1 件计入当天，同一 SKU
              同一天会自动合并数量。
            </p>
            <label className="block cursor-pointer rounded border border-dashed border-[hsl(var(--border))] px-3 py-6 text-center text-sm">
              {busy ? "处理中…" : "选择 Excel 文件"}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void onFile(e)} />
            </label>
            {msg && <p className="mt-2 text-sm">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}
