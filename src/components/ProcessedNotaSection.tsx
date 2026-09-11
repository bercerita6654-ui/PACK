import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  ScanBarcode,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Download,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Sparkles,
  ExternalLink,
  Volume2,
  VolumeX,
  Plus,
  RefreshCw,
  Share2,
  ArrowRight,
  Filter,
  LogIn,
  Calendar,
  CloudUpload,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProcessedNota, PlatformType, PackedOrder, ToastItem, ToastOptions } from '../types';
import { detectPlatform, getPlatformColor } from '../utils/platformDetector';
import { soundFX } from '../utils/audio';
import {
  getNotaElapsedMinutes,
  formatElapsedDuration,
  isNotaDelayed,
  DEFAULT_DELAY_THRESHOLD_MINUTES,
  DELAY_THRESHOLD_OPTIONS,
  formatThresholdLabel,
  parseNotaDateTime,
  evaluateNotaPackedStatus,
  isDateToday,
  isDateYesterday,
  isDateThisWeek,
  isDateThisMonth,
  normalizeOrderNumber,
  generatePackingReportText,
} from '../utils/notaDelay';
import {
  fetchProcessedNotasHistory,
  fetchCrossReferencedNotasAndPacking,
  isAuthExpiredError,
  invalidateStoredToken,
} from '../services/googleWorkspace';
import {
  ProcessedNotaSheetHistory,
  SheetProcessedNotaRow,
} from './ProcessedNotaSheetHistory';

interface ProcessedNotaSectionProps {
  notas: ProcessedNota[];
  packedOrders?: PackedOrder[];
  onAddNota: (
    orderNumber: string,
    platform: PlatformType,
    notes?: string
  ) => { success: boolean; isDuplicate: boolean };
  onAddNotasBatch?: (
    items: { orderNumber: string; platform: PlatformType; notes?: string }[],
    skipDuplicates?: boolean
  ) => { added: number; duplicates: number };
  onRemoveNota: (id: string) => void;
  onClearNotas: () => void;
  onTogglePackedStatus: (id: string) => void;
  onSyncGoogleSheet?: () => void;
  isSyncing?: boolean;
  showToast: (
    msg: string,
    type?: ToastItem['type'],
    options?: ToastOptions
  ) => void;
  accessToken?: string | null;
  userEmail?: string;
  onLoginGoogle?: () => void;
  onTokenExpired?: () => void;
  lastSyncTimestamp?: number;
  targetSpreadsheetId?: string;
  targetSheetTab?: string;
  onNavigateToPacking?: () => void;
  onNavigateToSheetHistory?: () => void;
  delayThreshold?: number;
  onDelayThresholdChange?: (threshold: number) => void;
}

type ScanMode = 'single' | 'batch_paste';
type StatusFilter = 'all' | 'pending' | 'overdue' | 'packed';

