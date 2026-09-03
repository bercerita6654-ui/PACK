import { ExpeditionCode, ExpeditionConfig } from '../types';

export const DEFAULT_GOOGLE_SHEET_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbzVBPJFEaFV0Oocif-S1bBZxGabG6WFexlqAfdTJq3mccjG_gmWdGebuWKrbwNHZEpqCQ/exec';

export const DEFAULT_GOOGLE_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ8ACyi03DJ77mANO19x_hJV82Xs8rNBBLyT9IIGc1tgYGNrv9WMufjm940iEPx4QU6Eta6T8Ekv2-X/pub?gid=1942837262&single=true&output=csv';

export const EXPEDITIONS: Record<ExpeditionCode, ExpeditionConfig> = {
  JNE: {
    code: 'JNE',
    name: 'JNE',
    fullName: 'JNE Express',
    colorHex: '#2563eb',
    borderColor: 'border-b-blue-600',
    bgLight: 'bg-blue-50/70',
    borderLight: 'border-blue-200',
    textColor: 'text-blue-600',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    hoverBg: 'hover:bg-blue-50',
    btnBg: 'bg-blue-600',
    btnHover: 'hover:bg-blue-700',
  },
  JNT: {
    code: 'JNT',
    name: 'J&T Express',
    fullName: 'J&T Express',
    colorHex: '#dc2626',
    borderColor: 'border-b-red-600',
    bgLight: 'bg-red-50/70',
    borderLight: 'border-red-200',
    textColor: 'text-red-600',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    badgeBorder: 'border-red-200',
    hoverBg: 'hover:bg-red-50',
    btnBg: 'bg-red-600',
    btnHover: 'hover:bg-red-700',
  },
  SPX: {
    code: 'SPX',
    name: 'SPX',
    fullName: 'Shopee Xpress',
    colorHex: '#ea580c',
    borderColor: 'border-b-orange-500',
    bgLight: 'bg-orange-50/70',
    borderLight: 'border-orange-200',
    textColor: 'text-orange-500',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    badgeBorder: 'border-orange-200',
    hoverBg: 'hover:bg-orange-50',
    btnBg: 'bg-orange-500',
    btnHover: 'hover:bg-orange-600',
  },
  IDX: {
    code: 'IDX',
    name: 'ID Xpress',
    fullName: 'ID Xpress',
    colorHex: '#ca8a04',
    borderColor: 'border-b-yellow-500',
    bgLight: 'bg-amber-50/70',
    borderLight: 'border-amber-200',
    textColor: 'text-amber-600',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    hoverBg: 'hover:bg-amber-50',
    btnBg: 'bg-amber-500',
    btnHover: 'hover:bg-amber-600',
  },
};

export const EXPEDITION_KEYS: ExpeditionCode[] = ['JNE', 'JNT', 'SPX', 'IDX'];
