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
  /** 领星 / WMS ProductInventory：Barcode 列常与 SKU 相同，可作编码列 */
  "产品条形码",
  "产品条码",
  "外部条形码",
  "外部条码",
  "其它条码",
  "其他条码",
  "barcode",
  "sku",
  "款号",
  "料号",
  "存货编码",
];
/**
 * 可用量列（导入为「可售库存」数量）。
 * 含领星 ProductInventory：`Total Stock/总库存`、部分可见的 Available 列等。
 * 刻意不包含单独「库存」二字，避免误命中「库存属性」等描述列。
 */
const INV_AVAIL_HEADER_KEYWORDS = [
  "afn_fulfillable",
  "fulfillable",
  "totalstock",
  "总库存",
  "库存总量",
  "库存合计",
  "实际总量",
  "可用量",
  "可用库存",
  "可售库存",
  "可售量",
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
  "availableinventory",
  "availableqty",
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
  "transit",
  "在途",
  "inbound",
  "in_transit",
  "on the way",
];

/** 英中双语表头如 `Total Stock/总库存`：去掉 / 再比较 */
function normHeader(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[/\\：:]/g, "")
    .replace(/[_-]/g, "");
}

function allowInventorySkuHeader(raw: string): boolean {
  const h = normHeader(raw);
  if (!h) return false;
  if (
    /产品名称|productname|仓库|warehouse|库存属性|stockproperty|总库存|totalstock|可用库存|available|锁定|locked|在途|transit|length|width|height|weight|长度|宽度|高度|重量|单位|unit$|gms|wms/.test(
      h,
    )
  ) {
    return false;
  }
  return true;
}

function allowInventoryAvailHeader(raw: string): boolean {
  const h = normHeader(raw);
  if (!h) return false;
  if ((/gms|wms/.test(h) || /length|width|height|weight|长度|宽度|高度|重量/.test(h)) && !/stock|库存|可用|可售|qty/.test(h)) {
    return false;
  }
  if (/产品名称|productname|库存属性|stockproperty/.test(h)) return false;
  if (/^warehouse|仓库$|^仓库[^可]/.test(h) || /^warehouse/.test(h)) return false;
  if (/locked|锁定/.test(h)) return false;
  if ((/barcode|条码/.test(h) || /其它条码|其他条码|外部条码/.test(h)) && !/sku/.test(h)) {
    return false;
  }
  if (/^unit$|^单位$|尺寸单位|重量单位/.test(h)) return false;
  return true;
}

