export type ExpeditionCode = 'JNE' | 'JNT' | 'SPX' | 'IDX';
export type DeliveryMethod = 'pickup' | 'drop off';

export type PlatformType = 'Shopee' | 'Tokopedia/TikTok' | 'Lainnya';

export type ActiveTab = 'rekap' | 'packing' | 'nota';

export interface PackedOrder {
  id: string;
  orderNumber: string;
  platform: PlatformType;
  timestamp: string; // e.g. "14:25:30"
  date: string;
  notes?: string;
}

export interface ProcessedNota {
  id: string;
  orderNumber: string;
  platform: PlatformType;
  timestamp: string; // e.g. "10:15:30"
  date: string;      // e.g. "Kamis, 10 September 2026"
  isPacked?: boolean;
  packedAt?: string;
  notes?: string;
  createdAt?: number; // epoch ms e.g. Date.now()
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

export interface SheetProcessedNotaRow {
  rowNumber: number;
  no: string;
  orderNumber: string;
  platform: PlatformType;
  adminDate: string;
  adminTime: string;
  isPacked: boolean;
  packingStatus: string;
  packingTime: string;
  notes: string;
  matchedFromPackingReg?: boolean;
  matchedSource?: 'packing_reg_sheet' | 'packing_session' | 'local_nota' | 'sheet_status';
  sourceSheetTab?: 'Nota Diproses' | 'Packing Reg' | 'both';
}

export interface SyncProgressInfo {
  isActive: boolean;
  title: string;
  currentStage: string;
  stageIndex: number;
  totalStages: number;
  percent: number;
  totalItems: number;
  processedItems: number;
  newItemsAdded: number;
  duplicateItemsSkipped: number;
  currentBatch?: number;
  totalBatches?: number;
  speed?: string;
  detailMessage?: string;
  sheetTab?: string;
  spreadsheetName?: string;
  status: 'preparing' | 'reading' | 'validating' | 'uploading' | 'finalizing' | 'success' | 'error';
  errorMessage?: string;
}
