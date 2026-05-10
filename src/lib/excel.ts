import * as XLSX from "xlsx";

export type ParsedSalesRow = {
  sku: string;
  saleDate: string;
  quantity: number;
};

export type ParsedInventoryRow = {
  sku: string;
  available: number;
  inTransit: number;
};

/** 表头关键字（越长/越具体的放前面，避免「SKU」误匹配到「MSKU」的子串逻辑时优先长词） */
const INV_SKU_HEADER_KEYWORDS = [
  "seller sku",
  "sellersku",
  "seller_sku",
  "子体msku",
  "子体sku",
  "msku",
  "fnsku",
  "本地sku",
  "商品sku",
  "系统sku",
  "sku编码",
  "sku",
  "款号",
  "料号",
  "存货编码",
];
const INV_AVAIL_HEADER_KEYWORDS = [
  "afn_fulfillable",
  "fulfillable",
  "可用量",
  "可用库存",
  "可售库存",
  "实际可用",
  "良品量",
  "良品",
  "可用",
  "实际库存",
  "库存数量",
  "库存",
  "available",
  "quantity on hand",
  "qty",
];
const INV_TRANSIT_HEADER_KEYWORDS = [
  "调拨在途",
  "采购在途",
  "标发在途",
  "计划入库",
  "待到货",
  "在途量",
  "在途",
  "inbound",
  "in_transit",
  "on the way",
];

function normHeader(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function headerMatchScore(header: string, keywords: string[]): number {
  const h = normHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const kw of keywords) {
    const k = normHeader(kw);
    if (!k) continue;
    if (h === k) best = Math.max(best, 100 + k.length);
    else if (h.includes(k) || k.includes(h)) best = Math.max(best, 50 + k.length);
  }
  return best;
}

function pickBestColumnIndex(
  headers: string[],
  keywords: string[],
): { index: number; score: number } {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < headers.length; i++) {
    const sc = headerMatchScore(headers[i] ?? "", keywords);
    if (sc > bestScore) {
      bestScore = sc;
      bestIdx = i;
    }
  }
  return { index: bestIdx, score: bestScore };
}

/** 在前若干行里找最像表头的一行（领星等导出常有标题行） */
function detectInventoryHeaderRowIndex(aoa: unknown[][]): number {
  let bestR = 0;
  let bestScore = -1;
  const scan = Math.min(40, aoa.length);
  for (let r = 0; r < scan; r++) {
    const row = (aoa[r] ?? []).map((c) => String(c ?? "").trim());
    if (!row.some(Boolean)) continue;
    let rowScore = 0;
    for (const h of row) {
      rowScore += headerMatchScore(h, INV_SKU_HEADER_KEYWORDS);
      rowScore += headerMatchScore(h, INV_AVAIL_HEADER_KEYWORDS);
      rowScore += headerMatchScore(h, INV_TRANSIT_HEADER_KEYWORDS);
    }
    if (rowScore > bestScore) {
      bestScore = rowScore;
      bestR = r;
    }
  }
  return bestR;
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function parseExcelDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const js = new Date(Date.UTC(d.y, d.m - 1, d.d));
    return js.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export function parseSalesWorkbook(buffer: ArrayBuffer): ParsedSalesRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const out: ParsedSalesRow[] = [];
  for (const row of rows) {
    const sku =
      cellToString(row["SKU"] ?? row["sku"] ?? row["Sku"]) || "";
    const dateRaw = row["销售日期"] ?? row["日期"] ?? row["sale_date"] ?? row["Date"];
    const qtyRaw = row["销量"] ?? row["quantity"] ?? row["Quantity"];
    if (!sku) continue;
    const saleDate = parseExcelDate(dateRaw);
    const quantity = Number(qtyRaw);
    if (!saleDate || !Number.isFinite(quantity)) continue;
    out.push({ sku, saleDate, quantity: Math.round(quantity) });
  }
  return out;
}

function parseInventoryFromAoA(aoa: unknown[][]): ParsedInventoryRow[] {
  if (!aoa.length) return [];
  const hr = detectInventoryHeaderRowIndex(aoa);
  const headerRow = (aoa[hr] ?? []).map((c) => String(c ?? "").trim());
  const skuPick = pickBestColumnIndex(headerRow, INV_SKU_HEADER_KEYWORDS);
  const avPick = pickBestColumnIndex(headerRow, INV_AVAIL_HEADER_KEYWORDS);
  const trPick = pickBestColumnIndex(headerRow, INV_TRANSIT_HEADER_KEYWORDS);

  const out: ParsedInventoryRow[] = [];
  // 分数阈值略低，兼容表头略写、合并单元格导出等
  if (skuPick.index >= 0 && avPick.index >= 0 && skuPick.score >= 25 && avPick.score >= 25) {
    for (let r = hr + 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const sku = cellToString(row[skuPick.index]);
      if (!sku) continue;
      const avRaw = row[avPick.index];
      const available = Number(avRaw);
      if (!Number.isFinite(available)) continue;
      let inTransit = 0;
      if (trPick.index >= 0 && trPick.score >= 25) {
        const tr = Number(row[trPick.index]);
        if (Number.isFinite(tr)) inTransit = Math.round(tr);
      }
      out.push({
        sku,
        available: Math.round(available),
        inTransit,
      });
    }
    if (out.length) return out;
  }

  return [];
}

/** 兼容「首行即表头 + 固定列名」的旧模板 */
function parseInventoryLegacyJson(sheet: import("xlsx").WorkSheet): ParsedInventoryRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const out: ParsedInventoryRow[] = [];
  for (const row of rows) {
    const sku =
      cellToString(row["SKU"] ?? row["sku"] ?? row["Sku"]) || "";
    const av = row["可用库存"] ?? row["available"] ?? row["Available"];
    const it = row["在途库存"] ?? row["在途"] ?? row["in_transit"] ?? 0;
    if (!sku) continue;
    const available = Number(av);
    const inTransit = Number(it);
    if (!Number.isFinite(available)) continue;
    out.push({
      sku,
      available: Math.round(available),
      inTransit: Number.isFinite(inTransit) ? Math.round(inTransit) : 0,
    });
  }
  return out;
}

export function parseInventoryWorkbook(buffer: ArrayBuffer): ParsedInventoryRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const names = wb.SheetNames;
  const ordered = [
    ...names.filter((n) => /库存|inventory|product|仓库|明细|lingxing|领星/i.test(n)),
    ...names.filter((n) => !/库存|inventory|product|仓库|明细|lingxing|领星/i.test(n)),
  ];

  for (const sheetName of ordered) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const fromAoA = parseInventoryFromAoA(aoa);
    if (fromAoA.length) return fromAoA;
    const legacy = parseInventoryLegacyJson(sheet);
    if (legacy.length) return legacy;
  }
  return [];
}