/** 仅把明显为「在途」类的列纳入候选，避免尺寸/重量列误匹配 */
function allowInventoryTransitHeader(raw: string): boolean {
  const h = normHeader(raw);
  if (!h) return false;
  return /transit|在途|inbound|计划入库|待到货|调拨|采购|标发/.test(h);
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
  allowRaw?: (raw: string) => boolean,
): { index: number; score: number } {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < headers.length; i++) {
    const raw = headers[i] ?? "";
    if (allowRaw && !allowRaw(raw)) continue;
    const sc = headerMatchScore(raw, keywords);
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
  const s = String(v)
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

function collectSheetJsonKeys(rows: Record<string, unknown>[]): string[] {
  const s = new Set<string>();
  for (const row of rows.slice(0, 120)) {
    for (const k of Object.keys(row)) {
      if (k.startsWith("__EMPTY")) continue;
      s.add(k);
    }
  }
  return [...s];
}

/** Temu/领星订单明细等：优先「SKU货号」，其次 SKU码；日期用「订单创建时间」等 */
const SALES_SKU_HEADER_KEYWORDS = [
  "sku货号",
  "seller sku",
  "sellersku",
  "sku编码",
  "sku码",
  "msku",
  "fnsku",
  "skuid",
  "sku",
  "款号",
  "存货编码",
];
const SALES_DATE_HEADER_KEYWORDS = [
  "订单创建时间",
  "下单时间",
  "创建时间",
  "订单日期",
  "销售日期",
  "支付时间",
  "付款时间",
  "成交时间",
  "sale date",
  "order date",
  "date",
];
const SALES_QTY_HEADER_KEYWORDS = [
  "销量",
  "销售数量",
  "购买数量",
  "商品数量",
  "数量",
  "件数",
  "quantity",
  "qty",
];

function allowSalesSkuHeader(raw: string): boolean {
  const h = normHeader(raw);
  if (!h) return false;
  if (
    /订单号|子订单|orderno|商品名称|productname|商品属性|spuid|站点|状态|时间|日期|数量|销量|金额|地址|电话|邮编|备注/.test(
      h,
    )
  ) {
    return false;
  }
  return true;
}

function allowSalesDateHeader(raw: string): boolean {
  const h = normHeader(raw);
  if (!h) return false;
  if (/预计送达|实际签收|仓库发货|仓库就绪|发货时间|送达时间|签收时间|就绪时间/.test(h)) return false;
  if (/商品名称|sku|spu|订单号|子订单|属性|站点|数量|销量/.test(h) && !/时间|日期/.test(h)) return false;
  return /时间|日期|time|date/.test(h) || headerMatchScore(raw, SALES_DATE_HEADER_KEYWORDS) >= 40;
}

function allowSalesQtyHeader(raw: string): boolean {
  const h = normHeader(raw);
  if (!h) return false;
  if (/订单号|子订单|时间|日期|名称|属性|站点|状态|sku|spu|金额|地址/.test(h)) return false;
  return true;
}

function aggregateSalesBySkuDate(rows: ParsedSalesRow[]): ParsedSalesRow[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.sku}\u0000${r.saleDate}`;
    m.set(key, (m.get(key) ?? 0) + r.quantity);
  }
  return [...m.entries()].map(([k, quantity]) => {
    const i = k.indexOf("\u0000");
    return {
      sku: k.slice(0, i),
      saleDate: k.slice(i + 1),
      quantity: Math.round(quantity),
    };
  });
}

function parseSalesLegacyJson(sheet: import("xlsx").WorkSheet): ParsedSalesRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
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

function parseSalesObjectRows(sheet: import("xlsx").WorkSheet): ParsedSalesRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (!rows.length) return [];

  const keys = collectSheetJsonKeys(rows);
  let bestSkuKey: string | null = null;
  let bestSkuScore = 0;
  let bestDateKey: string | null = null;
  let bestDateScore = 0;
  let bestQtyKey: string | null = null;
  let bestQtyScore = 0;

  for (const key of keys) {
    const sk = headerMatchScore(key, SALES_SKU_HEADER_KEYWORDS);
    if (allowSalesSkuHeader(key) && sk > bestSkuScore) {
      bestSkuScore = sk;
      bestSkuKey = key;
    }
    const dt = headerMatchScore(key, SALES_DATE_HEADER_KEYWORDS);
    if (allowSalesDateHeader(key) && dt > bestDateScore) {
      bestDateScore = dt;
      bestDateKey = key;
    }
    const q = headerMatchScore(key, SALES_QTY_HEADER_KEYWORDS);
    if (allowSalesQtyHeader(key) && q > bestQtyScore) {
      bestQtyScore = q;
      bestQtyKey = key;
    }
  }

  if (!bestSkuKey || !bestDateKey || bestSkuScore < 15 || bestDateScore < 15) return [];
  if (bestSkuKey === bestDateKey) return [];

  const statusKey = keys.find(
    (k) =>
      normHeader(k).includes("订单状态") ||
      normHeader(k).includes("orderstatus") ||
      normHeader(k) === "状态",
  );

  const out: ParsedSalesRow[] = [];
  for (const row of rows) {
    if (statusKey) {
      const st = cellToString(row[statusKey]);
      if (/已取消|已关闭|取消|关闭|refund|cancel/i.test(st)) continue;
    }
    const sku = cellToString(row[bestSkuKey]);
    if (!sku || sku === "—" || sku === "-") continue;
    const saleDate = parseExcelDate(row[bestDateKey]);
    if (!saleDate) continue;
    let quantity = 1;
    if (bestQtyKey && bestQtyKey !== bestSkuKey && bestQtyKey !== bestDateKey && bestQtyScore >= 15) {
      const q = parseQuantityCell(row[bestQtyKey]);
      if (Number.isFinite(q) && q > 0) quantity = Math.round(q);
    }
    out.push({ sku, saleDate, quantity });
  }
  return out;
}

export function parseSalesWorkbook(buffer: ArrayBuffer): ParsedSalesRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const fromObj = parseSalesObjectRows(sheet);
    if (fromObj.length) return aggregateSalesBySkuDate(fromObj);
    const legacy = parseSalesLegacyJson(sheet);
    if (legacy.length) return aggregateSalesBySkuDate(legacy);
  }
  return [];
}

function parseRowsForHeader(
  aoa: unknown[][],
  dataStartRow: number,
  headerCells: string[],
): ParsedInventoryRow[] {
  const headers = forwardFillHeaders(headerCells);
  const skuPick = pickBestColumnIndex(headers, INV_SKU_HEADER_KEYWORDS, allowInventorySkuHeader);
  const avPick = pickBestColumnIndex(headers, INV_AVAIL_HEADER_KEYWORDS, allowInventoryAvailHeader);
  const trPick = pickBestColumnIndex(headers, INV_TRANSIT_HEADER_KEYWORDS, allowInventoryTransitHeader);
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

/**
 * 领星等导出：首行即表头且列名为完整双语字符串时，`sheet_to_json` 最稳。
 * AoA 在合并单元格/稀疏列时易丢列，本路径用对象键 + 同一套关键字与过滤。
 */
function parseInventoryObjectRows(sheet: import("xlsx").WorkSheet): ParsedInventoryRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (!rows.length) return [];

  const keys = collectSheetJsonKeys(rows);
  let bestSkuKey: string | null = null;
  let bestSkuScore = 0;
  let bestAvailKey: string | null = null;
  let bestAvailScore = 0;
  let bestTransitKey: string | null = null;
  let bestTransitScore = 0;

  for (const key of keys) {
    const sk = headerMatchScore(key, INV_SKU_HEADER_KEYWORDS);
    if (allowInventorySkuHeader(key) && sk > bestSkuScore) {
      bestSkuScore = sk;
      bestSkuKey = key;
    }
    const av = headerMatchScore(key, INV_AVAIL_HEADER_KEYWORDS);
    if (allowInventoryAvailHeader(key) && av > bestAvailScore) {
      bestAvailScore = av;
      bestAvailKey = key;
    }
    const tr = headerMatchScore(key, INV_TRANSIT_HEADER_KEYWORDS);
    if (allowInventoryTransitHeader(key) && tr > bestTransitScore) {
      bestTransitScore = tr;
      bestTransitKey = key;
    }
  }

  if (!bestSkuKey || !bestAvailKey || bestSkuScore < 15 || bestAvailScore < 15) return [];
  if (bestSkuKey === bestAvailKey) return [];

  const out: ParsedInventoryRow[] = [];
  for (const row of rows) {
    const sku = cellToString(row[bestSkuKey]);
    if (!sku) continue;
    const available = parseQuantityCell(row[bestAvailKey]);
    if (!Number.isFinite(available)) continue;
    let inTransit = 0;
    if (
      bestTransitKey &&
      bestTransitKey !== bestAvailKey &&
      bestTransitKey !== bestSkuKey &&
      bestTransitScore >= 15
    ) {
      const t = parseQuantityCell(row[bestTransitKey]);
      if (Number.isFinite(t)) inTransit = Math.round(t);
    }
    out.push({
      sku,
      available: Math.round(available),
      inTransit,
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
    const fromObjects = parseInventoryObjectRows(sheet);
    if (fromObjects.length) return fromObjects;
  }
  return [];
}
