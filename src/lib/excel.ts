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

export function parseInventoryWorkbook(buffer: ArrayBuffer): ParsedInventoryRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
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
