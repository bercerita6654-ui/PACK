import { ProcessedNota, PackedOrder } from '../types';

/**
 * Batas waktu default pengingat jika nota belum di-packing adalah 1 hari (24 jam = 1440 menit)
 */
export const DEFAULT_DELAY_THRESHOLD_MINUTES = 1440;

export interface DelayThresholdOption {
  value: number;
  label: string;
}

export const DELAY_THRESHOLD_OPTIONS: DelayThresholdOption[] = [
  { value: 120, label: '2 Jam' },
  { value: 360, label: '6 Jam' },
  { value: 720, label: '12 Jam' },
  { value: 1440, label: '1 Hari (Standar)' },
  { value: 2880, label: '2 Hari' },
  { value: 4320, label: '3 Hari' },
];

/**
 * Normalizes an order / resi string for robust matching across systems.
 * Strips whitespace, dashes, underscores, slashes, asterisks (* from barcodes), quotes, and symbols.
 */
export function normalizeOrderNumber(str?: string): string {
  return (str || '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_#/.*'"\\,;:[\]()]/g, '');
}

export interface PackingRegRecord {
  orderNumber: string;
  platform?: string;
  date?: string;
  timestamp?: string;
  status?: string;
  rawRow?: string[];
}

/**
 * Evaluates whether a nota is packed based on sheet raw status, packing time,
 * order number, active session packed orders / processed notas, AND
 * cross-referencing with the 'Packing Reg' sheet.
 */
export function evaluateNotaPackedStatus(
  rawStatus: string,
  packingTime: string,
  orderNumber: string,
  packedOrders?: PackedOrder[],
  localNotas?: ProcessedNota[],
  packingRegOrders?: (PackingRegRecord | string)[] | Map<string, PackingRegRecord>
): {
  isPacked: boolean;
  resolvedStatus: string;
  resolvedTime: string;
  matchedSource?: 'packing_reg_sheet' | 'packing_session' | 'local_nota' | 'sheet_status';
} {
  const normOrder = normalizeOrderNumber(orderNumber);
  const exactOrder = (orderNumber || '').trim().toUpperCase();

  // If no valid order number is provided, cannot match
  if (!exactOrder && !normOrder) {
    return {
      isPacked: false,
      resolvedStatus: 'Belum Packing',
      resolvedTime: '-',
    };
  }

  // 1. Cross-reference with 'Packing Reg' sheet records (Sheet "Packing Reg")
  if (packingRegOrders) {
    let match: PackingRegRecord | undefined;

    if (packingRegOrders instanceof Map) {
      match =
        packingRegOrders.get(exactOrder) ||
        (normOrder ? packingRegOrders.get(normOrder) : undefined);
    } else if (Array.isArray(packingRegOrders)) {
      match = packingRegOrders.find((p) => {
        if (typeof p === 'string') {
          const pExact = p.trim().toUpperCase();
          const pNorm = normalizeOrderNumber(p);
          return pExact === exactOrder || (normOrder && pNorm === normOrder);
        }
        const pExact = (p.orderNumber || '').trim().toUpperCase();
        const pNorm = normalizeOrderNumber(p.orderNumber);
        return pExact === exactOrder || (normOrder && pNorm === normOrder);
      }) as PackingRegRecord | undefined;
    }

    if (match) {
      const matchObj = typeof match === 'string' ? { orderNumber: match } : match;
      const matchStatus = (matchObj as PackingRegRecord).status || '';
      if (!/^(batal|dibatalkan|cancel|cancelled|belum)/i.test(matchStatus.trim())) {
        const scanTime = matchObj.timestamp && matchObj.timestamp !== '-' ? matchObj.timestamp : '';
        const scanDate = matchObj.date && matchObj.date !== '-' ? matchObj.date : '';
        const fallbackTime = scanTime
          ? scanDate
            ? `${scanDate} ${scanTime}`
            : scanTime
          : 'Selesai (Packing Reg)';

        return {
          isPacked: true,
          resolvedStatus: 'Selesai Packing',
          resolvedTime: packingTime && packingTime !== '-' ? packingTime : fallbackTime,
          matchedSource: 'packing_reg_sheet',
        };
      }
    }
  }

  // 2. Cross-reference with packedOrders (scanned packages in Packing session)
  if (packedOrders && packedOrders.length > 0) {
    const match = packedOrders.find((p) => {
      const pExact = p.orderNumber.trim().toUpperCase();
      const pNorm = normalizeOrderNumber(p.orderNumber);
      return pExact === exactOrder || (normOrder && pNorm === normOrder);
    });
    if (match) {
      return {
        isPacked: true,
        resolvedStatus: 'Selesai Packing',
        resolvedTime: packingTime && packingTime !== '-' ? packingTime : match.timestamp,
        matchedSource: 'packing_session',
      };
    }
  }

  // 3. Cross-reference with localNotas marked as isPacked
  if (localNotas && localNotas.length > 0) {
    const match = localNotas.find((n) => {
      const nExact = n.orderNumber.trim().toUpperCase();
      const nNorm = normalizeOrderNumber(n.orderNumber);
      return (nExact === exactOrder || (normOrder && nNorm === normOrder)) && n.isPacked;
    });
    if (match) {
      return {
        isPacked: true,
        resolvedStatus: 'Selesai Packing',
        resolvedTime: packingTime && packingTime !== '-' ? packingTime : match.packedAt || 'Selesai',
        matchedSource: 'local_nota',
      };
    }
  }

  // 4. Evaluate rawStatus string from Google Sheets
  const s = (rawStatus || '').trim().toLowerCase();
  const t = (packingTime || '').trim().toLowerCase();

  const isNegated =
    s.includes('belum') ||
    s.includes('tidak') ||
    s.includes('batal') ||
    s.includes('cancel') ||
    s.includes('pending') ||
    s.includes('menunggu') ||
    s.includes('antri');

  const isAffirmative =
    s.includes('selesai') ||
    s.includes('sudah') ||
    s.includes('terpacking') ||
    s.includes('dipacking') ||
    s.includes('packed') ||
    s.includes('beres') ||
    s.includes('siap kirim') ||
    s.includes('terkirim') ||
    s.includes('done') ||
    s === 'ok' ||
    s.startsWith('ok ') ||
    s === 'yes' ||
    s === 'true' ||
    s === 'y' ||
    s === 'v' ||
    s === '✓' ||
    s === '1';

  if (isAffirmative && !isNegated) {
    return {
      isPacked: true,
      resolvedStatus: 'Selesai Packing',
      resolvedTime: packingTime && packingTime !== '-' ? packingTime : '-',
      matchedSource: 'sheet_status',
    };
  }

  // 5. Check packingTime column
  if (
    t &&
    t !== '-' &&
    !t.includes('belum') &&
    !t.includes('tidak') &&
    !t.includes('batal') &&
    !t.includes('pending')
  ) {
    return {
      isPacked: true,
      resolvedStatus: 'Selesai Packing',
      resolvedTime: packingTime,
      matchedSource: 'sheet_status',
    };
  }

  return {
    isPacked: false,
    resolvedStatus: 'Belum Packing',
    resolvedTime: '-',
  };
}

/**
 * Checks whether a given date or timestamp is from yesterday.
 */
export function isDateYesterday(
  dateStr?: string,
  timeStr?: string,
  createdAtMs?: number
): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (createdAtMs && !isNaN(createdAtMs) && createdAtMs > 0) {
    const cd = new Date(createdAtMs);
    if (!isNaN(cd.getTime())) {
      return (
        cd.getFullYear() === yesterday.getFullYear() &&
        cd.getMonth() === yesterday.getMonth() &&
        cd.getDate() === yesterday.getDate()
      );
    }
  }

  if (dateStr && dateStr !== '-') {
    const d = parseNotaDateTime(dateStr, timeStr);
    if (d && !isNaN(d.getTime())) {
      return (
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate()
      );
    }

    const clean = dateStr.trim().toLowerCase();
    const day = String(yesterday.getDate());
    const month = String(yesterday.getMonth() + 1);
    const year = String(yesterday.getFullYear());
    const padD = day.padStart(2, '0');
    const padM = month.padStart(2, '0');

    const monthNames = [
      'januari',
      'februari',
      'maret',
      'april',
      'mei',
      'juni',
      'juli',
      'agustus',
      'september',
      'oktober',
      'november',
      'desember',
    ];
    const curMonthName = monthNames[yesterday.getMonth()];

    if (
      clean.includes(curMonthName) &&
      (clean.includes(day) || clean.includes(padD)) &&
      clean.includes(year)
    ) {
      return true;
    }

    if (
      clean.includes(`${padD}/${padM}/${year}`) ||
      clean.includes(`${day}/${month}/${year}`) ||
      clean.includes(`${year}-${padM}-${padD}`) ||
      clean.includes(`${padD}-${padM}-${year}`)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a given date or timestamp is from today.
 */
export function isDateToday(
  dateStr?: string,
  timeStr?: string,
  createdAtMs?: number
): boolean {
  const now = new Date();

  if (createdAtMs && !isNaN(createdAtMs) && createdAtMs > 0) {
    const cd = new Date(createdAtMs);
    if (!isNaN(cd.getTime())) {
      return (
        cd.getFullYear() === now.getFullYear() &&
        cd.getMonth() === now.getMonth() &&
        cd.getDate() === now.getDate()
      );
    }
  }

  if (dateStr && dateStr !== '-') {
    const d = parseNotaDateTime(dateStr, timeStr);
    if (d && !isNaN(d.getTime())) {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }

    const clean = dateStr.trim().toLowerCase();
    const day = String(now.getDate());
    const month = String(now.getMonth() + 1);
    const year = String(now.getFullYear());
    const padD = day.padStart(2, '0');
    const padM = month.padStart(2, '0');

    const monthNames = [
      'januari',
      'februari',
      'maret',
      'april',
      'mei',
      'juni',
      'juli',
      'agustus',
      'september',
      'oktober',
      'november',
      'desember',
    ];
    const curMonthName = monthNames[now.getMonth()];

    if (
      clean.includes(curMonthName) &&
      (clean.includes(day) || clean.includes(padD)) &&
      clean.includes(year)
    ) {
      return true;
    }

    if (
      clean.includes(`${padD}/${padM}/${year}`) ||
      clean.includes(`${day}/${month}/${year}`) ||
      clean.includes(`${year}-${padM}-${padD}`) ||
      clean.includes(`${padD}-${padM}-${year}`)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a given date or timestamp is from the current week (Monday to Sunday).
 */
export function isDateThisWeek(
  dateStr?: string,
  timeStr?: string,
  createdAtMs?: number
): boolean {
  const now = new Date();

  let targetDate: Date | null = null;
  if (createdAtMs && !isNaN(createdAtMs) && createdAtMs > 0) {
    const cd = new Date(createdAtMs);
    if (!isNaN(cd.getTime())) targetDate = cd;
  }
  if (!targetDate && dateStr && dateStr !== '-') {
    targetDate = parseNotaDateTime(dateStr, timeStr);
  }

  if (targetDate && !isNaN(targetDate.getTime())) {
    // Current week from Monday 00:00:00 to Sunday 23:59:59
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday, 6 = Sunday
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return targetDate >= startOfWeek && targetDate <= endOfWeek;
  }

  return isDateToday(dateStr, timeStr, createdAtMs);
}

/**
 * Checks whether a given date or timestamp is from the current month.
 */
export function isDateThisMonth(
  dateStr?: string,
  timeStr?: string,
  createdAtMs?: number
): boolean {
  const now = new Date();

  let targetDate: Date | null = null;
  if (createdAtMs && !isNaN(createdAtMs) && createdAtMs > 0) {
    const cd = new Date(createdAtMs);
    if (!isNaN(cd.getTime())) targetDate = cd;
  }
  if (!targetDate && dateStr && dateStr !== '-') {
    targetDate = parseNotaDateTime(dateStr, timeStr);
  }

  if (targetDate && !isNaN(targetDate.getTime())) {
    return (
      targetDate.getFullYear() === now.getFullYear() &&
      targetDate.getMonth() === now.getMonth()
    );
  }

  if (dateStr && dateStr !== '-') {
    const clean = dateStr.trim().toLowerCase();
    const year = String(now.getFullYear());
    const monthNames = [
      'januari', 'februari', 'maret', 'april', 'mei', 'juni',
      'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
    ];
    const curMonthName = monthNames[now.getMonth()];
    const padM = String(now.getMonth() + 1).padStart(2, '0');
    const m = String(now.getMonth() + 1);

    if (clean.includes(curMonthName) && clean.includes(year)) {
      return true;
    }
    if (
      clean.includes(`/${padM}/${year}`) ||
      clean.includes(`-${padM}-`) ||
      clean.includes(`/${m}/${year}`)
    ) {
      return true;
    }
  }

  return isDateToday(dateStr, timeStr, createdAtMs);
}

/**
 * Format label threshold untuk tampilan teks yang rapi dan mudah dibaca
 * e.g. 1440 -> "1 Hari", 2880 -> "2 Hari", 720 -> "12 Jam", 30 -> "30 Menit"
 */
export function formatThresholdLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} Hari`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} Jam`;
  }
  return `${minutes} Menit`;
}

const INDONESIAN_MONTHS: Record<string, number> = {
  januari: 0,
  jan: 0,
  februari: 1,
  feb: 1,
  maret: 2,
  mar: 2,
  april: 3,
  apr: 3,
  mei: 4,
  may: 4,
  juni: 5,
  jun: 5,
  juli: 6,
  jul: 6,
  agustus: 7,
  ags: 7,
  aug: 7,
  september: 8,
  sep: 8,
  oktober: 9,
  okt: 9,
  oct: 9,
  november: 10,
  nov: 10,
  desember: 11,
  des: 11,
  dec: 11,
};

/**
 * Parses a combined date string (e.g. "Kamis, 10 September 2026", "2026-09-10", "10/09/2026")
 * and time string (e.g. "14:25:30") into a Date object.
 */
export function parseNotaDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr && !timeStr) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timeStr) {
    const timeParts = timeStr.split(':').map((p) => parseInt(p, 10));
    if (timeParts.length >= 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
      hours = timeParts[0];
      minutes = timeParts[1];
      seconds = timeParts[2] || 0;
    }
  }

  if (dateStr) {
    const cleanDate = dateStr.trim();

    // 1. Match Indonesian formatted date: e.g. "Kamis, 10 September 2026" or "10 September 2026"
    const indoMatch = cleanDate.match(/(?:[A-Za-z]+,\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (indoMatch) {
      const day = parseInt(indoMatch[1], 10);
      const monthName = indoMatch[2].toLowerCase();
      const year = parseInt(indoMatch[3], 10);
      const monthIdx = INDONESIAN_MONTHS[monthName];

      if (monthIdx !== undefined) {
        return new Date(year, monthIdx, day, hours, minutes, seconds);
      }
    }

    // 2. Match ISO YYYY-MM-DD
    const isoMatch = cleanDate.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      return new Date(year, month, day, hours, minutes, seconds);
    }

    // 3. Match DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = cleanDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      return new Date(year, month, day, hours, minutes, seconds);
    }

    // 4. Try native Date parse
    const parsedNative = new Date(cleanDate);
    if (!isNaN(parsedNative.getTime())) {
      parsedNative.setHours(hours, minutes, seconds, 0);
      return parsedNative;
    }
  }

  return null;
}

