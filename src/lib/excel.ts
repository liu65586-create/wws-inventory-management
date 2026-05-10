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
  "店铺sku",
  "平台sku",
  "配对sku",
  "原sku",
  "子体msku",
  "子体sku",
  "子asin",
  "msku",
  "fnsku",
  "asin",
  "本地sku",
  "商品sku",
  "系统sku",
  "sku编码",
  "sku",
  "款号",
  "料号",
  "存货编码",
];
/** 不用单独「库存」以免命中「总库存」等汇总列；用更具体的词 */
const INV_AVAIL_HEADER_KEYWORDS = [
  "afn_fulfillable",
  "fulfillable",
  "可用量",
  "可用库存",
  "可售库存",
  "可发数量",
  "可发量",
  "仓内可用",
  "实际可用",
  "良品量",
  "良品",
  "可售",
  "在库",
  "在库量",
  "实际库存",
  "库存数量",
  "fba库存",
  "本地库存",
  "海外仓库存",
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

/** 领星等导出：千分位、中文逗号、空格、「120 PCS」类后缀 */
function parseQuantityCell(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v)
    .trim()
    .replace(/,/g, "")
    .replace(/，/g, "")
    .replace(/\s+/g, "");
  if (!s || s === "-" || s === "--") return NaN;
  const m = s.match(/^[-+]?\d*\.?\d+/);
  if (!m) return NaN;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : NaN;
}

function rowToStringCells(row: unknown[] | undefined): string[] {
  return (row ?? []).map((c) => String(c ?? "").trim());
}

/** 合并表头常见：左侧有字、右侧空，向右沿用上一格文字 */
function forwardFillHeaders(headers: string[]): string[] {
  const out = [...headers];
  let last = "";
  for (let i = 0; i < out.length; i++) {
    if (out[i]) last = out[i];
    else if (last) out[i] = last;
  }
  return out;
}

/** 双行表头：上下拼接后再做关键字匹配 */
function combinedHeaderCells(aoa: unknown[][], topRow: number): string[] {
  const r0 = rowToStringCells(aoa[topRow]);
  const r1 = topRow + 1 < aoa.length ? rowToStringCells(aoa[topRow + 1]) : [];
  const len = Math.max(r0.length, r1.length);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const a = r0[i] ?? "";
    const b = r1[i] ?? "";
    out.push(`${a} ${b}`.trim());
  }
  return out;
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

function parseRowsForHeader(
  aoa: unknown[][],
  dataStartRow: number,
  headerCells: string[],
): ParsedInventoryRow[] {
  const headers = forwardFillHeaders(headerCells);
  const skuPick = pickBestColumnIndex(headers, INV_SKU_HEADER_KEYWORDS);
  const avPick = pickBestColumnIndex(headers, INV_AVAIL_HEADER_KEYWORDS);
  const trPick = pickBestColumnIndex(headers, INV_TRANSIT_HEADER_KEYWORDS);
  if (skuPick.index < 0 || avPick.index < 0) return [];
  if (skuPick.index === avPick.index) return [];
  if (skuPick.score < 15 || avPick.score < 15) return [];

  const out: ParsedInventoryRow[] = [];
  for (let r = dataStartRow; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const sku = cellToString(row[skuPick.index]);
    if (!sku) continue;
    const available = parseQuantityCell(row[avPick.index]);
    if (!Number.isFinite(available)) continue;
    let inTransit = 0;
    if (trPick.index >= 0 && trPick.score >= 15 && trPick.index !== avPick.index) {
      const tr = parseQuantityCell(row[trPick.index]);
      if (Number.isFinite(tr)) inTransit = Math.round(tr);
    }
    out.push({
      sku,
      available: Math.round(available),
      inTransit,
    });
  }
  return out;
}

/** 多行表头 / 合并单元格 / 领星 ProductInventory：多候选表头行取解析行数最多者 */
function parseInventoryFromAoA(aoa: unknown[][]): ParsedInventoryRow[] {
  if (!aoa.length) return [];
  let best: ParsedInventoryRow[] = [];
  const maxHr = Math.min(55, aoa.length);

  for (let hr = 0; hr < maxHr; hr++) {
    const rawRow = rowToStringCells(aoa[hr]);
    if (!rawRow.some(Boolean)) continue;

    const variants: { headers: string[]; dataStart: number }[] = [
      { headers: rawRow, dataStart: hr + 1 },
      { headers: forwardFillHeaders(rawRow), dataStart: hr + 1 },
    ];
    if (hr + 1 < aoa.length) {
      const comb = combinedHeaderCells(aoa, hr);
      if (comb.some(Boolean)) {
        variants.push({ headers: comb, dataStart: hr + 2 });
        variants.push({ headers: forwardFillHeaders(comb), dataStart: hr + 2 });
      }
    }

    for (const v of variants) {
      if (!v.headers.some(Boolean)) continue;
      const rows = parseRowsForHeader(aoa, v.dataStart, v.headers);
      if (rows.length > best.length) best = rows;
    }
  }

  if (best.length) return best;

  const hr = detectInventoryHeaderRowIndex(aoa);
  const fallback = forwardFillHeaders(rowToStringCells(aoa[hr]));
  return parseRowsForHeader(aoa, hr + 1, fallback);
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
      raw: true,
    }) as unknown[][];
    const fromAoA = parseInventoryFromAoA(aoa);
    if (fromAoA.length) return fromAoA;
    const legacy = parseInventoryLegacyJson(sheet);
    if (legacy.length) return legacy;
  }
  return [];
}
