export type ExpeditionCode = 'JNE' | 'JNT' | 'SPX' | 'IDX';
export type DeliveryMethod = 'pickup' | 'drop off';

export type PlatformType = 'Shopee' | 'Tokopedia/TikTok' | 'Lainnya';

export type ActiveTab = 'rekap' | 'packing';

export interface PackedOrder {
  id: string;
  orderNumber: string;
  platform: PlatformType;
  timestamp: string; // e.g. "14:25:30"
  date: string;
  notes?: string;
}

export interface ExpeditionConfig {
  code: ExpeditionCode;
  name: string;
  fullName: string;
  colorHex: string;
  borderColor: string;
  bgLight: string;
  borderLight: string;
  textColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  hoverBg: string;
  btnBg: string;
  btnHover: string;
}

export interface PackageLog {
  id: string;
  timestamp: string;
  date?: string; // ISO date string e.g. "2026-09-02"
  dateFormatted?: string; // Indonesian formatted date e.g. "Rabu, 2 September 2026"
  expedition: ExpeditionCode;
  amount: number;
  method?: DeliveryMethod;
}

export interface AppState {
  date: string;
  counts: Record<ExpeditionCode, number>;
  logs: PackageLog[];
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export interface ActiveSpreadsheet {
  id: string;
  name: string;
  url?: string;
}