/**
 * Calculates elapsed minutes since admin processed a nota.
 */
export function getNotaElapsedMinutes(
  nota: ProcessedNota,
  nowMs: number = Date.now()
): number {
  // 1. Direct epoch timestamp (most precise)
  if (nota.createdAt && !isNaN(nota.createdAt) && nota.createdAt > 0) {
    const diff = Math.max(0, Math.floor((nowMs - nota.createdAt) / 60000));
    return diff;
  }

  // 2. Parse nota.date combined with nota.timestamp
  const parsedDate = parseNotaDateTime(nota.date, nota.timestamp);
  if (parsedDate && !isNaN(parsedDate.getTime())) {
    const diffMs = nowMs - parsedDate.getTime();
    if (diffMs >= 0) {
      return Math.floor(diffMs / 60000);
    }
  }

  // 3. Fallback: parse nota.timestamp (clock time on today)
  if (nota.timestamp) {
    const parts = nota.timestamp.split(':').map((p) => parseInt(p, 10));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const notaDate = new Date(nowMs);
      notaDate.setHours(parts[0], parts[1], parts[2] || 0, 0);

      let diffMs = nowMs - notaDate.getTime();
      // If current time is earlier on same clock (midnight rollover)
      if (diffMs < 0) {
        diffMs += 24 * 60 * 60 * 1000;
      }
      return Math.max(0, Math.floor(diffMs / 60000));
    }
  }

  return 0;
}