export const ProcessedNotaSection: React.FC<ProcessedNotaSectionProps> = ({
  notas,
  packedOrders = [],
  onAddNota,
  onAddNotasBatch,
  onRemoveNota,
  onClearNotas,
  onTogglePackedStatus,
  onSyncGoogleSheet,
  isSyncing = false,
  showToast,
  accessToken,
  userEmail,
  onLoginGoogle,
  onTokenExpired,
  lastSyncTimestamp,
  targetSpreadsheetId = '1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI',
  targetSheetTab = 'Nota Diproses',
  onNavigateToPacking,
  onNavigateToSheetHistory,
  delayThreshold,
  onDelayThresholdChange,
}) => {
  const [scanMode, setScanMode] = useState<ScanMode>('single');
  const [scanInput, setScanInput] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoFocus, setAutoFocus] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<'Semua' | PlatformType>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [todayStatsSource, setTodayStatsSource] = useState<'sheet' | 'local'>('sheet');

  // Local fallback threshold if not provided from parent (default: 1 hari / 1440 menit)
  const [localThreshold, setLocalThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('packTrack_notaDelayThreshold');
      const parsed = saved ? parseInt(saved, 10) : NaN;
      if (isNaN(parsed) || parsed < 120) {
        return DEFAULT_DELAY_THRESHOLD_MINUTES;
      }
      return parsed;
    } catch {
      return DEFAULT_DELAY_THRESHOLD_MINUTES;
    }
  });

  const currentThreshold = delayThreshold ?? localThreshold;

  const handleThresholdChange = (val: number) => {
    if (onDelayThresholdChange) {
      onDelayThresholdChange(val);
    } else {
      setLocalThreshold(val);
      localStorage.setItem('packTrack_notaDelayThreshold', val.toString());
    }
    showToast(`Batas waktu pengingat diatur ke ${formatThresholdLabel(val)}.`, 'info');
  };

  // Clock tick state to update relative elapsed times periodically
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Batch paste state
  const [batchText, setBatchText] = useState<string>('');
  const [batchPlatform, setBatchPlatform] = useState<'auto' | PlatformType>('auto');

  // Manual platform override for single scan (or 'auto')
  const [selectedPlatform, setSelectedPlatform] = useState<'auto' | PlatformType>('auto');

  const inputRef = useRef<HTMLInputElement>(null);

  // Keep soundFX setting in sync
  useEffect(() => {
    soundFX.enabled = soundEnabled;
  }, [soundEnabled]);

  // Keep input focused in single scan mode
  useEffect(() => {
    if (scanMode === 'single' && autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [scanMode, autoFocus, notas.length]);

  // Detected platform for live preview
  const liveDetectedPlatform = useMemo(() => {
    if (selectedPlatform !== 'auto') return selectedPlatform;
    if (!scanInput.trim()) return 'Shopee';
    return detectPlatform(scanInput.trim());
  }, [scanInput, selectedPlatform]);

  // Google Sheet state for top-level live dashboard
  const [sheetRows, setSheetRows] = useState<SheetProcessedNotaRow[]>([]);
  const [sheetLoading, setSheetLoading] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetLastFetchedAt, setSheetLastFetchedAt] = useState<Date | null>(null);
  const [sheetResolvedTab, setSheetResolvedTab] = useState<string>(targetSheetTab);
  const [sheetResolvedPackingTab, setSheetResolvedPackingTab] = useState<string>('Packing Reg');
  const [sheetTotalPackingInSheet, setSheetTotalPackingInSheet] = useState<number>(0);
  const [sheetStatusFilter, setSheetStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'packed'>('all');
  const [sheetTimeframe, setSheetTimeframe] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');

  // Fetch data from Google Sheets - cross-referencing "Nota Diproses" & "Packing Reg"
  const loadSheetData = useCallback(async () => {
    if (!accessToken) {
      setSheetRows([]);
      setSheetError(null);
      return;
    }

    setSheetLoading(true);
    setSheetError(null);

    try {
      const result = await fetchCrossReferencedNotasAndPacking(
        accessToken,
        targetSpreadsheetId,
        targetSheetTab,
        'Packing Reg'
      );
      setSheetResolvedTab(result.notaTabName);
      setSheetResolvedPackingTab(result.packingTabName);
      setSheetTotalPackingInSheet(result.totalPackingCount);

      // Detect header columns dynamically in Nota Diproses
      let colOrder = 1;
      let colPlatform = 2;
      let colDate = 3;
      let colTime = 4;
      let colStatus = 5;
      let colPackTime = 6;
      let colNotes = 7;

      if (result.notaHeaders && result.notaHeaders.length > 0) {
        result.notaHeaders.forEach((h, idx) => {
          const lower = h.trim().toLowerCase();
          if (
            lower.includes('nota') ||
            lower.includes('pesanan') ||
            lower.includes('order') ||
            lower.includes('resi') ||
            lower.includes('barcode')
          ) {
            colOrder = idx;
          } else if (
            lower.includes('platform') ||
            lower.includes('ekspedisi') ||
            lower.includes('marketplace') ||
            lower.includes('toko') ||
            lower.includes('channel')
          ) {
            colPlatform = idx;
          } else if (
            lower.includes('tanggal') ||
            lower.includes('tgl') ||
            lower.includes('date')
          ) {
            colDate = idx;
          } else if (
            lower.includes('waktu admin') ||
            lower.includes('jam admin') ||
            lower.includes('waktu input') ||
            lower.includes('jam input') ||
            lower === 'waktu' ||
            lower === 'jam' ||
            lower === 'time'
          ) {
            colTime = idx;
          } else if (
            lower.includes('status packing') ||
            lower.includes('status') ||
            lower.includes('packing') ||
            lower.includes('kondisi') ||
            lower.includes('keterangan') ||
            lower.includes('proses') ||
            lower.includes('cek')
          ) {
            colStatus = idx;
          } else if (
            lower.includes('waktu packing') ||
            lower.includes('jam packing') ||
            lower.includes('tgl packing') ||
            lower.includes('tanggal packing') ||
            lower.includes('waktu pack') ||
            lower.includes('jam pack') ||
            lower.includes('packed at') ||
            lower.includes('packed time')
          ) {
            colPackTime = idx;
          } else if (
            lower.includes('catatan') ||
            lower.includes('notes') ||
            lower.includes('ket')
          ) {
            colNotes = idx;
          }
        });
      }

      const parsed: SheetProcessedNotaRow[] = [];
      result.notaRows.forEach((r, idx) => {
        if (!r || r.length === 0 || !r.some((cell) => cell && cell.trim() !== '')) {
          return;
        }

        const no = r[0] ? r[0].trim() : String(idx + 1);
        const orderNumber = r[colOrder] ? r[colOrder].trim().toUpperCase() : '';
        const rawPlatform = r[colPlatform] ? r[colPlatform].trim() : '';
        const adminDate = r[colDate] ? r[colDate].trim() : '-';
        const adminTime = r[colTime] ? r[colTime].trim() : '-';
        const rawStatus = r[colStatus] ? r[colStatus].trim() : 'Belum Packing';
        const packingTime = r[colPackTime] ? r[colPackTime].trim() : '-';
        const notes = r[colNotes] ? r[colNotes].trim() : '';

        if (!orderNumber) return;

        // Platform deduction
        let platform: PlatformType = 'Shopee';
        if (
          rawPlatform.toLowerCase().includes('tokopedia') ||
          rawPlatform.toLowerCase().includes('tiktok') ||
          (orderNumber.length >= 16 && /^\d+$/.test(orderNumber))
        ) {
          platform = 'Tokopedia/TikTok';
        }

        // Comprehensive packing status deduction cross-referenced with:
        // 1. Sheet "Packing Reg" (via result.packingMap)
        // 2. Scanned packages in current session (packedOrders)
        // 3. Local processed notas (notas)
        // 4. Raw status & packing time from sheet
        const statusEval = evaluateNotaPackedStatus(
          rawStatus,
          packingTime,
          orderNumber,
          packedOrders,
          notas,
          result.packingMap
        );

        parsed.push({
          rowNumber: idx + 2,
          no,
          orderNumber,
          platform,
          adminDate,
          adminTime,
          isPacked: statusEval.isPacked,
          packingStatus: statusEval.resolvedStatus,
          packingTime: statusEval.resolvedTime,
          notes,
          matchedFromPackingReg: statusEval.matchedSource === 'packing_reg_sheet',
          matchedSource: statusEval.matchedSource,
          sourceSheetTab: statusEval.matchedSource === 'packing_reg_sheet' ? 'both' : 'Nota Diproses',
        });
      });

      // Also merge records from Sheet "Packing Reg" so all saved packing scan data is visible in sheet history
      const existingOrdersInParsed = new Set<string>();
      const existingNormInParsed = new Set<string>();
      parsed.forEach((p) => {
        existingOrdersInParsed.add(p.orderNumber.toUpperCase());
        const norm = normalizeOrderNumber(p.orderNumber);
        if (norm) existingNormInParsed.add(norm);
      });

      let packColOrder = 1;
      let packColPlatform = 2;
      let packColDate = 3;
      let packColTime = 4;
      let packColStatus = 5;

      if (result.packingHeaders && result.packingHeaders.length > 0) {
        result.packingHeaders.forEach((h, idx) => {
          const lower = h.trim().toLowerCase();
          if (lower.includes('pesanan') || lower.includes('resi') || lower.includes('order') || lower.includes('nota') || lower.includes('barcode')) {
            packColOrder = idx;
          } else if (lower.includes('platform') || lower.includes('ekspedisi') || lower.includes('marketplace')) {
            packColPlatform = idx;
          } else if (lower.includes('tanggal') || lower.includes('tgl') || lower.includes('date')) {
            packColDate = idx;
          } else if (lower.includes('waktu') || lower.includes('jam') || lower.includes('time') || lower.includes('scan')) {
            packColTime = idx;
          } else if (lower.includes('status') || lower.includes('kondisi')) {
            packColStatus = idx;
          }
        });
      }

      if (result.packingRows && result.packingRows.length > 0) {
        result.packingRows.forEach((r, idx) => {
          if (!r || r.length === 0 || !r.some((cell) => cell && cell.trim() !== '')) return;
          const orderNumber = (r[packColOrder] ?? r[1] ?? '').trim().toUpperCase();
          if (!orderNumber) return;
          const norm = normalizeOrderNumber(orderNumber);

          // If already in parsed, ensure it is flagged as in both sheets and packed
          if (existingOrdersInParsed.has(orderNumber) || (norm && existingNormInParsed.has(norm))) {
            const existing = parsed.find(
              (p) => p.orderNumber.toUpperCase() === orderNumber || (norm && normalizeOrderNumber(p.orderNumber) === norm)
            );
            if (existing) {
              existing.isPacked = true;
              existing.matchedFromPackingReg = true;
              existing.matchedSource = 'packing_reg_sheet';
              existing.sourceSheetTab = 'both';
              if (!existing.packingTime || existing.packingTime === '-') {
                existing.packingTime = (r[packColTime] ?? r[4] ?? '-').trim();
              }
            }
            return;
          }

          // If ONLY in Sheet Packing Reg, add it as a saved packing row
          const rawPlatform = (r[packColPlatform] ?? r[2] ?? '').trim();
          const date = (r[packColDate] ?? r[3] ?? '-').trim();
          const timestamp = (r[packColTime] ?? r[4] ?? '-').trim();
          const status = (r[packColStatus] ?? r[5] ?? 'Selesai Packing').trim();

          let platform: PlatformType = 'Shopee';
          if (
            rawPlatform.toLowerCase().includes('tokopedia') ||
            rawPlatform.toLowerCase().includes('tiktok') ||
            (orderNumber.length >= 16 && /^\d+$/.test(orderNumber))
          ) {
            platform = 'Tokopedia/TikTok';
          }

          existingOrdersInParsed.add(orderNumber);
          if (norm) existingNormInParsed.add(norm);

          parsed.push({
            rowNumber: idx + 2,
            no: r[0] ? r[0].trim() : String(parsed.length + 1),
            orderNumber,
            platform,
            adminDate: date,
            adminTime: timestamp,
            isPacked: true,
            packingStatus: status || 'Selesai Packing',
            packingTime: timestamp,
            notes: 'Tersimpan di Sheet Packing Reg',
            matchedFromPackingReg: true,
            matchedSource: 'packing_reg_sheet',
            sourceSheetTab: 'Packing Reg',
          });
        });
      }

      setSheetRows(parsed);
      setSheetLastFetchedAt(new Date());
    } catch (err: any) {
      if (isAuthExpiredError(err)) {
        console.warn('Google Sheets token expired in ProcessedNotaSection. Invalidating token.');
        invalidateStoredToken();
        if (onTokenExpired) onTokenExpired();
        setSheetError('Sesi Google Sheets telah kedaluwarsa. Silakan perbarui sesi login Google Anda.');
      } else {
        console.error('Error fetching sheet notas in ProcessedNotaSection:', err);
        setSheetError(err.message || 'Gagal membaca riwayat nota dari Google Sheet.');
      }
    } finally {
      setSheetLoading(false);
    }
  }, [accessToken, targetSpreadsheetId, targetSheetTab, onTokenExpired, packedOrders, notas]);

  // Sync / fetch on mount or when accessToken/lastSyncTimestamp change
  useEffect(() => {
    if (accessToken) {
      loadSheetData();
    }
  }, [accessToken, lastSyncTimestamp, loadSheetData]);

  // Google Sheet timeframe filtering for the top dashboard (Default: 'today' / Harian)
  const dashboardFilteredSheetRows = useMemo(() => {
    if (sheetTimeframe === 'today') {
      return sheetRows.filter((r) => isDateToday(r.adminDate, r.adminTime));
    }
    if (sheetTimeframe === 'yesterday') {
      return sheetRows.filter((r) => isDateYesterday(r.adminDate, r.adminTime));
    }
    if (sheetTimeframe === 'week') {
      return sheetRows.filter((r) => isDateThisWeek(r.adminDate, r.adminTime));
    }
    if (sheetTimeframe === 'month') {
      return sheetRows.filter((r) => isDateThisMonth(r.adminDate, r.adminTime));
    }
    return sheetRows;
  }, [sheetRows, sheetTimeframe]);

  // Google Sheet statistics for the top dashboard based on selected timeframe
  const sheetTotalCount = dashboardFilteredSheetRows.length;
  const sheetPackedCount = useMemo(() => dashboardFilteredSheetRows.filter((r) => r.isPacked).length, [dashboardFilteredSheetRows]);
  const sheetPendingCount = sheetTotalCount - sheetPackedCount;
  // Overdue count strictly within current filtered timeframe
  const sheetPeriodOverdueCount = useMemo(() => {
    return dashboardFilteredSheetRows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
      return elapsed >= currentThreshold;
    }).length;
  }, [dashboardFilteredSheetRows, nowMs, currentThreshold]);

  // Overdue count across ALL sheet rows (cumulative pendingan across all data)
  const sheetAllOverdueCount = useMemo(() => {
    return sheetRows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
      return elapsed >= currentThreshold;
    }).length;
  }, [sheetRows, nowMs, currentThreshold]);

  // Default displayed overdue count is across ALL data so pending notes are never missed
  const sheetOverdueCount = sheetAllOverdueCount;

  const sheetShopeeCount = useMemo(() => dashboardFilteredSheetRows.filter((r) => r.platform === 'Shopee').length, [dashboardFilteredSheetRows]);
  const sheetTokpedCount = useMemo(() => dashboardFilteredSheetRows.filter((r) => r.platform === 'Tokopedia/TikTok').length, [dashboardFilteredSheetRows]);
  const sheetShopeePackedCount = useMemo(
    () => dashboardFilteredSheetRows.filter((r) => r.isPacked && r.platform === 'Shopee').length,
    [dashboardFilteredSheetRows]
  );
  const sheetTokpedPackedCount = useMemo(
    () => dashboardFilteredSheetRows.filter((r) => r.isPacked && r.platform === 'Tokopedia/TikTok').length,
    [dashboardFilteredSheetRows]
  );
  const sheetShopeePendingCount = sheetShopeeCount - sheetShopeePackedCount;
  const sheetTokpedPendingCount = sheetTokpedCount - sheetTokpedPackedCount;
  const sheetProgressPercent = sheetTotalCount > 0 ? Math.round((sheetPackedCount / sheetTotalCount) * 100) : 0;

  // Counts for all timeframes for badge counters
  const sheetTodayTotal = useMemo(() => sheetRows.filter((r) => isDateToday(r.adminDate, r.adminTime)).length, [sheetRows]);
  const sheetYesterdayTotal = useMemo(() => sheetRows.filter((r) => isDateYesterday(r.adminDate, r.adminTime)).length, [sheetRows]);
  const sheetWeekTotal = useMemo(() => sheetRows.filter((r) => isDateThisWeek(r.adminDate, r.adminTime)).length, [sheetRows]);
  const sheetMonthTotal = useMemo(() => sheetRows.filter((r) => isDateThisMonth(r.adminDate, r.adminTime)).length, [sheetRows]);

  // Extract last update time for packed items (formatted HH:mm)
  const lastPackedTimeStr = useMemo(() => {
    const packedItems = dashboardFilteredSheetRows.filter((r) => r.isPacked);
    if (packedItems.length === 0) {
      if (sheetLastFetchedAt) {
        return `${String(sheetLastFetchedAt.getHours()).padStart(2, '0')}:${String(sheetLastFetchedAt.getMinutes()).padStart(2, '0')}`;
      }
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    // Check from the most recent packed item for time string
    for (let i = packedItems.length - 1; i >= 0; i--) {
      const pt = packedItems[i].packingTime;
      if (pt && pt !== '-') {
        const match = pt.match(/\b(\d{1,2}:\d{2})(?::\d{2})?\b/);
        if (match) {
          return match[1];
        }
      }
    }

    if (sheetLastFetchedAt) {
      return `${String(sheetLastFetchedAt.getHours()).padStart(2, '0')}:${String(sheetLastFetchedAt.getMinutes()).padStart(2, '0')}`;
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, [dashboardFilteredSheetRows, sheetLastFetchedAt]);

  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  const handleCopyPackingReport = async () => {
    const reportText = generatePackingReportText({
      totalCount: sheetTotalCount,
      packedCount: sheetPackedCount,
      pendingCount: sheetPendingCount,
      timeframe: sheetTimeframe,
      lastPackedTimeStr,
      customDate: new Date(),
      breakdown: {
        total: { shopee: sheetShopeeCount, tokped: sheetTokpedCount },
        packed: { shopee: sheetShopeePackedCount, tokped: sheetTokpedPackedCount },
        pending: { shopee: sheetShopeePendingCount, tokped: sheetTokpedPendingCount },
      },
    });

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = reportText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
      showToast('Report status packing berhasil disalin ke clipboard!', 'success');
    } catch {
      showToast('Gagal menyalin report ke clipboard.', 'error');
    }
  };

  const handleFilterAndScrollSheet = (status: 'all' | 'pending' | 'overdue' | 'packed') => {
    if (status === 'overdue') {
      // Switch timeframe to 'all' so that overdue notes from earlier dates are visible in the table
      setSheetTimeframe('all');
    }
    setSheetStatusFilter(status);
    const element = document.getElementById('section-nota-sheet-history');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Unified evaluation for local notas against Google Sheets 'Packing Reg' and active packing session
  const effectiveNotas = useMemo(() => {
    // Build quick lookup sets from sheetRows (which already matched "Packing Reg")
    const sheetPackedUpperSet = new Set<string>();
    const sheetPackedNormSet = new Set<string>();
    const sheetPackedTimeMap = new Map<string, string>();

    sheetRows.forEach((r) => {
      if (r.isPacked) {
        const u = r.orderNumber.trim().toUpperCase();
        const n = normalizeOrderNumber(r.orderNumber);
        if (u) sheetPackedUpperSet.add(u);
        if (n) sheetPackedNormSet.add(n);
        if (r.packingTime && r.packingTime !== '-') {
          if (u) sheetPackedTimeMap.set(u, r.packingTime);
          if (n) sheetPackedTimeMap.set(n, r.packingTime);
        }
      }
    });

    return notas.map((nota) => {
      const upper = nota.orderNumber.trim().toUpperCase();
      const norm = normalizeOrderNumber(nota.orderNumber);

      // 1. If already packed locally
      if (nota.isPacked) return nota;

      // 2. Check packedOrders from active packing session
      const matchedSession = packedOrders.find((p) => {
        const pUpper = p.orderNumber.trim().toUpperCase();
        const pNorm = normalizeOrderNumber(p.orderNumber);
        return pUpper === upper || (norm && pNorm === norm);
      });
      if (matchedSession) {
        return {
          ...nota,
          isPacked: true,
          packedAt: nota.packedAt || matchedSession.timestamp || 'Sesi Aktif',
        };
      }

      // 3. Check sheetRows (matched from Sheet Packing Reg)
      const isPackedInSheet =
        sheetPackedUpperSet.has(upper) || (norm ? sheetPackedNormSet.has(norm) : false);

      if (isPackedInSheet) {
        const time =
          sheetPackedTimeMap.get(upper) ||
          (norm ? sheetPackedTimeMap.get(norm) : undefined) ||
          'Selesai (Packing Reg)';
        return {
          ...nota,
          isPacked: true,
          packedAt: nota.packedAt || time,
        };
      }

      return nota;
    });
  }, [notas, sheetRows, packedOrders]);

  // Calculations for stats based on effectiveNotas
  const totalNotas = effectiveNotas.length;
  const packedCount = useMemo(() => effectiveNotas.filter((n) => n.isPacked).length, [effectiveNotas]);
  const pendingCount = totalNotas - packedCount;
  const progressPercent = totalNotas > 0 ? Math.round((packedCount / totalNotas) * 100) : 0;

  // Today's statistics for Google Sheet (Tab 'Nota Diproses' ↔ 'Packing Reg')
  const sheetTodayStats = useMemo(() => {
    const todayRows = sheetRows.filter((r) =>
      isDateToday(r.adminDate, r.adminTime)
    );

    const effectiveTodayRows = todayRows.length > 0 ? todayRows : sheetRows;
    const totalToday = effectiveTodayRows.length;
    const packedToday = effectiveTodayRows.filter((r) => r.isPacked).length;
    const pendingToday = totalToday - packedToday;
    const percentToday =
      totalToday > 0 ? Math.round((packedToday / totalToday) * 100) : 0;

    return { totalToday, packedToday, pendingToday, percentToday, isFilteredByDate: todayRows.length > 0 };
  }, [sheetRows]);

  // Today's statistics for active session (using effectiveNotas)
  const localTodayStats = useMemo(() => {
    const todayNotas = effectiveNotas.filter((n) =>
      isDateToday(n.date, n.timestamp, n.createdAt)
    );

    // If no notas match specific date parsing but notas exist, treat all current active session notas as today
    const effectiveTodayNotas = todayNotas.length > 0 ? todayNotas : effectiveNotas;

    const totalToday = effectiveTodayNotas.length;
    const packedToday = effectiveTodayNotas.filter((n) => n.isPacked).length;
    const pendingToday = totalToday - packedToday;
    const percentToday =
      totalToday > 0 ? Math.round((packedToday / totalToday) * 100) : 0;

    return { totalToday, packedToday, pendingToday, percentToday };
  }, [effectiveNotas]);

  // Stale/Delayed pending notas analytics
  const delayedNotas = useMemo(() => {
    return effectiveNotas.filter((n) => isNotaDelayed(n, currentThreshold, nowMs));
  }, [effectiveNotas, currentThreshold, nowMs]);

  const delayedCount = delayedNotas.length;

  const maxDelayMinutes = useMemo(() => {
    if (delayedNotas.length === 0) return 0;
    return Math.max(...delayedNotas.map((n) => getNotaElapsedMinutes(n, nowMs)));
  }, [delayedNotas, nowMs]);

  // Filtered notas list
  const filteredNotas = useMemo(() => {
    return effectiveNotas.filter((nota) => {
      // Status filter
      if (statusFilter === 'pending' && nota.isPacked) return false;
      if (statusFilter === 'overdue' && !isNotaDelayed(nota, currentThreshold, nowMs)) return false;
      if (statusFilter === 'packed' && !nota.isPacked) return false;

      // Platform filter
      if (platformFilter !== 'Semua' && nota.platform !== platformFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNo = nota.orderNumber.toLowerCase().includes(q);
        const matchPlat = nota.platform.toLowerCase().includes(q);
        const matchNotes = nota.notes?.toLowerCase().includes(q);
        if (!matchNo && !matchPlat && !matchNotes) return false;
      }

      return true;
    });
  }, [effectiveNotas, statusFilter, platformFilter, searchQuery, currentThreshold, nowMs]);

  // Single scan submission
  const handleProcessScan = (rawCode?: string) => {
    const code = (rawCode !== undefined ? rawCode : scanInput).trim().toUpperCase();
    if (!code) {
      showToast('Masukkan nomor nota / pesanan terlebih dahulu.', 'warning');
      return;
    }

    const platform =
      selectedPlatform !== 'auto' ? selectedPlatform : detectPlatform(code);

    const result = onAddNota(code, platform);

    if (result.isDuplicate) {
      soundFX.playDuplicate();
      showToast(`[DUPLIKAT] Nota ${code} sudah pernah di-scan oleh Admin!`, 'warning');
      setScanInput('');
      if (autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
      return;
    }

    if (result.success) {
      soundFX.playSuccess();
      const platLabel = platform === 'Tokopedia/TikTok' ? 'Tokopedia/TikTok' : platform;
      showToast(`Nota ${code} (${platLabel}) berhasil dicatat!`, 'success');
      setScanInput('');
      if (autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  // Batch paste parser
  const parsedBatchItems = useMemo(() => {
    if (!batchText.trim()) return [];
    const lines = batchText
      .split(/[\n,;]+/)
      .map((l) => l.trim().toUpperCase())
      .filter((l) => l.length > 0);

    const existingUpper = new Set(notas.map((n) => n.orderNumber.toUpperCase()));
    const seenInBatch = new Set<string>();

    return lines.map((code) => {
      const isExistingDup = existingUpper.has(code);
      const isBatchDup = seenInBatch.has(code);
      seenInBatch.add(code);

      const platform =
        batchPlatform !== 'auto' ? batchPlatform : detectPlatform(code);

      return {
        orderNumber: code,
        platform,
        isDuplicate: isExistingDup || isBatchDup,
      };
    });
  }, [batchText, batchPlatform, notas]);

  const batchValidCount = parsedBatchItems.filter((item) => !item.isDuplicate).length;
  const batchDuplicateCount = parsedBatchItems.length - batchValidCount;

  // Execute batch submit
  const handleExecuteBatch = () => {
    if (!parsedBatchItems.length) {
      showToast('Tempelkan nomor nota terlebih dahulu.', 'warning');
      return;
    }

    const validItems = parsedBatchItems
      .filter((i) => !i.isDuplicate)
      .map((i) => ({ orderNumber: i.orderNumber, platform: i.platform }));

    if (validItems.length === 0) {
      showToast('Semua nomor nota yang ditempel sudah terdaftar (duplikat).', 'warning');
      return;
    }

    if (onAddNotasBatch) {
      const res = onAddNotasBatch(validItems);
      soundFX.playSuccess();
      showToast(`${res.added} nota berhasil ditambahkan ke daftar antrean!`, 'success');
      setBatchText('');
    }
  };

  // Copy order number to clipboard
  const handleCopy = (text: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast(`Nomor ${text} disalin ke clipboard!`, 'info');
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Copy all pending notas for WhatsApp / Team chat
  const handleCopyPendingNotas = () => {
    const pendingList = notas.filter((n) => !n.isPacked);
    if (pendingList.length === 0) {
      showToast('Semua nota sudah selesai dipacking! Tidak ada nota pending.', 'success');
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const lines = [
      `*DAFTAR NOTA BELUM DIPACKING (${pendingList.length} PAKET)*`,
      `📅 Tanggal: ${dateStr}`,
      `⏰ Dicek jam: ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
      `----------------------------------------`,
      ...pendingList.map(
        (item, idx) =>
          `${idx + 1}. *${item.orderNumber}* (${item.platform}) - Scan Admin: ${item.timestamp}`
      ),
      `----------------------------------------`,
      `Mohon tim packing segera cek paket di atas. Terima kasih! 🙏`,
    ];

    const message = lines.join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message);
      showToast(
        `${pendingList.length} daftar nota belum packing berhasil disalin untuk WhatsApp!`,
        'success'
      );
    }
  };

  // Copy delayed / overdue notas specifically with elapsed duration
  const handleCopyDelayedNotas = () => {
    if (delayedNotas.length === 0) {
      showToast('Tidak ada nota yang tertunda melebihi batas waktu!', 'info');
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const lines = [
      `⚠️ *PERINGATAN: ${delayedNotas.length} NOTA BELUM DI-PACKING (> ${formatThresholdLabel(currentThreshold).toUpperCase()})*`,
      `📅 Tanggal: ${dateStr}`,
      `⏰ Waktu Cek: ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
      `----------------------------------------`,
      ...delayedNotas.map((item, idx) => {
        const elapsed = getNotaElapsedMinutes(item, nowMs);
        return `${idx + 1}. *${item.orderNumber}* (${item.platform}) - Scan Admin: ${item.timestamp} (⏱️ Terlambat: +${formatElapsedDuration(elapsed)})`;
      }),
      `----------------------------------------`,
      `⚠️ Mohon tim packing untuk segera memprioritaskan dan menyelesaikan paket-paket tertunda di atas! Terima kasih 🙏`,
    ];

    const message = lines.join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message);
      showToast(
        `${delayedNotas.length} nota tertunda berhasil disalin untuk WhatsApp tim packing!`,
        'warning'
      );
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (notas.length === 0) {
      showToast('Belum ada data nota untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'No',
      'No Nota / Pesanan',
      'Platform',
      'Tanggal Admin',
      'Waktu Admin',
      'Status Packing',
      'Waktu Packing',
      'Catatan',
    ];

    const rows = notas.map((n, idx) => [
      idx + 1,
      `"${n.orderNumber}"`,
      `"${n.platform}"`,
      `"${n.date}"`,
      `"${n.timestamp}"`,
      `"${n.isPacked ? 'Selesai Packing' : 'Belum Packing'}"`,
      `"${n.packedAt || '-'}"`,
      `"${n.notes || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Nota_Diproses_Admin_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('File CSV Nota Diproses berhasil diunduh.', 'success');
  };

  // Import items from Google Sheet into active scan session
  const handleImportSheetNotas = (
    items: { orderNumber: string; platform: PlatformType; notes?: string }[]
  ) => {
    if (items.length === 0) return;

    if (onAddNotasBatch) {
      const res = onAddNotasBatch(items, true);
      if (res.added > 0) {
        showToast(`${res.added} nota dari Google Sheet berhasil diimpor ke sesi aktif.`, 'success');
      } else {
        showToast('Semua nota dari sheet sudah ada di sesi scan aktif.', 'info');
      }
    } else {
      let added = 0;
      items.forEach((it) => {
        const res = onAddNota(it.orderNumber, it.platform, it.notes);
        if (res.success) added++;
      });
      if (added > 0) {
        showToast(`${added} nota dari Google Sheet dimasukkan ke sesi aktif.`, 'success');
      } else {
        showToast('Semua nota dari sheet sudah ada di sesi scan aktif.', 'info');
      }
    }
  };

  return (
    <section id="section-nota-diproses" className="space-y-6">
      {/* Header & Description */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Scan Nota (Belum Packing)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  Tahap 1 Admin
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Admin scan nota yang sudah diproses cetak. Saat bagian packing scan paket, sistem
                otomatis mendeteksi nota mana yang <strong className="text-amber-700">belum dipacking</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Top Tools */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              soundEnabled
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
            title="Efek Suara Scan"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>Suara {soundEnabled ? 'Aktif' : 'Mati'}</span>
          </button>

          {onNavigateToPacking && (
            <button
              type="button"
              onClick={onNavigateToPacking}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition-all"
            >
              <span>Scan Nota (Sudah Packing)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DASHBOARD INFO GOOGLE SHEET: Belum Packing & Sudah Packing (PALING ATAS) */}
      {/* ========================================================================= */}
      <div
        id="dashboard-sheet-summary-top"
        className="bg-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-lg border border-slate-700/80 relative overflow-hidden"
      >
        {/* Subtle background glow accents */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-10 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Dashboard Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800 relative z-10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 rounded-2xl shrink-0 shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Status Packing (Data Google Sheets)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Tab: {sheetResolvedTab}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1">
                  <span>↔ Cocok:</span>
                  <strong className="font-mono text-white">{sheetResolvedPackingTab}</strong>
                  {sheetTotalPackingInSheet > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 bg-indigo-400/30 rounded-full text-[10px] text-indigo-200">
                      {sheetTotalPackingInSheet} paket
                    </span>
                  )}
                </span>
                {accessToken ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Terhubung</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-900/60 text-amber-300 border border-amber-700">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Perlu Login</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                <span>Sinkronisasi otomatis dari sheet <strong>{sheetResolvedTab}</strong> dicocokkan langsung dengan data scan di sheet <strong>{sheetResolvedPackingTab}</strong></span>
                {sheetLastFetchedAt && (
                  <span className="text-slate-400">• Diperbarui: {sheetLastFetchedAt.toLocaleTimeString('id-ID')}</span>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons at top dashboard */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tombol Salin Report */}
            <button
              type="button"
              id="btn-copy-packing-report-top"
              onClick={handleCopyPackingReport}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md ${
                copiedReport
                  ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white'
              }`}
              title="Salin ringkasan laporan status packing ke clipboard"
            >
              {copiedReport ? (
                <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-emerald-100" />
              )}
              <span>{copiedReport ? 'Report Tersalin!' : 'Salin Report'}</span>
            </button>

            <button
              type="button"
              id="btn-refresh-sheet-top"
              onClick={() => {
                if (!accessToken && onLoginGoogle) {
                  onLoginGoogle();
                } else {
                  loadSheetData();
                }
              }}
              disabled={sheetLoading}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-600/70 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
              title="Segarkan data nota langsung dari Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${sheetLoading ? 'animate-spin' : ''}`} />
              <span>{sheetLoading ? 'Memuat...' : 'Segarkan Data'}</span>
            </button>

            <a
              href={`https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              title="Buka file Google Spreadsheet di tab baru"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka Google Sheets ↗</span>
            </a>

            <button
              type="button"
              id="btn-jump-to-sheet-table"
              onClick={() => handleFilterAndScrollSheet('all')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
              title="Gulir langsung ke tabel rincian Google Sheets"
            >
              <span>Lihat Tabel ↓</span>
            </button>
          </div>
        </div>

        {/* Timeframe Filter Bar (Default: Harian / Hari Ini, with Mingguan, Bulanan, Semua Data) */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4 relative z-10">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 px-2 py-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-emerald-400" />
              <span>Filter Periode:</span>
            </span>
            <button
              type="button"
              id="btn-timeframe-today"
              onClick={() => setSheetTimeframe('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                sheetTimeframe === 'today'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-xs ring-1 ring-emerald-300'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Harian (Hari Ini)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'today'
                    ? 'bg-emerald-900/30 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {sheetTodayTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-yesterday"
              onClick={() => setSheetTimeframe('yesterday')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                sheetTimeframe === 'yesterday'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-xs ring-1 ring-emerald-300'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Hari Kemarin</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'yesterday'
                    ? 'bg-emerald-900/30 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {sheetYesterdayTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-week"
              onClick={() => setSheetTimeframe('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                sheetTimeframe === 'week'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-xs ring-1 ring-emerald-300'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Mingguan (Minggu Ini)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'week'
                    ? 'bg-emerald-900/30 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {sheetWeekTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-month"
              onClick={() => setSheetTimeframe('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                sheetTimeframe === 'month'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-xs ring-1 ring-emerald-300'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Bulanan (Bulan Ini)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'month'
                    ? 'bg-emerald-900/30 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {sheetMonthTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-all"
              onClick={() => setSheetTimeframe('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                sheetTimeframe === 'all'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-xs ring-1 ring-emerald-300'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Semua Data</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'all'
                    ? 'bg-emerald-900/30 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {sheetRows.length}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              id="btn-copy-packing-report-bar"
              onClick={handleCopyPackingReport}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border shadow-xs ${
                copiedReport
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                  : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-500/40 hover:border-emerald-400'
              }`}
              title="Salin report sesuai filter periode aktif"
            >
              {copiedReport ? (
                <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{copiedReport ? 'Report Tersalin!' : 'Salin Report'}</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Menampilkan:</span>
              <span className="font-extrabold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                {sheetTimeframe === 'today' && 'Data Harian (Hari Ini)'}
                {sheetTimeframe === 'yesterday' && 'Data Hari Kemarin'}
                {sheetTimeframe === 'week' && 'Data Mingguan (Minggu Ini)'}
                {sheetTimeframe === 'month' && 'Data Bulanan (Bulan Ini)'}
                {sheetTimeframe === 'all' && 'Semua Riwayat Data'}
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard 4 Core Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5 relative z-10">
          {/* Card 1: BELUM PACKING (Highlighted Primary Focus) */}
          <div
            id="card-sheet-pending"
            onClick={() => handleFilterAndScrollSheet('pending')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'pending'
                ? 'bg-amber-950/70 border-amber-400 ring-2 ring-amber-400/50'
                : 'bg-amber-950/40 hover:bg-amber-950/60 border-amber-500/40'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-amber-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Belum Packing
              </span>
              <span className="px-2 py-0.5 bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded-full text-[10px] font-black">
                {sheetTotalCount > 0 ? `${Math.round((sheetPendingCount / sheetTotalCount) * 100)}%` : '0%'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight">
                {sheetLoading ? '...' : sheetPendingCount}
              </span>
              <span className="text-xs text-amber-200/80 font-medium">Nota</span>
            </div>
            <p className="text-[11px] text-amber-300/80 mt-2 flex items-center justify-between">
              <span>Menunggu dipacking</span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform">
                Filter Tabel →
              </span>
            </p>
          </div>

          {/* Card 2: SUDAH PACKING (Success Primary Focus) */}
          <div
            id="card-sheet-packed"
            onClick={() => handleFilterAndScrollSheet('packed')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'packed'
                ? 'bg-emerald-950/70 border-emerald-400 ring-2 ring-emerald-400/50'
                : 'bg-emerald-950/40 hover:bg-emerald-950/60 border-emerald-500/40'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-emerald-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Sudah Packing
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 rounded-full text-[10px] font-black">
                {sheetProgressPercent}% Selesai
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight">
                {sheetLoading ? '...' : sheetPackedCount}
              </span>
              <span className="text-xs text-emerald-200/80 font-medium">Nota</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-emerald-950 rounded-full h-1.5 mt-2.5 overflow-hidden border border-emerald-800/60">
              <div
                className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${sheetProgressPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-emerald-300/80 mt-2 flex items-center justify-between">
              <span>Telah selesai dipacking</span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform">
                Filter Tabel →
              </span>
            </p>
          </div>

          {/* Card 3: TERTUNDA > 1 HARI (Alert Overdue from Sheet - All Data Pending) */}
          <div
            id="card-sheet-overdue"
            onClick={() => handleFilterAndScrollSheet('overdue')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'overdue'
                ? 'bg-rose-950/80 border-rose-400 ring-2 ring-rose-400/50'
                : sheetAllOverdueCount > 0
                ? 'bg-rose-950/50 hover:bg-rose-950/70 border-rose-500/50'
                : 'bg-slate-800/50 hover:bg-slate-800/80 border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-rose-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className={`w-3.5 h-3.5 ${sheetAllOverdueCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                Tertunda &gt;{formatThresholdLabel(currentThreshold)}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className="px-2 py-0.5 bg-rose-500/25 text-rose-200 border border-rose-400/40 rounded-full text-[10px] font-black flex items-center gap-1 shadow-2xs"
                  title="Monitoring akumulasi semua data Google Sheet agar pendingan tidak terlewat"
                >
                  <Info className="w-3 h-3 text-rose-300 shrink-0" />
                  <span>Semua Data</span>
                </span>
                {sheetAllOverdueCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-black animate-pulse">
                    Perlu Cek!
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl sm:text-4xl font-black tracking-tight ${sheetAllOverdueCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {sheetLoading ? '...' : sheetAllOverdueCount}
              </span>
              <span className="text-xs text-slate-300 font-medium">Nota</span>
              {sheetTimeframe !== 'all' && (
                <span className="text-[10px] font-bold text-rose-300/80 ml-auto bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-500/30">
                  {sheetTimeframe === 'today'
                    ? 'Hari ini'
                    : sheetTimeframe === 'yesterday'
                    ? 'Kemarin'
                    : sheetTimeframe === 'week'
                    ? 'Minggu ini'
                    : 'Bulan ini'}
                  : {sheetPeriodOverdueCount}
                </span>
              )}
            </div>
            {/* Tanda Informasi Pendingan Semua Data */}
            <div className="mt-2.5 pt-2 border-t border-rose-500/25 flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[11px] text-rose-200">
                <span className="flex items-center gap-1 font-bold">
                  <Info className="w-3 h-3 text-rose-400 shrink-0" />
                  <span>Akumulasi Pendingan Semua Data</span>
                </span>
                <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform text-rose-300">
                  Lihat Detail →
                </span>
              </div>
              <p className="text-[10px] text-rose-300/80 leading-tight">
                Tetap memantau seluruh nota tertunda yang belum di-packing lintas tanggal agar tidak ada pesanan tertinggal.
              </p>
            </div>
          </div>

          {/* Card 4: TOTAL NOTA SESUAI PERIODE */}
          <div
            id="card-sheet-total"
            onClick={() => handleFilterAndScrollSheet('all')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'all'
                ? 'bg-indigo-950/70 border-indigo-400 ring-2 ring-indigo-400/50'
                : 'bg-slate-800/50 hover:bg-slate-800/80 border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                {sheetTimeframe === 'today'
                  ? 'Total Harian'
                  : sheetTimeframe === 'yesterday'
                  ? 'Total Kemarin'
                  : sheetTimeframe === 'week'
                  ? 'Total Mingguan'
                  : sheetTimeframe === 'month'
                  ? 'Total Bulanan'
                  : 'Total di Sheet'}
              </span>
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-[10px] font-bold">
                {sheetTimeframe === 'today'
                  ? 'Hari Ini'
                  : sheetTimeframe === 'yesterday'
                  ? 'Kemarin'
                  : sheetTimeframe === 'week'
                  ? 'Minggu Ini'
                  : sheetTimeframe === 'month'
                  ? 'Bulan Ini'
                  : 'Semua'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {sheetLoading ? '...' : sheetTotalCount}
              </span>
              <span className="text-xs text-slate-400 font-medium">Nota</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
              <span>Shopee: {sheetShopeeCount} • Tokped: {sheetTokpedCount}</span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform">
                Lihat Tabel →
              </span>
            </p>
          </div>
        </div>

        {/* Error notification if any */}
        {sheetError && (
          <div className="mt-4 p-3 bg-rose-900/60 border border-rose-700 rounded-xl text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{sheetError}</span>
          </div>
        )}
      </div>

      {/* Visual Alert Reminder Banner for Delayed / Stale Notas */}
      {delayedCount > 0 && (
        <div className="bg-rose-50/90 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-rose-500 text-white rounded-xl shrink-0 shadow-xs relative">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-rose-800 bg-rose-200/80 px-2 py-0.5 rounded-md">
                  Peringatan Keterlambatan Packing
                </span>
                <span className="text-xs text-rose-700 font-semibold">
                  Batas Waktu: {formatThresholdLabel(currentThreshold)}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-rose-950 mt-1">
                Ada {delayedCount} nota belum di-scan packing melebihi {formatThresholdLabel(currentThreshold)}!
              </h3>
              <p className="text-xs text-rose-800 mt-0.5">
                Nota terlama sudah menunggu{' '}
                <strong className="font-bold underline text-rose-950">
                  +{formatElapsedDuration(maxDelayMinutes)}
                </strong>{' '}
                sejak di-scan oleh admin. Segera hubungi atau ingatkan tim packing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
            <button
              type="button"
              id="btn-filter-delayed-notas"
              onClick={() => setStatusFilter('overdue')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                statusFilter === 'overdue'
                  ? 'bg-rose-700 text-white ring-2 ring-rose-400'
                  : 'bg-white hover:bg-rose-100 text-rose-800 border border-rose-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Lihat {delayedCount} Nota Tertunda</span>
            </button>

            <button
              type="button"
              id="btn-copy-delayed-wa-banner"
              onClick={handleCopyDelayedNotas}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
              title="Salin daftar nota tertunda untuk dikirim via WhatsApp ke tim packing"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Salin WA Tim Packing</span>
            </button>
          </div>
        </div>
      )}

      {/* Sesi Scan Nota Baru (Admin) */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Sesi Scan Nota Baru (Admin)
          </span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
            {totalNotas} nota di antrean lokal
          </span>
        </div>
        {totalNotas > 0 && onSyncGoogleSheet && (
          <button
            type="button"
            onClick={onSyncGoogleSheet}
            disabled={isSyncing}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Simpan Antrean ke Google Sheet ({totalNotas}) →</span>
          </button>
        )}
      </div>

      {/* Summary Metric Cards (Sesi Scan Lokal) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Total Nota */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-100">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Total Nota Diproses
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">
              {totalNotas}
            </span>
            <span className="text-xs font-semibold text-slate-400">Nota Terdaftar</span>
          </div>
        </div>

        {/* Belum Packing (Pending) */}
        <div className="bg-amber-50/70 border border-amber-200 p-4 sm:p-5 rounded-2xl shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
              Belum Dipacking
            </span>
            {pendingCount > 0 && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-amber-800 leading-none">
              {pendingCount}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
              {pendingCount === 0 ? 'Semua Beres' : 'Menunggu Packing'}
            </span>
          </div>
        </div>
      </div>

      {/* Threshold Configuration Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-100 px-4 py-3 rounded-2xl shadow-xs text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-800">Batas Waktu Pengingat:</span>
            <span className="text-slate-500 ml-1.5 hidden sm:inline">
              Tandai peringatan jika nota belum di-scan packing setelah:
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {DELAY_THRESHOLD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleThresholdChange(opt.value)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                currentThreshold === opt.value
                  ? 'bg-amber-600 text-white shadow-2xs ring-2 ring-amber-300'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scanner Control Box */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        {/* Scanner Mode Tabs & AutoFocus Switch */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              id="tab-scan-single-nota"
              onClick={() => setScanMode('single')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                scanMode === 'single'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ScanBarcode className="w-4 h-4 text-amber-600" />
              <span>Scan Nota (Cepat)</span>
            </button>
            <button
              type="button"
              id="tab-scan-batch-nota"
              onClick={() => setScanMode('batch_paste')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                scanMode === 'batch_paste'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4 text-amber-600" />
              <span>Batch Paste (Banyak Nota)</span>
            </button>
          </div>

          {scanMode === 'single' && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoFocus}
                onChange={(e) => setAutoFocus(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
              />
              <span>Auto-Focus Scanner Fisik</span>
            </label>
          )}
        </div>

        {/* Single Scan Mode */}
        {scanMode === 'single' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <ScanBarcode className="w-5 h-5 text-amber-600" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  id="input-nota-scanner"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleProcessScan();
                    }
                  }}
                  placeholder="Arahkan barcode scanner ke nota atau ketik nomor pesanan lalu Enter..."
                  className="w-full pl-11 pr-24 py-3 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 focus:bg-white rounded-xl text-base font-bold text-slate-900 tracking-wider placeholder:text-slate-400 placeholder:font-normal placeholder:tracking-normal transition-all outline-hidden shadow-2xs"
                  autoComplete="off"
                />
                {scanInput && (
                  <button
                    type="button"
                    onClick={() => setScanInput('')}
                    className="absolute inset-y-0 right-2 px-2.5 my-1.5 flex items-center text-xs font-bold text-slate-400 hover:text-slate-700 bg-white/80 hover:bg-white rounded-lg transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>

              <button
                type="button"
                id="btn-submit-scan-nota"
                onClick={() => handleProcessScan()}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Catat Nota</span>
              </button>
            </div>

            {/* Platform Selection & Live Helper */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-500">Platform:</span>
                <div className="flex items-center gap-1">
                  {(['auto', 'Shopee', 'Tokopedia/TikTok', 'Lainnya'] as const).map((plat) => (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => setSelectedPlatform(plat)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        selectedPlatform === plat
                          ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-transparent'
                      }`}
                    >
                      {plat === 'auto' ? 'Auto-Deteksi' : plat}
                    </button>
                  ))}
                </div>
              </div>

              {scanInput.trim() && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Terdeteksi:</span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold text-xs ${getPlatformColor(
                      liveDetectedPlatform
                    )}`}
                  >
                    {liveDetectedPlatform}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Batch Paste Mode */
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="textarea-batch-nota"
                  className="text-xs font-bold text-slate-700 uppercase tracking-wider"
                >
                  Tempel Banyak Nomor Nota (1 Baris = 1 Nota)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Platform:</span>
                  <select
                    value={batchPlatform}
                    onChange={(e) => setBatchPlatform(e.target.value as any)}
                    className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 outline-hidden"
                  >
                    <option value="auto">Auto-Deteksi (Rekomendasi)</option>
                    <option value="Shopee">Shopee</option>
                    <option value="Tokopedia/TikTok">Tokopedia/TikTok</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              <textarea
                id="textarea-batch-nota"
                rows={5}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder="Contoh:&#10;240909A1B2C3&#10;SPXID048291823&#10;INV/2026/09/09/TKP/12345"
                className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 focus:bg-white rounded-xl text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-hidden transition-all"
              />
            </div>

            {/* Batch Status Preview */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
                <span>
                  Total Baris: <strong className="text-slate-900">{parsedBatchItems.length}</strong>
                </span>
                <span>•</span>
                <span className="text-emerald-700">
                  Nota Baru: <strong className="text-emerald-800 font-bold">{batchValidCount}</strong>
                </span>
                {batchDuplicateCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-700">
                      Duplikat: <strong>{batchDuplicateCount}</strong> (dilewati)
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                id="btn-execute-batch-nota"
                onClick={handleExecuteBatch}
                disabled={batchValidCount === 0}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  batchValidCount > 0
                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambahkan {batchValidCount} Nota Baru</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table & Filter Tools */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden space-y-4 p-5 sm:p-6">
        {/* Ringkasan Statistik di Atas Tabel Nota Diproses */}
        <div
          id="mini-stats-local-table"
          className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2.5 mb-3 border-b border-slate-200/80">
            <div className="flex flex-wrap items-center gap-2">
              <div className="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Ringkasan Status Nota Hari Ini
              </span>
              <span className="text-xs text-slate-500 font-medium hidden md:inline">
                ({new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })})
              </span>
            </div>

            {/* Source Switcher if Google Sheets has data */}
            {sheetRows.length > 0 && (
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/80 shadow-2xs">
                <button
                  type="button"
                  id="tab-today-source-sheet"
                  onClick={() => setTodayStatsSource('sheet')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                    todayStatsSource === 'sheet'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>Google Sheet ({sheetTodayStats.totalToday})</span>
                </button>
                <button
                  type="button"
                  id="tab-today-source-local"
                  onClick={() => setTodayStatsSource('local')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                    todayStatsSource === 'local'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>Sesi Scan Lokal ({localTodayStats.totalToday})</span>
                </button>
              </div>
            )}

            {sheetRows.length === 0 && (
              <span className="text-[11px] font-semibold text-slate-500">
                {localTodayStats.totalToday} nota dalam sesi scan aktif
              </span>
            )}
          </div>

          {/* Active Statistics Cards based on selected source */}
          {todayStatsSource === 'sheet' && sheetRows.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2 text-[11px] font-semibold text-emerald-800 bg-emerald-50/80 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                <span>
                  Sumber Data: <strong>Sheet &quot;Nota Diproses&quot;</strong> dicocokkan langsung dengan <strong>Sheet &quot;Packing Reg&quot;</strong>
                </span>
                <span className="font-bold">
                  {sheetTodayStats.percentToday}% Terpacking
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {/* Total Sheet Hari Ini */}
                <div
                  id="card-sheet-today-total"
                  onClick={() => handleFilterAndScrollSheet('all')}
                  className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between group"
                  title="Lihat semua riwayat nota di tabel Google Sheet"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Total Nota Sheet
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-slate-900 leading-tight">
                          {sheetTodayStats.totalToday}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">Nota</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
                    Lihat Tabel
                  </span>
                </div>

                {/* Sudah Packing (Cocok dengan Packing Reg) */}
                <div
                  id="card-sheet-today-packed"
                  onClick={() => handleFilterAndScrollSheet('packed')}
                  className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/90 shadow-2xs hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between group"
                  title="Filter nota yang sudah selesai dipacking"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                        Sudah Dipacking
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-emerald-800 leading-tight">
                          {sheetTodayStats.packedToday}
                        </span>
                        <span className="text-xs text-emerald-700 font-semibold">Nota</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-900 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                    {sheetTodayStats.percentToday}% Selesai
                  </span>
                </div>

                {/* Belum Packing */}
                <div
                  id="card-sheet-today-pending"
                  onClick={() => handleFilterAndScrollSheet('pending')}
                  className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/90 shadow-2xs hover:border-amber-300 transition-all cursor-pointer flex items-center justify-between group"
                  title="Filter nota yang belum dipacking"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                        Belum Packing
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-amber-800 leading-tight">
                          {sheetTodayStats.pendingToday}
                        </span>
                        <span className="text-xs text-amber-700 font-semibold">Nota</span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      sheetTodayStats.pendingToday > 0
                        ? 'bg-amber-200 text-amber-900'
                        : 'bg-emerald-200 text-emerald-900'
                    }`}
                  >
                    {sheetTodayStats.pendingToday > 0 ? 'Menunggu' : 'Beres'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2 text-[11px] font-semibold text-slate-600 bg-slate-100/80 px-2.5 py-1 rounded-lg border border-slate-200/60">
                <span>
                  Sumber Data: <strong>Sesi Scan Antrian Lokal</strong> (Otomatis disinkronkan dengan status Packing Reg)
                </span>
                <span className="font-bold text-indigo-700">
                  {localTodayStats.percentToday}% Selesai
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {/* Total Nota Hari Ini */}
                <div
                  id="card-local-today-total"
                  onClick={() => setStatusFilter('all')}
                  className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs hover:border-indigo-300 transition-all cursor-pointer flex items-center justify-between group"
                  title="Tampilkan semua nota"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Total Hari Ini
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-slate-900 leading-tight">
                          {localTodayStats.totalToday}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">Nota</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    Semua
                  </span>
                </div>

                {/* Sudah Selesai */}
                <div
                  id="card-local-today-packed"
                  onClick={() => setStatusFilter('packed')}
                  className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/90 shadow-2xs hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between group"
                  title="Filter nota sudah selesai"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                        Sudah Selesai
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-emerald-800 leading-tight">
                          {localTodayStats.packedToday}
                        </span>
                        <span className="text-xs text-emerald-700 font-semibold">Nota</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-900 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                    {localTodayStats.percentToday}% Selesai
                  </span>
                </div>

                {/* Pending */}
                <div
                  id="card-local-today-pending"
                  onClick={() => setStatusFilter('pending')}
                  className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/90 shadow-2xs hover:border-amber-300 transition-all cursor-pointer flex items-center justify-between group"
                  title="Filter nota belum selesai (pending)"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                        Pending
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-amber-800 leading-tight">
                          {localTodayStats.pendingToday}
                        </span>
                        <span className="text-xs text-amber-700 font-semibold">Nota</span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      localTodayStats.pendingToday > 0
                        ? 'bg-amber-200 text-amber-900 animate-pulse'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {localTodayStats.pendingToday > 0 ? 'Menunggu' : 'Beres'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({totalNotas})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'pending'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-800 hover:bg-amber-100/70'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Belum Packing ({pendingCount})</span>
            </button>
            <button
              type="button"
              id="btn-filter-tab-overdue"
              onClick={() => setStatusFilter('overdue')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'overdue'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : delayedCount > 0
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${delayedCount > 0 && statusFilter !== 'overdue' ? 'text-rose-600' : ''}`} />
              <span>Tertunda &gt;{formatThresholdLabel(currentThreshold)} ({delayedCount})</span>
              {delayedCount > 0 && statusFilter !== 'overdue' && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('packed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'packed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-800 hover:bg-emerald-100/70'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Sudah Selesai ({packedCount})</span>
            </button>
          </div>

          {/* Search Box & Platform Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nomor nota..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-amber-500 outline-hidden transition-all"
              />
            </div>

            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-hidden"
            >
              <option value="Semua">Semua Platform</option>
              <option value="Shopee">Shopee</option>
              <option value="Tokopedia/TikTok">Tokopedia/TikTok</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            {/* Primary Action Button: Simpan Data (Big & Prominent) */}
            {onSyncGoogleSheet && (
              <button
                type="button"
                id="btn-sync-nota-sheet"
                onClick={onSyncGoogleSheet}
                disabled={isSyncing || totalNotas === 0}
                className={`group flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3 sm:py-3.5 rounded-2xl text-sm sm:text-base font-black transition-all cursor-pointer ${
                  totalNotas > 0 && !isSyncing
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-700/25 active:scale-[0.98] ring-4 ring-emerald-500/20 hover:ring-emerald-500/30'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                }`}
                title="Langkah Berikutnya: Simpan seluruh data nota yang telah discan ke Google Sheet"
              >
                <CloudUpload
                  className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                    totalNotas > 0 && !isSyncing ? 'animate-bounce text-emerald-100' : 'text-slate-400'
                  }`}
                />
                <span className="tracking-wide">
                  {isSyncing ? 'Menyimpan Data...' : 'Simpan Data'}
                </span>
                {totalNotas > 0 && !isSyncing && (
                  <span className="bg-emerald-800/90 text-emerald-100 text-xs px-2.5 py-0.5 rounded-full font-bold ml-0.5">
                    {totalNotas} Nota
                  </span>
                )}
                {totalNotas > 0 && !isSyncing && (
                  <ArrowRight className="w-4 h-4 shrink-0 text-emerald-200 transition-transform group-hover:translate-x-1" />
                )}
              </button>
            )}

            {/* Quick Copy Delayed Notas specifically if any */}
            {delayedCount > 0 && (
              <button
                type="button"
                id="btn-copy-delayed-toolbar"
                onClick={handleCopyDelayedNotas}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-200 shadow-2xs transition-all cursor-pointer"
                title="Salin daftar khusus nota tertunda untuk dikirim ke tim packing via WhatsApp"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Salin {delayedCount} Nota Tertunda (WA)</span>
              </button>
            )}
          </div>

          {/* Reset / Clear List */}
          {totalNotas > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer self-end sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Daftar Nota</span>
            </button>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">No. Nota / Pesanan</th>
                <th className="py-3 px-4">Platform</th>
                <th className="py-3 px-4">Waktu Admin Scan</th>
                <th className="py-3 px-4 text-center">Status Packing</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {filteredNotas.length > 0 ? (
                filteredNotas.map((nota, index) => {
                  const elapsedMinutes = getNotaElapsedMinutes(nota, nowMs);
                  const isOverdue = !nota.isPacked && elapsedMinutes >= currentThreshold;

                  return (
                    <tr
                      key={nota.id}
                      className={`transition-colors ${
                        isOverdue
                          ? 'bg-rose-50/80 hover:bg-rose-100/80 border-l-4 border-l-rose-500 shadow-2xs'
                          : nota.isPacked
                          ? 'bg-emerald-50/20 hover:bg-slate-50'
                          : 'bg-amber-50/10 hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                        <div>{index + 1}</div>
                        {isOverdue && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-200 text-rose-900 uppercase">
                            Late
                          </span>
                        )}
                      </td>

                      {/* Order Number with Copy */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 tracking-wide">
                        <div className="flex items-center gap-2">
                          {isOverdue && (
                            <AlertTriangle
                              className="w-4 h-4 text-rose-600 animate-pulse shrink-0"
                              title={`Tertunda > ${formatThresholdLabel(currentThreshold)} (+${formatElapsedDuration(elapsedMinutes)})`}
                            />
                          )}
                          <span className={isOverdue ? 'text-rose-950 font-black' : ''}>
                            {nota.orderNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(nota.orderNumber, nota.id)}
                            className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-md transition-all"
                            title="Salin nomor"
                          >
                            {copiedId === nota.id ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Platform Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md font-bold text-[11px] ${getPlatformColor(
                            nota.platform
                          )}`}
                        >
                          {nota.platform}
                        </span>
                      </td>

                      {/* Admin Timestamp */}
                      <td className="py-3 px-4 text-slate-600">
                        <div>{nota.timestamp}</div>
                        {!nota.isPacked ? (
                          <div
                            className={`text-[10px] font-bold flex items-center gap-1 mt-0.5 ${
                              isOverdue ? 'text-rose-700 animate-pulse font-extrabold' : 'text-amber-700'
                            }`}
                          >
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            <span>+{formatElapsedDuration(elapsedMinutes)} lalu</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">{nota.date}</div>
                        )}
                      </td>

                      {/* Packing Status Badge */}
                      <td className="py-3 px-4 text-center">
                        {nota.isPacked ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sudah Packing</span>
                            </div>
                            {nota.packedAt && (
                              <span className="text-[10px] font-semibold text-emerald-700">
                                {nota.packedAt.includes('Packing Reg') ? '✓ Tercatat di Sheet Packing Reg' : nota.packedAt}
                              </span>
                            )}
                          </div>
                        ) : isOverdue ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>⚠️ Tertunda (+{formatElapsedDuration(elapsedMinutes)})</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                            <Clock className="w-3.5 h-3.5 text-amber-700" />
                            <span>Belum Packing</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onTogglePackedStatus(nota.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                              nota.isPacked
                                ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                : isOverdue
                                ? 'border-rose-300 bg-rose-100/70 text-rose-900 hover:bg-rose-200'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            }`}
                            title={
                              nota.isPacked
                                ? 'Ubah ke status Belum Packing'
                                : 'Tandai manual sudah selesai packing'
                            }
                          >
                            {nota.isPacked ? 'Tandai Belum' : 'Tandai Selesai'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveNota(nota.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Hapus nota ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-slate-700 text-sm">
                        {searchQuery || statusFilter !== 'all' || platformFilter !== 'Semua'
                          ? 'Tidak ada nota yang cocok dengan filter atau pencarian'
                          : 'Belum ada nota yang di-scan oleh Admin'}
                      </div>
                      <p className="text-xs text-slate-500">
                        {searchQuery || statusFilter !== 'all' || platformFilter !== 'Semua'
                          ? 'Coba ganti kata kunci pencarian atau setel filter ke "Semua".'
                          : 'Scan nota atau barcode pesanan yang sudah diproses admin di atas untuk memulai pencatatan dan verifikasi packing.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Banner Pintasan Menu Riwayat Google Sheet */}
      {onNavigateToSheetHistory && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3 text-emerald-950">
            <div className="p-2.5 bg-white rounded-xl text-emerald-600 shadow-2xs border border-emerald-100 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900">
                Riwayat Google Sheet Kini Berada di Tab Menu Khusus
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Lihat data arsip, filter status packing, dan salin laporan tanpa perlu scroll ke bawah.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToSheetHistory}
            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <span>Buka Menu Riwayat Google Sheet</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmation Modal to Clear All Notas */}
      <AnimatePresence>
        {confirmClearOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2.5 bg-rose-50 rounded-xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Reset Seluruh Daftar Nota?</h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-600">
                Tindakan ini akan menghapus <strong>{totalNotas} data nota</strong> yang tersimpan di aplikasi.
                Pastikan Anda sudah menyimpan data ke Google Sheet jika diperlukan.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearNotas();
                    setConfirmClearOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all"
                >
                  Ya, Hapus Semua Nota
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};
