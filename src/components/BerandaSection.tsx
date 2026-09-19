import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Filter,
  Calendar,
  Layers,
  Info,
  ArrowRight,
  TrendingUp,
  Percent,
  Boxes,
  PackageCheck,
} from 'lucide-react';
import {
  PlatformType,
  PackedOrder,
  ProcessedNota,
  ToastItem,
  ToastOptions,
  ActiveSpreadsheet,
  ActiveTab,
  SheetProcessedNotaRow,
} from '../types';
import { fetchCrossReferencedNotasAndPacking } from '../services/googleWorkspace';
import { isAuthExpiredError, invalidateStoredToken } from '../services/googleAuth';
import {
  parseNotaDateTime,
  formatElapsedDuration,
  formatThresholdLabel,
  DEFAULT_DELAY_THRESHOLD_MINUTES,
  evaluateNotaPackedStatus,
  isDateToday,
  isDateYesterday,
  isDateThisWeek,
  isDateThisMonth,
  normalizeOrderNumber,
  generatePackingReportText,
} from '../utils/notaDelay';
import { getPlatformColor } from '../utils/platformDetector';
import { SheetOrderListModal } from './SheetOrderListModal';

interface BerandaSectionProps {
  accessToken: string | null;
  userEmail?: string | null;
  onLoginGoogle: () => void;
  onTokenExpired?: () => void;
  targetSpreadsheetId: string;
  targetNotaTab: string;
  targetPackingTab: string;
  lastSyncTimestamp?: number;
  delayThreshold?: number;
  showToast: (
    msg: string,
    type?: ToastItem['type'],
    options?: ToastOptions
  ) => void;
  onNavigateToTab: (tab: ActiveTab, subFilter?: 'all' | 'pending' | 'overdue' | 'packed') => void;
  packedOrders: PackedOrder[];
  localNotas: ProcessedNota[];
  activeSpreadsheet: ActiveSpreadsheet | null;
  showRekapTab?: boolean;
  rekapTotalCount?: number;
  onMarkOrdersAsPacked?: (
    items: { orderNumber: string; platform: PlatformType; rowNumber?: number; adminDate?: string }[]
  ) => Promise<{ success: boolean; count: number }> | Promise<any> | void;
  onMarkOrdersAsUnpacked?: (
    items: { orderNumber: string; platform: PlatformType; rowNumber?: number; adminDate?: string }[]
  ) => Promise<{ success: boolean; count: number }> | Promise<any> | void;
}