/**
 * Formats elapsed duration into friendly Indonesian text.
 * e.g. "Baru saja", "15m", "2 jam", "1 hari 3 jam", "2 hari"
 */
export function formatElapsedDuration(minutes: number): string {
  if (minutes < 1) {
    return 'Baru saja';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} jam`;
    }
    return `${hours}j ${remainingMinutes}m`;
  }

  // 1 hari atau lebih
  const days = Math.floor(minutes / 1440);
  const remainingHours = Math.floor((minutes % 1440) / 60);
  if (remainingHours === 0) {
    return `${days} hari`;
  }
  return `${days} hari ${remainingHours} jam`;
}

/**
 * Checks if a processed nota is pending and exceeds the delay threshold.
 * Batas waktu pengingat jika belum di-packing adalah bila lebih dari 1 hari (1440 menit).
 */
export function isNotaDelayed(
  nota: ProcessedNota,
  thresholdMinutes: number = DEFAULT_DELAY_THRESHOLD_MINUTES,
  nowMs: number = Date.now()
): boolean {
  if (nota.isPacked) return false;
  return getNotaElapsedMinutes(nota, nowMs) >= thresholdMinutes;
}

export interface PackingReportPlatformCounts {
  shopee: number;
  tokped: number;
  other?: number;
}

export interface GeneratePackingReportParams {
  totalCount: number;
  packedCount: number;
  pendingCount: number;
  timeframe?: 'today' | 'yesterday' | 'week' | 'month' | 'all';
  lastPackedTimeStr?: string;
  customDate?: Date;
  breakdown?: {
    total?: PackingReportPlatformCounts;
    packed?: PackingReportPlatformCounts;
    pending?: PackingReportPlatformCounts;
  };
}

/**
 * Helper to extract short HH:mm time from various date/time/log strings
 * e.g. "Sabtu, 19 September 2026 12.56.14 (260919DW7Q5D9G)" -> "12:56"
 * e.g. "2026-09-19 12:56:14" -> "12:56"
 * e.g. "12.56.14" -> "12:56"
 * e.g. "12:56" -> "12:56"
 */
export function extractShortTime(timeStr?: string, fallbackTime?: string): string {
  if (!timeStr || timeStr.trim() === '' || timeStr === '-') {
    return fallbackTime || '';
  }
  const clean = timeStr.trim();

  // Match time with colon or dot separator e.g. 12:56:14 or 12.56.14 or 12:56 or 12.56
  const timeMatch = clean.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.][0-5]\d)?\b/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2];
    return `${hh}:${mm}`;
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return fallbackTime || clean;
}

/**
 * Generates formatted text report for Packing Status (Data Google Sheets).
 *
 * Example Output:
 * *Update Harian Pesanan REG*
 * Sabtu, 19 September 2026 (12:58)
 *
 * *TOTAL HARIAN  : 21 nota*
 * - Shopee : 14
 * - Tokped : 7
 *
 * *SUDAH PACKING : 19 nota (last update : 12:56)*
 * - Shopee : 12
 * - Tokped : 7
 *
 * *BELUM PACKING : 2 nota*
 * - Shopee : 2
 * - Tokped : 0
 */
export function generatePackingReportText({
  totalCount,
  packedCount,
  pendingCount,
  timeframe = 'today',
  lastPackedTimeStr,
  customDate,
  breakdown,
}: GeneratePackingReportParams): string {
  const now = customDate || new Date();
  const reportDate =
    timeframe === 'yesterday'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, now.getHours(), now.getMinutes())
      : now;

  // Indonesian Day Name in Title Case (e.g. Sabtu)
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = dayNames[reportDate.getDay()];

  // Indonesian Month Name
  const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const dateFormatted = `${reportDate.getDate()} ${monthNames[reportDate.getMonth()]} ${reportDate.getFullYear()}`;
  const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Title and Total label according to timeframe
  let titleText = 'Update Harian Pesanan REG';
  let totalLabel = 'TOTAL HARIAN';

  if (timeframe === 'yesterday') {
    titleText = 'Update Kemarin Pesanan REG';
    totalLabel = 'TOTAL KEMARIN';
  } else if (timeframe === 'week') {
    titleText = 'Update Mingguan Pesanan REG';
    totalLabel = 'TOTAL MINGGUAN';
  } else if (timeframe === 'month') {
    titleText = 'Update Bulanan Pesanan REG';
    totalLabel = 'TOTAL BULANAN';
  } else if (timeframe === 'all') {
    titleText = 'Update Pesanan REG';
    totalLabel = 'TOTAL NOTA';
  }

  const shortLastUpdate = extractShortTime(lastPackedTimeStr, timeFormatted);

  const shopeeTotal = breakdown?.total?.shopee ?? totalCount;
  const tokpedTotal = breakdown?.total?.tokped ?? 0;
  const otherTotal = breakdown?.total?.other ?? 0;

  const shopeePacked = breakdown?.packed?.shopee ?? packedCount;
  const tokpedPacked = breakdown?.packed?.tokped ?? 0;
  const otherPacked = breakdown?.packed?.other ?? 0;

  const shopeePending = breakdown?.pending?.shopee ?? pendingCount;
  const tokpedPending = breakdown?.pending?.tokped ?? 0;
  const otherPending = breakdown?.pending?.other ?? 0;

  let totalLines = `- Shopee : ${shopeeTotal}\n- Tokped : ${tokpedTotal}`;
  if (otherTotal > 0) {
    totalLines += `\n- Lainnya : ${otherTotal}`;
  }

  let packedLines = `- Shopee : ${shopeePacked}\n- Tokped : ${tokpedPacked}`;
  if (otherPacked > 0) {
    packedLines += `\n- Lainnya : ${otherPacked}`;
  }

  let pendingLines = `- Shopee : ${shopeePending}\n- Tokped : ${tokpedPending}`;
  if (otherPending > 0) {
    pendingLines += `\n- Lainnya : ${otherPending}`;
  }

  return `*${titleText}*
${dayName}, ${dateFormatted} (${timeFormatted})

*${totalLabel}  : ${totalCount} nota*
${totalLines}

*SUDAH PACKING : ${packedCount} nota (last update : ${shortLastUpdate})*
${packedLines}

*BELUM PACKING : ${pendingCount} nota*
${pendingLines}`;
}

