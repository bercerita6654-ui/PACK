import { ProcessedNota } from '../types';

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