export const BerandaSection: React.FC<BerandaSectionProps> = ({
  accessToken,
  userEmail,
  onLoginGoogle,
  onTokenExpired,
  targetSpreadsheetId,
  targetNotaTab,
  targetPackingTab,
  lastSyncTimestamp,
  delayThreshold = DEFAULT_DELAY_THRESHOLD_MINUTES,
  showToast,
  onNavigateToTab,
  packedOrders,
  localNotas,
  activeSpreadsheet,
  showRekapTab = false,
  rekapTotalCount = 0,
  onMarkOrdersAsPacked,
  onMarkOrdersAsUnpacked,
}) => {
  // Clock tick state to update relative elapsed times periodically
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Google Sheet state for live dashboard
  const [sheetRows, setSheetRows] = useState<SheetProcessedNotaRow[]>([]);
  const [sheetLoading, setSheetLoading] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetLastFetchedAt, setSheetLastFetchedAt] = useState<Date | null>(null);
  const [sheetResolvedTab, setSheetResolvedTab] = useState<string>(targetNotaTab);
  const [sheetResolvedPackingTab, setSheetResolvedPackingTab] = useState<string>(targetPackingTab);
  const [sheetTotalPackingInSheet, setSheetTotalPackingInSheet] = useState<number>(0);
  const [sheetStatusFilter, setSheetStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'packed'>('all');
  const [sheetTimeframe, setSheetTimeframe] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [activeModalType, setActiveModalType] = useState<'all' | 'pending' | 'overdue' | 'packed' | null>(null);

  // Cached raw sheet result and state refs to prevent redundant Google Sheets API calls
  const rawSheetResultRef = useRef<any | null>(null);
  const packedOrdersRef = useRef(packedOrders);
  useEffect(() => {
    packedOrdersRef.current = packedOrders;
  }, [packedOrders]);

  const localNotasRef = useRef(localNotas);
  useEffect(() => {
    localNotasRef.current = localNotas;
  }, [localNotas]);

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
        targetNotaTab,
        targetPackingTab
      );
      rawSheetResultRef.current = result;
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
          // 1. Specific Pack Time
          if (
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
          }
          // 2. Specific Status Packing
          else if (
            lower.includes('status packing') ||
            lower === 'status' ||
            lower.startsWith('status') ||
            lower.includes('kondisi')
          ) {
            colStatus = idx;
          }
          // 3. Notes / Keterangan
          else if (
            lower.includes('catatan') ||
            lower.includes('keterangan') ||
            lower.includes('notes') ||
            lower === 'ket'
          ) {
            colNotes = idx;
          }
          // 4. Order Number
          else if (
            lower.includes('nota') ||
            lower.includes('pesanan') ||
            lower.includes('order') ||
            lower.includes('resi') ||
            lower.includes('barcode')
          ) {
            colOrder = idx;
          }
          // 5. Platform
          else if (
            lower.includes('platform') ||
            lower.includes('ekspedisi') ||
            lower.includes('marketplace') ||
            lower.includes('toko') ||
            lower.includes('channel')
          ) {
            colPlatform = idx;
          }
          // 6. Admin Date
          else if (
            lower.includes('tanggal') ||
            lower.includes('tgl') ||
            lower.includes('date')
          ) {
            colDate = idx;
          }
          // 7. Admin Time
          else if (
            lower.includes('waktu admin') ||
            lower.includes('jam admin') ||
            lower.includes('waktu input') ||
            lower.includes('jam input') ||
            lower === 'waktu' ||
            lower === 'jam' ||
            lower === 'time'
          ) {
            colTime = idx;
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

        let platform: PlatformType = 'Shopee';
        if (
          rawPlatform.toLowerCase().includes('tokopedia') ||
          rawPlatform.toLowerCase().includes('tiktok') ||
          (orderNumber.length >= 16 && /^\d+$/.test(orderNumber))
        ) {
          platform = 'Tokopedia/TikTok';
        }

        const statusEval = evaluateNotaPackedStatus(
          rawStatus,
          packingTime,
          orderNumber,
          packedOrders,
          localNotas,
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

      // Also merge records from Sheet "Packing Reg" so all saved packing scan data is visible
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
          const status = (r[packColStatus] ?? r[5] ?? '').trim();
          // Skip if Packing Reg explicitly marks it as canceled, belum, or dibatalkan
          if (/^(batal|dibatalkan|cancel|cancelled|belum)/i.test(status)) {
            return;
          }

          const orderNumber = (r[packColOrder] ?? r[1] ?? '').trim().toUpperCase();
          if (!orderNumber) return;
          const norm = normalizeOrderNumber(orderNumber);

          if (existingOrdersInParsed.has(orderNumber) || (norm && existingNormInParsed.has(norm))) {
            const existing = parsed.find(
              (p) => p.orderNumber.toUpperCase() === orderNumber || (norm && normalizeOrderNumber(p.orderNumber) === norm)
            );
            if (existing) {
              existing.isPacked = true;
              existing.matchedFromPackingReg = true;
              existing.matchedSource = 'packing_reg_sheet';
              if (r[packColTime] && (!existing.packingTime || existing.packingTime === '-')) {
                existing.packingTime = r[packColTime].trim();
              }
              if (r[packColStatus]) {
                existing.packingStatus = r[packColStatus].trim();
              }
            }
          } else {
            const rawPlatform = (r[packColPlatform] ?? r[2] ?? '').trim();
            let platform: PlatformType = 'Shopee';
            if (
              rawPlatform.toLowerCase().includes('tokopedia') ||
              rawPlatform.toLowerCase().includes('tiktok') ||
              (orderNumber.length >= 16 && /^\d+$/.test(orderNumber))
            ) {
              platform = 'Tokopedia/TikTok';
            }

            const pDate = r[packColDate] ? r[packColDate].trim() : '-';
            const pTime = r[packColTime] ? r[packColTime].trim() : '-';

            parsed.push({
              rowNumber: idx + 2,
              no: `P-${idx + 1}`,
              orderNumber,
              platform,
              adminDate: pDate,
              adminTime: pTime,
              isPacked: true,
              packingStatus: 'Sudah Packing',
              packingTime: pTime,
              notes: 'Terekam di Packing Reg',
              matchedFromPackingReg: true,
              matchedSource: 'packing_reg_sheet',
              sourceSheetTab: 'Packing Reg',
            });
          }
        });
      }

      setSheetRows(parsed);
      setSheetLastFetchedAt(new Date());
    } catch (err: any) {
      if (isAuthExpiredError(err)) {
        console.warn('Google Sheets session is unauthenticated or expired in Beranda. Invalidating token.');
        invalidateStoredToken();
        if (onTokenExpired) onTokenExpired();
        setSheetError('Sesi Google Sheets memerlukan otentikasi. Silakan klik "Hubungkan Akun Google".');
      } else {
        console.error('Error fetching sheet rows in Beranda:', err);
        setSheetError(err.message || 'Gagal memuat data dari Google Sheets');
      }
    } finally {
      setSheetLoading(false);
    }
  }, [accessToken, targetSpreadsheetId, targetNotaTab, targetPackingTab, onTokenExpired]);

  // Load sheet data on initial mount or when spreadsheet/sync occurs
  useEffect(() => {
    if (accessToken) {
      loadSheetData();
    }
  }, [accessToken, targetSpreadsheetId, targetNotaTab, targetPackingTab, lastSyncTimestamp, loadSheetData]);

  // Instantly re-evaluate status of loaded sheet rows in-memory when orders are scanned locally (zero API calls)
  useEffect(() => {
    if (!rawSheetResultRef.current) return;
    setSheetRows((prevRows) => {
      if (!prevRows || prevRows.length === 0) return prevRows;
      const packingMap = rawSheetResultRef.current?.packingMap;
      return prevRows.map((r) => {
        const evalRes = evaluateNotaPackedStatus(
          r.packingStatus,
          r.packingTime,
          r.orderNumber,
          packedOrders,
          localNotas,
          packingMap
        );
        if (evalRes.isPacked !== r.isPacked || evalRes.resolvedStatus !== r.packingStatus) {
          return {
            ...r,
            isPacked: evalRes.isPacked,
            packingStatus: evalRes.resolvedStatus,
            packingTime: evalRes.resolvedTime || r.packingTime,
            matchedFromPackingReg: evalRes.matchedSource === 'packing_reg_sheet' || r.matchedFromPackingReg,
            matchedSource: evalRes.matchedSource || r.matchedSource,
          };
        }
        return r;
      });
    });
  }, [packedOrders, localNotas]);

  // 5-minute auto-refresh cycle (300 seconds)
  const REFRESH_INTERVAL_SECONDS = 300;
  const [countdown, setCountdown] = useState<number>(REFRESH_INTERVAL_SECONDS);

  const sheetLoadingRef = useRef(sheetLoading);
  useEffect(() => {
    sheetLoadingRef.current = sheetLoading;
  }, [sheetLoading]);

  const loadSheetDataRef = useRef(loadSheetData);
  useEffect(() => {
    loadSheetDataRef.current = loadSheetData;
  }, [loadSheetData]);

  // Reset countdown on manual or background sync
  useEffect(() => {
    setCountdown(REFRESH_INTERVAL_SECONDS);
  }, [lastSyncTimestamp]);

  // Auto-refresh interval every 5 minutes
  useEffect(() => {
    if (!accessToken) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (!sheetLoadingRef.current) {
            loadSheetDataRef.current();
          }
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [accessToken]);

  const handleManualRefresh = () => {
    if (!accessToken) {
      onLoginGoogle();
    } else {
      setCountdown(REFRESH_INTERVAL_SECONDS);
      loadSheetData();
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Handler to mark orders as packed directly from SheetOrderListModal
  const handleMarkOrdersAsPackedFromModal = async (
    items: { orderNumber: string; platform: PlatformType; rowNumber?: number; adminDate?: string }[]
  ) => {
    const timeStr = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const orderSet = new Set(items.map((i) => i.orderNumber.toUpperCase()));

    // Optimistically update sheetRows immediately in local state
    setSheetRows((prev) =>
      prev.map((row) => {
        if (orderSet.has(row.orderNumber.toUpperCase())) {
          return {
            ...row,
            isPacked: true,
            packingStatus: 'Sudah Packing',
            packingTime: timeStr,
            matchedSource: 'packing_reg_sheet',
          };
        }
        return row;
      })
    );

    if (onMarkOrdersAsPacked) {
      const res = await onMarkOrdersAsPacked(items);
      return res;
    }
  };

  // Handler to revert orders to unpacked directly from SheetOrderListModal
  const handleMarkOrdersAsUnpackedFromModal = async (
    items: { orderNumber: string; platform: PlatformType; rowNumber?: number; adminDate?: string }[]
  ) => {
    const orderSet = new Set(items.map((i) => i.orderNumber.toUpperCase()));

    // Optimistically update sheetRows immediately in local state
    setSheetRows((prev) =>
      prev.map((row) => {
        if (orderSet.has(row.orderNumber.toUpperCase())) {
          return {
            ...row,
            isPacked: false,
            packingStatus: 'Belum Packing',
            packingTime: '-',
            matchedFromPackingReg: false,
            matchedSource: undefined,
          };
        }
        return row;
      })
    );

    if (onMarkOrdersAsUnpacked) {
      const res = await onMarkOrdersAsUnpacked(items);
      return res;
    }
  };

  // Filtered rows for the top dashboard based on timeframe
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

  // Summary counts for the top dashboard
  const sheetTotalCount = dashboardFilteredSheetRows.length;
  const sheetPackedCount = useMemo(
    () => dashboardFilteredSheetRows.filter((r) => r.isPacked).length,
    [dashboardFilteredSheetRows]
  );
  const sheetPendingCount = sheetTotalCount - sheetPackedCount;

  // Overdue count strictly within current filtered timeframe
  const sheetPeriodOverdueCount = useMemo(() => {
    return dashboardFilteredSheetRows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
      return elapsed >= delayThreshold;
    }).length;
  }, [dashboardFilteredSheetRows, nowMs, delayThreshold]);

  // Overdue count across ALL sheet rows (cumulative pendingan across all data)
  const sheetAllOverdueCount = useMemo(() => {
    return sheetRows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
      return elapsed >= delayThreshold;
    }).length;
  }, [sheetRows, nowMs, delayThreshold]);

  // Overdue list across all data (for quick attention section)
  const sheetAllOverdueList = useMemo(() => {
    return sheetRows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
      return elapsed >= delayThreshold;
    });
  }, [sheetRows, nowMs, delayThreshold]);

  const sheetShopeeCount = useMemo(
    () => dashboardFilteredSheetRows.filter((r) => r.platform === 'Shopee').length,
    [dashboardFilteredSheetRows]
  );
  const sheetTokpedCount = useMemo(
    () => dashboardFilteredSheetRows.filter((r) => r.platform === 'Tokopedia/TikTok').length,
    [dashboardFilteredSheetRows]
  );
  const sheetShopeePackedCount = useMemo(
    () => dashboardFilteredSheetRows.filter((r) => r.platform === 'Shopee' && r.isPacked).length,
    [dashboardFilteredSheetRows]
  );
  const sheetTokpedPackedCount = useMemo(
    () => dashboardFilteredSheetRows.filter((r) => r.platform === 'Tokopedia/TikTok' && r.isPacked).length,
    [dashboardFilteredSheetRows]
  );
  const sheetShopeePendingCount = sheetShopeeCount - sheetShopeePackedCount;
  const sheetTokpedPendingCount = sheetTokpedCount - sheetTokpedPackedCount;

  // Counts for each timeframe
  const sheetTodayTotal = useMemo(
    () => sheetRows.filter((r) => isDateToday(r.adminDate, r.adminTime)).length,
    [sheetRows]
  );
  const sheetYesterdayTotal = useMemo(
    () => sheetRows.filter((r) => isDateYesterday(r.adminDate, r.adminTime)).length,
    [sheetRows]
  );
  const sheetWeekTotal = useMemo(
    () => sheetRows.filter((r) => isDateThisWeek(r.adminDate, r.adminTime)).length,
    [sheetRows]
  );
  const sheetMonthTotal = useMemo(
    () => sheetRows.filter((r) => isDateThisMonth(r.adminDate, r.adminTime)).length,
    [sheetRows]
  );

  const sheetProgressPercent =
    sheetTotalCount > 0 ? Math.round((sheetPackedCount / sheetTotalCount) * 100) : 0;

  // Formatted string of latest packed timestamp
  const lastPackedTimeStr = useMemo(() => {
    const packedList = dashboardFilteredSheetRows.filter(
      (r) => r.isPacked && r.packingTime && r.packingTime !== '-'
    );
    if (packedList.length > 0) {
      const last = packedList[packedList.length - 1];
      return `${last.packingTime} (${last.orderNumber})`;
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, [dashboardFilteredSheetRows]);

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
      showToast('Laporan status packing berhasil disalin ke clipboard!', 'success');
      setTimeout(() => setCopiedReport(false), 2500);
    } catch {
      showToast('Gagal menyalin laporan packing.', 'error');
    }
  };

  const sheetTimeframeLabel = useMemo(() => {
    switch (sheetTimeframe) {
      case 'today':
        return 'Harian (Hari Ini)';
      case 'yesterday':
        return 'Hari Kemarin';
      case 'week':
        return 'Mingguan (Minggu Ini)';
      case 'month':
        return 'Bulanan (Bulan Ini)';
      case 'all':
      default:
        return 'Semua Data';
    }
  }, [sheetTimeframe]);

  const handleCardClick = (filter: 'all' | 'pending' | 'overdue' | 'packed') => {
    setSheetStatusFilter(filter);
    setActiveModalType(filter);
  };

  return (
    <section id="section-beranda" className="space-y-6">
      {/* ========================================================================= */}
      {/* DASHBOARD INFO GOOGLE SHEET: Belum Packing & Sudah Packing (PINDAHAN UTAMA) */}
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
                  Status Paket
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Tab: {sheetResolvedTab}
                </span>
                {sheetLastFetchedAt && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    Diperbarui {sheetLastFetchedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons at top dashboard */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tombol Segarkan Google Sheets */}
            <button
              type="button"
              id="btn-beranda-refresh-data"
              onClick={handleManualRefresh}
              disabled={sheetLoading}
              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 hover:text-white disabled:opacity-50 cursor-pointer shadow-xs"
              title="Segarkan data terbaru dari Google Sheets (Otomatis setiap 5 menit)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${sheetLoading ? 'animate-spin' : ''}`} />
              <span>{sheetLoading ? 'Menyinkron...' : 'Segarkan Google Sheets'}</span>
              {accessToken && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  title="Otomatis diperbarui setiap 5 menit"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>{formatCountdown(countdown)}</span>
                </span>
              )}
            </button>

            {/* Tombol Salin Report Tunggal */}
            <button
              type="button"
              id="btn-copy-packing-report-top"
              onClick={handleCopyPackingReport}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
        </div>

        {/* Hero Performance Card & Breakdown Grid */}
        <div
          id="packing-performance-summary-top"
          className="mt-5 bg-slate-800/80 rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md relative overflow-hidden space-y-4 z-10"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/70">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-bold text-base sm:text-lg text-white tracking-tight">
                    Performa Packing {sheetTimeframeLabel}
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {sheetProgressPercent}% Berhasil Di-Packing
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tingkat keberhasilan pemrosesan pesanan dari Google Sheets
                </p>
              </div>
            </div>
          </div>

          <div className="w-full">
            {/* Hero Performance Card (Full Width) */}
            <div
              id="card-metric-hero-performance"
              className="w-full bg-slate-900/80 border border-slate-700/90 rounded-xl p-4 sm:p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-emerald-400" />
                    Tingkat Keberhasilan Packing
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                      sheetProgressPercent === 100
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : sheetProgressPercent >= 80
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : sheetProgressPercent >= 50
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : sheetTotalCount === 0
                        ? 'bg-slate-700/60 text-slate-400 border-slate-600'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {sheetProgressPercent === 100
                      ? '✓ 100% Selesai'
                      : sheetProgressPercent >= 80
                      ? '⚡ Performa Tinggi'
                      : sheetProgressPercent >= 50
                      ? '⏳ Sedang Berjalan'
                      : sheetTotalCount === 0
                      ? 'Belum Ada Pesanan'
                      : '⚠️ Perlu Dikejar'}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-tight transition-all duration-300">
                    {sheetLoading ? '...' : `${sheetProgressPercent}%`}
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    Berhasil Di-Packing
                  </span>
                </div>

                <p className="text-xs text-slate-300 mt-1">
                  {sheetTotalCount > 0 ? (
                    <>
                      <strong className="text-emerald-300 font-bold">
                        {sheetPackedCount} sudah packing
                      </strong>{' '}
                      dibandingkan{' '}
                      <strong className="text-amber-300 font-bold">
                        {sheetPendingCount} belum packing
                      </strong>{' '}
                      (Total{' '}
                      <strong className="text-white font-bold">
                        {sheetTotalCount} pesanan
                      </strong>).
                    </>
                  ) : (
                    'Belum ada data pesanan tercatat untuk periode ini. Periksa data Google Sheet.'
                  )}
                </p>

                {/* Dynamic comparison formula feedback */}
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                  <span className="text-slate-500">Rumus:</span>
                  <span className="bg-slate-950/90 px-2 py-0.5 rounded border border-slate-700/80 text-emerald-300">
                    ({sheetPackedCount} Sudah ÷ {sheetTotalCount} Total) × 100% = {sheetProgressPercent}%
                  </span>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="mt-4 pt-3 border-t border-slate-800">
                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-700">
                  <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
                    style={{ width: `${sheetProgressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-medium mt-1.5">
                  <span className="text-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    Sudah: {sheetPackedCount} ({sheetProgressPercent}%)
                  </span>
                  <span className="text-amber-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    Belum: {sheetPendingCount} ({sheetTotalCount > 0 ? 100 - sheetProgressPercent : 0}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard 4 Core Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5 relative z-10">
          {/* Card 1: BELUM PACKING (Highlighted Primary Focus) */}
          <div
            id="card-sheet-pending"
            onClick={() => handleCardClick('pending')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'pending'
                ? 'bg-amber-950/70 border-amber-400 ring-2 ring-amber-400/50'
                : 'bg-amber-950/40 hover:bg-amber-950/60 border-amber-500/40'
            }`}
            title="Klik untuk membuka pop-up daftar No. Pesanan belum packing"
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
              <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform text-amber-200">
                Daftar No Pesanan →
              </span>
            </p>
          </div>

          {/* Card 2: SUDAH PACKING (Success Primary Focus) */}
          <div
            id="card-sheet-packed"
            onClick={() => handleCardClick('packed')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'packed'
                ? 'bg-emerald-950/70 border-emerald-400 ring-2 ring-emerald-400/50'
                : 'bg-emerald-950/40 hover:bg-emerald-950/60 border-emerald-500/40'
            }`}
            title="Klik untuk membuka pop-up daftar No. Pesanan sudah packing"
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
              <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform text-emerald-200">
                Daftar No Pesanan →
              </span>
            </p>
          </div>

          {/* Card 3: TERTUNDA > 1 HARI (Alert Overdue from Sheet - All Data Pending) */}
          <div
            id="card-sheet-overdue"
            onClick={() => handleCardClick('overdue')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'overdue'
                ? 'bg-rose-950/80 border-rose-400 ring-2 ring-rose-400/50'
                : sheetAllOverdueCount > 0
                ? 'bg-rose-950/50 hover:bg-rose-950/70 border-rose-500/50'
                : 'bg-slate-800/50 hover:bg-slate-800/80 border-slate-700'
            }`}
            title="Klik untuk membuka pop-up daftar No. Pesanan tertunda"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-rose-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className={`w-3.5 h-3.5 ${sheetAllOverdueCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                Tertunda &gt;{formatThresholdLabel(delayThreshold)}
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
                  <span>Akumulasi Pendingan</span>
                </span>
                <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform text-rose-300">
                  Daftar No Pesanan →
                </span>
              </div>
              <p className="text-[10px] text-rose-300/80 leading-tight">
                Klik untuk melihat rincian No. Pesanan yang belum dipacking.
              </p>
            </div>
          </div>

          {/* Card 4: TOTAL NOTA SESUAI PERIODE */}
          <div
            id="card-sheet-total"
            onClick={() => handleCardClick('all')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              sheetStatusFilter === 'all'
                ? 'bg-indigo-950/70 border-indigo-400 ring-2 ring-indigo-400/50'
                : 'bg-slate-800/50 hover:bg-slate-800/80 border-slate-700'
            }`}
            title="Klik untuk membuka pop-up daftar seluruh No. Pesanan pada periode ini"
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
              <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform text-indigo-300">
                Daftar No Pesanan →
              </span>
            </p>
          </div>
        </div>

        {/* Connection status banner if not connected */}
        {!accessToken && (
          <div className="mt-4 p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <span className="text-slate-300">
                Google Sheets belum terhubung. Hubungkan akun Google Anda untuk sinkronisasi data status paket secara langsung.
              </span>
            </div>
            <button
              type="button"
              id="btn-beranda-connect-google"
              onClick={onLoginGoogle}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-950" />
              <span>Hubungkan Akun Google</span>
            </button>
          </div>
        )}

        {/* Error notification if any */}
        {sheetError && (
          <div className="mt-4 p-3.5 bg-rose-900/60 border border-rose-700/80 rounded-2xl text-xs text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 relative z-10">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{sheetError}</span>
            </div>
            <button
              type="button"
              id="btn-beranda-reconnect-error"
              onClick={onLoginGoogle}
              className="px-3 py-1 bg-white text-rose-950 hover:bg-rose-50 font-bold rounded-lg text-xs shrink-0 transition-colors shadow-2xs cursor-pointer"
            >
              Perbarui Sesi Google
            </button>
          </div>
        )}
      </div>

      {/* Quick Overdue Alert / Pending Items Preview */}
      {sheetAllOverdueCount > 0 && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-500 text-white rounded-xl shrink-0 shadow-2xs">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-rose-900 flex items-center gap-2">
                  <span>Perhatian: Ada {sheetAllOverdueCount} Nota Tertunda Melebihi {formatThresholdLabel(delayThreshold)}</span>
                  <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded-full text-[10px] font-extrabold">
                    Perlu Segera Dipacking
                  </span>
                </h3>
                <p className="text-xs text-rose-700">
                  Nota di bawah ini belum terselesaikan packing-nya. Segera periksa fisik paket dan scan barcode-nya.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('sheet_history', 'overdue')}
              className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <span>Buka Semua di Tabel Sheet</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick List Preview (max 3 items) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {sheetAllOverdueList.slice(0, 3).map((item, idx) => {
              const dt = parseNotaDateTime(item.adminDate, item.adminTime);
              const elapsedMins = dt ? Math.floor((nowMs - dt.getTime()) / 60000) : 0;
              const platformColor = getPlatformColor(item.platform);

              return (
                <div
                  key={`overdue-card-${idx}`}
                  className="bg-white p-3 rounded-xl border border-rose-200 shadow-2xs flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xs text-slate-800 tracking-wide truncate max-w-[140px]">
                      {item.orderNumber}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${platformColor.badgeBg} ${platformColor.badgeText}`}>
                      {item.platform}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-500 font-medium">
                      {item.adminDate} {item.adminTime}
                    </span>
                    <span className="font-black text-rose-700">
                      +{formatElapsedDuration(elapsedMins)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pop-up List No Pesanan saat Kartu Status Diklik */}
      {activeModalType && (
        <SheetOrderListModal
          isOpen={!!activeModalType}
          onClose={() => setActiveModalType(null)}
          type={activeModalType}
          timeframe={sheetTimeframe}
          timeframeLabel={sheetTimeframeLabel}
          rows={dashboardFilteredSheetRows}
          allSheetRows={sheetRows}
          delayThreshold={delayThreshold}
          onNavigateToSheetHistory={(filter) => {
            onNavigateToTab('sheet_history', filter);
          }}
          showToast={showToast}
          onMarkOrdersAsPacked={handleMarkOrdersAsPackedFromModal}
          onMarkOrdersAsUnpacked={handleMarkOrdersAsUnpackedFromModal}
        />
      )}
    </section>
  );
};
