export type ReplenishmentRow = {
  sku_code: string;
  avg_daily_7: number;
  warehouses: Record<string, number>;
  available_total: number;
  in_transit_total: number;
  total_inventory: number;
  available_days: number | null;
  total_days: number | null;
  prep_cycle_days: number;
  shipping_days: number;
  safety_net: number | null;
  alert: boolean;
  suggested_reorder: number;
  reorder_threshold: number;
};
