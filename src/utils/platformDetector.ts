import { PlatformType } from '../types';

/**
 * Mendeteksi platform marketplace berdasarkan pola nomor pemesanan:
 * - Mengandung huruf (kombinasi angka & huruf seperti 2609032TQ99KX5) -> Shopee
 * - Hanya angka/digit (seperti 585861788212430295) -> Tokopedia/TikTok
 */
export function detectPlatform(orderNumber: string): PlatformType {
  const clean = orderNumber.trim();
  if (!clean) return 'Lainnya';

  // Jika mengandung huruf (A-Z atau a-z)
  if (/[a-zA-Z]/.test(clean)) {
    return 'Shopee';
  }

  // Jika hanya terdiri dari angka
  if (/^\d+$/.test(clean)) {
    return 'Tokopedia/TikTok';
  }

  return 'Lainnya';
}

export function getPlatformColor(platform: PlatformType): {
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  label: string;
} {
  switch (platform) {
    case 'Shopee':
      return {
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: 'border-orange-200',
        badgeBg: 'bg-orange-500',
        badgeText: 'text-white',
        label: 'Shopee',
      };
    case 'Tokopedia/TikTok':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        border: 'border-emerald-200',
        badgeBg: 'bg-emerald-600',
        badgeText: 'text-white',
        label: 'Tokopedia / TikTok',
      };
    default:
      return {
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        badgeBg: 'bg-slate-500',
        badgeText: 'text-white',
        label: 'Lainnya',
      };
  }
}
