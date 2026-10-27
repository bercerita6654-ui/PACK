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
  User,
  X,
  ScanBarcode,
  FileText,
  Sparkles,
  PartyPopper,
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
import { AdminReportModal } from './AdminReportModal';
import { CuteAgentAvatar } from './CuteAgentAvatar';
import { Celebration100Modal } from './Celebration100Modal';

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
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isCelebrationOpen, setIsCelebrationOpen] = useState<boolean>(false);
  const prevProgressRef = useRef<number>(0);
  const [adminName, setAdminName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('packing_report_admin_name') || '';
    }
    return '';
  });

  const handleAdminNameChange = (val: string) => {
    setAdminName(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('packing_report_admin_name', val);
    }
  };

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

  // Auto-trigger 100% celebration animation & cheerful voice "Yeah berhasil!" when 100% is reached
  useEffect(() => {
    if (sheetTotalCount > 0 && sheetProgressPercent === 100) {
      if (prevProgressRef.current < 100) {
        setIsCelebrationOpen(true);
      }
    }
    prevProgressRef.current = sheetProgressPercent;
  }, [sheetProgressPercent, sheetTotalCount]);

  // Formatted string of latest packed timestamp
  const lastPackedTimeStr = useMemo(() => {
    const packedList = dashboardFilteredSheetRows.filter(
      (r) => r.isPacked && r.packingTime && r.packingTime !== '-'
    );
    if (packedList.length > 0) {
      let latest = packedList[packedList.length - 1];
      for (const item of packedList) {
        if (item.packingTime && (!latest.packingTime || item.packingTime > latest.packingTime)) {
          latest = item;
        }
      }
      return `${latest.packingTime} (${latest.orderNumber})`;
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, [dashboardFilteredSheetRows]);

  const handleCopySuccess = (selectedAdmin: string) => {
    setAdminName(selectedAdmin);
    setCopiedReport(true);
    showToast(`Laporan status packing (admin - ${selectedAdmin}) berhasil disalin!`, 'success');
    setTimeout(() => setCopiedReport(false), 2500);
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
        className="bg-white rounded-3xl p-5 sm:p-7 text-slate-800 shadow-sm border border-slate-200 relative overflow-hidden"
      >
        {/* Dashboard Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 relative z-10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="relative p-2.5 sm:p-3 bg-emerald-50 border border-emerald-300 text-emerald-600 rounded-2xl shrink-0 shadow-xs flex items-center justify-center">
              <CuteAgentAvatar
                expression={
                  sheetProgressPercent === 100
                    ? 'cool'
                    : sheetAllOverdueCount > 0 && sheetProgressPercent < 50
                    ? 'panic_sweat'
                    : sheetProgressPercent >= 80
                    ? 'thumbs_up'
                    : sheetPendingCount > 0
                    ? 'duck_waiting'
                    : 'chilling_beanbag'
                }
                customImageUrl="https://lottie.host/fc20fae6-2d3f-466d-b496-982b74fcfdc6/mO5PCWv1Ii.gif"
                size="lg"
                glowColor={
                  sheetProgressPercent === 100
                    ? 'emerald'
                    : sheetAllOverdueCount > 0 && sheetProgressPercent < 50
                    ? 'rose'
                    : sheetProgressPercent >= 80
                    ? 'emerald'
                    : 'amber'
                }
                bubbleText={
                  sheetProgressPercent === 100
                    ? 'Beres Semua!'
                    : sheetAllOverdueCount > 0 && sheetProgressPercent < 50
                    ? 'Ayo Kejar!'
                    : sheetProgressPercent >= 80
                    ? 'Mantap!'
                    : 'Siap Pantau!'
                }
              />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping opacity-75" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Status Paket</span>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Live Google Sheets
                  </span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                  Tab: {sheetResolvedTab}
                </span>
                {sheetLastFetchedAt && (
                  <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Diperbarui {sheetLastFetchedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
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
              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 hover:border-emerald-500 text-slate-800 hover:text-slate-950 disabled:opacity-50 cursor-pointer shadow-xs group"
              title="Segarkan data terbaru dari Google Sheets (Otomatis setiap 5 menit)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 transition-transform ${sheetLoading ? 'animate-spin' : 'group-hover:rotate-180 duration-500'}`} />
              <span>{sheetLoading ? 'Menyinkron...' : 'Segarkan Google Sheets'}</span>
              {accessToken && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs"
                  title="Otomatis diperbarui setiap 5 menit"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                  <span>{formatCountdown(countdown)}</span>
                </span>
              )}
            </button>

            {/* Tombol Pilih Admin & Indikator */}
            <button
              type="button"
              id="btn-beranda-select-admin"
              onClick={() => setIsReportModalOpen(true)}
              className={`flex items-center bg-slate-100 hover:bg-slate-200 border ${
                adminName ? 'border-emerald-400/80 shadow-xs ring-1 ring-emerald-400/30' : 'border-amber-400/80 shadow-xs ring-1 ring-amber-400/20'
              } rounded-xl px-3 py-2 transition-all cursor-pointer group`}
              title="Klik untuk memilih atau mengubah nama admin (Bobby, Winda, Putri, Mishel)"
            >
              <User className={`w-3.5 h-3.5 shrink-0 mr-1.5 ${adminName ? 'text-emerald-600' : 'text-amber-500 animate-pulse'}`} />
              <span className="text-[11px] font-bold text-slate-600 mr-1.5 whitespace-nowrap">Admin:</span>
              <span
                className={`text-xs font-black ${
                  adminName ? 'text-emerald-700' : 'text-amber-600 group-hover:text-amber-700'
                }`}
              >
                {adminName || 'Pilih Admin (Wajib)'}
              </span>
            </button>

            {/* Tombol Salin Report Tunggal - Membuka Pop-up Pilih Admin */}
            <button
              type="button"
              id="btn-copy-packing-report-top"
              onClick={() => setIsReportModalOpen(true)}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                copiedReport
                  ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.5)]'
                  : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black shadow-[0_4px_16px_rgba(16,185,129,0.35)]'
              }`}
              title="Klik untuk membuka pop-up pilih admin dan salin laporan"
            >
              {copiedReport ? (
                <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
              )}
              <span>{copiedReport ? 'Report Tersalin!' : 'Salin Report'}</span>
              {adminName && (
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-950/30 text-slate-900 border border-slate-900/20">
                  {adminName}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Timeframe Filter Bar (Default: Harian / Hari Ini, with Mingguan, Bulanan, Semua Data) */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/90 pb-4 relative z-10">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
            <span className="text-[11px] font-bold text-slate-600 px-2 py-1 flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-emerald-600" />
              <span>Periode:</span>
            </span>
            <button
              type="button"
              id="btn-timeframe-today"
              onClick={() => setSheetTimeframe('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                sheetTimeframe === 'today'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-1 ring-emerald-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-300'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Harian (Hari Ini)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'today'
                    ? 'bg-slate-950/40 text-slate-950'
                    : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
                }`}
              >
                {sheetTodayTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-yesterday"
              onClick={() => setSheetTimeframe('yesterday')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                sheetTimeframe === 'yesterday'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-1 ring-emerald-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-300'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Kemarin</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'yesterday'
                    ? 'bg-slate-950/40 text-slate-950'
                    : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
                }`}
              >
                {sheetYesterdayTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-week"
              onClick={() => setSheetTimeframe('week')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                sheetTimeframe === 'week'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-1 ring-emerald-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-300'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Mingguan</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'week'
                    ? 'bg-slate-950/40 text-slate-950'
                    : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
                }`}
              >
                {sheetWeekTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-month"
              onClick={() => setSheetTimeframe('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                sheetTimeframe === 'month'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-1 ring-emerald-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-300'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Bulanan</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'month'
                    ? 'bg-slate-950/40 text-slate-950'
                    : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
                }`}
              >
                {sheetMonthTotal}
              </span>
            </button>
            <button
              type="button"
              id="btn-timeframe-all"
              onClick={() => setSheetTimeframe('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                sheetTimeframe === 'all'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-1 ring-emerald-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Semua Data</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  sheetTimeframe === 'all'
                    ? 'bg-slate-950/40 text-slate-950'
                    : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
                }`}
              >
                {sheetRows.length}
              </span>
            </button>
          </div>
        </div>

        {/* Hero Performance Card & Breakdown */}
        <div
          id="packing-performance-summary-top"
          className="mt-5 bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl shrink-0 shadow-xs">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Performa Packing {sheetTimeframeLabel}</span>
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
                    {sheetProgressPercent}% Selesai
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tingkat keberhasilan pemrosesan pesanan dari Google Sheets
                </p>
              </div>
            </div>
          </div>

          <div className="w-full">
            {/* Hero Performance Card (Full Width) */}
            <div
              id="card-metric-hero-performance"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs relative overflow-hidden"
            >
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                {/* Left side: Metrics & Stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-emerald-600" />
                      Tingkat Keberhasilan Packing
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-black border shadow-xs transition-all ${
                          sheetProgressPercent === 100
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : sheetProgressPercent >= 80
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : sheetProgressPercent >= 50
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : sheetTotalCount === 0
                            ? 'bg-slate-100 text-slate-500 border-slate-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {sheetProgressPercent === 100
                          ? '✓ 100% Selesai Sempurna'
                          : sheetProgressPercent >= 80
                          ? '⚡ Performa Sangat Baik'
                          : sheetProgressPercent >= 50
                          ? '⏳ Sedang Berjalan'
                          : sheetTotalCount === 0
                          ? 'Belum Ada Pesanan'
                          : '⚠️ Perlu Dikejar'}
                      </span>
                      {sheetProgressPercent === 100 && (
                        <button
                          type="button"
                          onClick={() => setIsCelebrationOpen(true)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all cursor-pointer animate-bounce"
                          title="Putar animasi konfeti perayaan dan suara lucu 'Yeah Berhasil'!"
                        >
                          <PartyPopper className="w-3.5 h-3.5" />
                          <span>Rayakan! 🎉</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-baseline gap-3 mt-3">
                    <span className="text-4xl sm:text-6xl font-black text-emerald-600 font-mono tracking-tight tabular-nums">
                      {sheetLoading ? '...' : `${sheetProgressPercent}%`}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-slate-700">
                      Berhasil Di-Packing
                    </span>
                    {lastPackedTimeStr && (
                      <span className="ml-auto text-xs text-slate-600 font-medium bg-white px-2.5 py-1 rounded-xl border border-slate-200 flex items-center gap-1.5 shadow-2xs">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        <span>Terakhir: <strong className="text-emerald-700 font-mono">{lastPackedTimeStr}</strong></span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {sheetTotalCount > 0 ? (
                      <>
                        <strong className="text-emerald-700 font-bold">
                          {sheetPackedCount} sudah packing
                        </strong>{' '}
                        dibandingkan{' '}
                        <strong className="text-amber-700 font-bold">
                          {sheetPendingCount} belum packing
                        </strong>{' '}
                        (Total{' '}
                        <strong className="text-slate-900 font-bold">
                          {sheetTotalCount} pesanan
                        </strong>).
                      </>
                    ) : (
                      'Belum ada data pesanan tercatat untuk periode ini. Periksa data Google Sheet.'
                    )}
                  </p>

                  {/* Dynamic comparison formula feedback */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                    <span className="text-slate-600 font-sans font-semibold">Rumus:</span>
                    <span className="bg-white px-2.5 py-1 rounded-xl border border-slate-200 text-slate-700 shadow-2xs font-bold">
                      ({sheetPackedCount} Sudah ÷ {sheetTotalCount} Total) × 100% = {sheetProgressPercent}%
                    </span>
                  </div>
                </div>

                {/* Right side: Reactive Agent Mascot Companion */}
                <div className="flex sm:self-center md:self-auto items-center gap-4 p-3.5 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm relative group shrink-0">
                  <div className="relative">
                    <CuteAgentAvatar
                      expression={
                        sheetProgressPercent === 100
                          ? 'cool_sunglasses'
                          : sheetProgressPercent >= 80
                          ? 'thumbs_up'
                          : sheetProgressPercent >= 50
                          ? 'eating_popcorn'
                          : sheetAllOverdueCount > 0
                          ? 'panic_sweat'
                          : 'duck_waiting'
                      }
                      customImageUrl="https://lottie.host/d53b8503-430e-4dfb-83fe-736070530dfc/kutvK01eXj.gif"
                      size="xl"
                      glowColor={
                        sheetProgressPercent === 100
                          ? 'emerald'
                          : sheetProgressPercent >= 80
                          ? 'emerald'
                          : sheetProgressPercent >= 50
                          ? 'amber'
                          : 'rose'
                      }
                      animation={sheetAllOverdueCount > 0 && sheetProgressPercent < 50 ? 'jitter' : 'bounce'}
                      bubbleText={
                        sheetProgressPercent === 100
                          ? '100% Beres, Juara! 😎'
                          : sheetProgressPercent >= 80
                          ? 'Gaspol, hampir beres! 👍'
                          : sheetProgressPercent >= 50
                          ? 'Lagi proses nih~ 🍿'
                          : sheetAllOverdueCount > 0
                          ? 'Waduh kejar packing! 💦'
                          : 'Semangat packing! ✨'
                      }
                    />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                      <span className="text-xs font-black text-slate-900">Agent Packing</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {sheetProgressPercent === 100
                        ? 'Semua pesanan selesai!'
                        : sheetProgressPercent >= 80
                        ? 'Sisa sedikit lagi!'
                        : sheetProgressPercent >= 50
                        ? 'Terus berprogres!'
                        : sheetAllOverdueCount > 0
                        ? 'Perlu diprioritaskan!'
                        : 'Siap memantau data'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="mt-5 pt-4 border-t border-slate-200">
                <div className="w-full bg-slate-200 rounded-full h-3.5 overflow-hidden border border-slate-300">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${sheetProgressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-semibold mt-2.5">
                  <span className="text-emerald-800 flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                    Sudah: <strong className="font-mono text-emerald-900">{sheetPackedCount}</strong> ({sheetProgressPercent}%)
                  </span>
                  <span className="text-amber-800 flex items-center gap-1.5 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-amber-600 inline-block" />
                    Belum: <strong className="font-mono text-amber-900">{sheetPendingCount}</strong> ({sheetTotalCount > 0 ? 100 - sheetProgressPercent : 0}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard 4 Core Stat Cards with Trendy Colors & Expressive Cute Agents */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5 relative z-10">
          {/* Card 1: BELUM PACKING */}
          <div
            id="card-sheet-pending"
            onClick={() => handleCardClick('pending')}
            className={`p-4 sm:p-5 pt-5 sm:pt-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 bg-white ${
              sheetStatusFilter === 'pending'
                ? 'border-amber-500 ring-2 ring-amber-200 shadow-md'
                : 'border-slate-200 hover:border-amber-400 shadow-sm hover:shadow-md'
            }`}
            title="Klik untuk membuka pop-up daftar No. Pesanan belum packing"
          >
            {/* Header: Title + Cute Agent Mascot */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-amber-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                Belum Packing
              </span>
              <div className="flex items-center gap-2">
                <CuteAgentAvatar
                  expression="duck_waiting"
                  customImageUrl="https://lottie.host/955aab33-0717-417f-ad20-a1da80d19926/h0i3WRkdr3.gif"
                  size="md"
                  glowColor="amber"
                  animation="float"
                  bubbleText="Antri pack!"
                />
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold shadow-2xs">
                  {sheetTotalCount > 0 ? `${Math.round((sheetPendingCount / sheetTotalCount) * 100)}%` : '0%'}
                </span>
              </div>
            </div>

            {/* Metric Value */}
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl sm:text-4xl font-mono font-black text-amber-600 tracking-tight tabular-nums">
                {sheetLoading ? '...' : sheetPendingCount}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Nota</span>
            </div>

            {/* Card Footer */}
            <p className="text-[11px] text-slate-600 mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Menunggu dipacking</span>
              </span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-1 transition-transform text-amber-700">
                Daftar Pesanan →
              </span>
            </p>
          </div>

          {/* Card 2: SUDAH PACKING */}
          <div
            id="card-sheet-packed"
            onClick={() => handleCardClick('packed')}
            className={`p-4 sm:p-5 pt-5 sm:pt-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 bg-white ${
              sheetStatusFilter === 'packed'
                ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-md'
                : 'border-slate-200 hover:border-emerald-400 shadow-sm hover:shadow-md'
            }`}
            title="Klik untuk membuka pop-up daftar No. Pesanan sudah packing"
          >
            {/* Header: Title + Cute Agent Mascot */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-emerald-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Sudah Packing
              </span>
              <div className="flex items-center gap-2">
                <CuteAgentAvatar
                  expression={sheetProgressPercent === 100 ? 'cool_sunglasses' : 'thumbs_up'}
                  customImageUrl="https://lottie.host/997b8c04-d31e-4d35-b44e-16ba474fd715/58cq3gSepb.gif"
                  size="md"
                  glowColor="emerald"
                  animation="bounce"
                  bubbleText={sheetProgressPercent === 100 ? 'Selesai 100%!' : 'Beres!'}
                />
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold shadow-2xs">
                  {sheetProgressPercent}%
                </span>
              </div>
            </div>

            {/* Metric Value */}
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl sm:text-4xl font-mono font-black text-emerald-600 tracking-tight tabular-nums">
                {sheetLoading ? '...' : sheetPackedCount}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Nota</span>
            </div>

            {/* Mini Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden border border-slate-200">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${sheetProgressPercent}%` }}
              />
            </div>

            {/* Card Footer */}
            <p className="text-[11px] text-slate-600 mt-2 pt-1 border-t border-slate-100 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Telah selesai dipacking</span>
              </span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-1 transition-transform text-emerald-700">
                Daftar Pesanan →
              </span>
            </p>
          </div>

          {/* Card 3: TERTUNDA > THRESHOLD */}
          <div
            id="card-sheet-overdue"
            onClick={() => handleCardClick('overdue')}
            className={`p-4 sm:p-5 pt-5 sm:pt-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 bg-white ${
              sheetStatusFilter === 'overdue'
                ? 'border-rose-500 ring-2 ring-rose-200 shadow-md'
                : sheetAllOverdueCount > 0
                ? 'border-rose-300 hover:border-rose-400 shadow-sm hover:shadow-md'
                : 'border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
            title="Klik untuk membuka pop-up daftar No. Pesanan tertunda"
          >
            {/* Header: Title + Cute Agent Mascot */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-rose-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className={`w-3.5 h-3.5 ${sheetAllOverdueCount > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`} />
                Tertunda &gt;{formatThresholdLabel(delayThreshold)}
              </span>
              <div className="flex items-center gap-2">
                <CuteAgentAvatar
                  expression="panic_sweat"
                  customImageUrl="https://lottie.host/c3e31776-7594-4701-8908-a31746b8afd0/NsmGxQZWva.gif"
                  size="md"
                  glowColor="rose"
                  animation={sheetAllOverdueCount > 0 ? 'jitter' : 'none'}
                  bubbleText={sheetAllOverdueCount > 0 ? 'Waduh telat!' : 'Aman!'}
                />
                {sheetAllOverdueCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-black animate-pulse shadow-xs">
                    Cek!
                  </span>
                )}
              </div>
            </div>

            {/* Metric Value */}
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-3xl sm:text-4xl font-mono font-black tracking-tight tabular-nums ${
                sheetAllOverdueCount > 0 ? 'text-rose-600' : 'text-slate-700'
              }`}>
                {sheetLoading ? '...' : sheetAllOverdueCount}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Nota</span>
              {sheetTimeframe !== 'all' && (
                <span className="text-[10px] font-bold text-rose-800 ml-auto bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
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
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[11px] text-slate-700">
                <span className="flex items-center gap-1 font-bold">
                  <Info className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>Akumulasi Pendingan</span>
                </span>
                <span className="text-[10px] underline font-bold group-hover:translate-x-0.5 transition-transform text-rose-700">
                  Daftar Pesanan →
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Klik untuk melihat rincian No. Pesanan yang belum dipacking.
              </p>
            </div>
          </div>

          {/* Card 4: TOTAL NOTA SESUAI PERIODE */}
          <div
            id="card-sheet-total"
            onClick={() => handleCardClick('all')}
            className={`p-4 sm:p-5 pt-5 sm:pt-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 bg-white ${
              sheetStatusFilter === 'all'
                ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-md'
                : 'border-slate-200 hover:border-indigo-400 shadow-sm hover:shadow-md'
            }`}
            title="Klik untuk membuka pop-up daftar seluruh No. Pesanan pada periode ini"
          >
            {/* Header: Title + Cute Agent Mascot */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-indigo-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
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
              <div className="flex items-center gap-2">
                <CuteAgentAvatar
                  expression="eating_popcorn"
                  customImageUrl="https://lottie.host/e65ba651-145f-48ae-8eb7-efd7abc5fe8a/jVxDDtDFCi.gif"
                  size="md"
                  glowColor="indigo"
                  animation="pulse"
                  bubbleText="Pantau data~"
                />
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-full text-[10px] font-bold shadow-2xs">
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
            </div>

            {/* Metric Value */}
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl sm:text-4xl font-mono font-black text-slate-900 tracking-tight tabular-nums">
                {sheetLoading ? '...' : sheetTotalCount}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Nota</span>
            </div>

            {/* Card Footer: Shopee vs Tokopedia */}
            <p className="text-[11px] text-slate-600 mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-slate-700 font-medium flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-200 text-[10px] font-bold">
                  Shopee: <strong className="text-orange-950 font-mono">{sheetShopeeCount}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                  Tokped: <strong className="text-emerald-950 font-mono">{sheetTokpedCount}</strong>
                </span>
              </span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-1 transition-transform text-indigo-700">
                Daftar Pesanan →
              </span>
            </p>
          </div>
        </div>

        {/* Connection status banner if not connected */}
        {!accessToken && (
          <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-700 shrink-0 shadow-2xs">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <span className="text-slate-600 font-medium">
                Google Sheets belum terhubung. Hubungkan akun Google Anda untuk sinkronisasi data status paket secara langsung.
              </span>
            </div>
            <button
              type="button"
              id="btn-beranda-connect-google"
              onClick={onLoginGoogle}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs shrink-0 transition-all shadow-[0_2px_10px_rgba(16,185,129,0.3)] cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-950" />
              <span>Hubungkan Akun Google</span>
            </button>
          </div>
        )}

        {/* Error notification if any */}
        {sheetError && (
          <div className="mt-5 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 relative z-10 shadow-xs">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{sheetError}</span>
            </div>
            <button
              type="button"
              id="btn-beranda-reconnect-error"
              onClick={onLoginGoogle}
              className="px-3 py-1.5 bg-rose-600 text-white hover:bg-rose-700 font-bold rounded-lg text-xs shrink-0 transition-colors shadow-xs cursor-pointer"
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

      {/* ========================================================================= */}
      {/* QUICK WORKFLOW GATEWAY: Tahap 1 Admin vs Tahap 2 Packing */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {/* Gateway Card 1: Tahap 1 Admin */}
        <div
          id="gateway-card-nota-admin"
          onClick={() => onNavigateToTab('nota')}
          className="group relative overflow-hidden bg-white hover:bg-amber-50/30 border-2 border-amber-200 hover:border-amber-400 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 cursor-pointer flex flex-col justify-between"
        >
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-44 h-44 bg-amber-400/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping inline-block" />
                Tahap 1 Admin
              </span>
              <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200 font-mono tabular-nums">
                {sheetPendingCount} Nota Menunggu
              </span>
            </div>
            <div className="flex items-start gap-3.5 mb-2">
              <div className="p-3 bg-gradient-to-tr from-amber-500 to-amber-600 text-white rounded-2xl shadow-md shadow-amber-500/25 shrink-0 group-hover:scale-105 transition-transform">
                <FileText className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 group-hover:text-amber-950 transition-colors">
                  Scan Nota (Belum Packing)
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Admin scan nota cetak dari marketplace sebelum pesanan disiapkan oleh tim packing.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-amber-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Antrean Belum Packing: <strong className="font-mono text-sm text-amber-900 font-black">{sheetPendingCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 group-hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all group-hover:translate-x-1">
              <span>Buka Scan Nota</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Gateway Card 2: Tahap 2 Packing */}
        <div
          id="gateway-card-packing"
          onClick={() => onNavigateToTab('packing')}
          className="group relative overflow-hidden bg-white hover:bg-emerald-50/30 border-2 border-emerald-200 hover:border-emerald-400 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 cursor-pointer flex flex-col justify-between"
        >
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-44 h-44 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse inline-block" />
                Tahap 2 Packing
              </span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 font-mono tabular-nums">
                {sheetPackedCount} Selesai ({sheetProgressPercent}%)
              </span>
            </div>
            <div className="flex items-start gap-3.5 mb-2">
              <div className="p-3 bg-gradient-to-tr from-emerald-600 to-teal-600 text-white rounded-2xl shadow-md shadow-emerald-600/25 shrink-0 group-hover:scale-105 transition-transform">
                <ScanBarcode className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 group-hover:text-emerald-950 transition-colors">
                  Scan Nota (Sudah Packing)
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Tim packing scan barcode resi untuk verifikasi & otomatis mencocokkan nota yang sudah siap kirim.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-emerald-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Paket Telah Selesai: <strong className="font-mono text-sm text-emerald-900 font-black">{sheetPackedCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 group-hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all group-hover:translate-x-1">
              <span>Buka Scan Packing</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Marketplace Breakdown Panel */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/90 relative overflow-hidden space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Distribusi Marketplace ({sheetTimeframeLabel})
              </h3>
              <p className="text-xs text-slate-500">
                Perbandingan pesanan Shopee vs Tokopedia / TikTok pada periode aktif
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Shopee Card */}
          <div className="p-4 rounded-2xl bg-orange-50/50 border border-orange-200/90 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
                <span className="font-black text-sm text-orange-950">Shopee</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-orange-100 text-orange-900 border border-orange-300">
                {sheetShopeeCount} Pesanan
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-800 font-semibold">
                Sudah Packing: <strong className="font-mono font-black">{sheetShopeePackedCount}</strong>
              </span>
              <span className="text-amber-800 font-semibold">
                Belum: <strong className="font-mono font-black">{sheetShopeePendingCount}</strong>
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-orange-100 rounded-full h-2 overflow-hidden border border-orange-200">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500"
                style={{
                  width: `${sheetShopeeCount > 0 ? Math.round((sheetShopeePackedCount / sheetShopeeCount) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Tokopedia / TikTok Card */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/90 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0" />
                <span className="font-black text-sm text-emerald-950">Tokopedia / TikTok</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                {sheetTokpedCount} Pesanan
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-800 font-semibold">
                Sudah Packing: <strong className="font-mono font-black">{sheetTokpedPackedCount}</strong>
              </span>
              <span className="text-amber-800 font-semibold">
                Belum: <strong className="font-mono font-black">{sheetTokpedPendingCount}</strong>
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-emerald-100 rounded-full h-2 overflow-hidden border border-emerald-200">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-500"
                style={{
                  width: `${sheetTokpedCount > 0 ? Math.round((sheetTokpedPackedCount / sheetTokpedCount) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

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

      {/* Pop-up Wajib Pilih Admin Saat Salin Report */}
      <AdminReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        reportParams={{
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
        }}
        onSuccessCopy={handleCopySuccess}
      />

      {/* Pop-up Animasi Happy 100% Selesai & Suara Lucu */}
      <Celebration100Modal
        isOpen={isCelebrationOpen}
        onClose={() => setIsCelebrationOpen(false)}
        totalPacked={sheetPackedCount}
        timeframeLabel={sheetTimeframeLabel}
      />
    </section>
  );
};
