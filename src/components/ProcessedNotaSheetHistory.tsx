import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Search,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  LogIn,
  Filter,
  ArrowUpDown,
  Download,
  Import,
  Calendar,
  FileText,
  Layers,
} from 'lucide-react';
import { PlatformType, PackedOrder, ProcessedNota } from '../types';
import {
  fetchProcessedNotasHistory,
  fetchCrossReferencedNotasAndPacking,
} from '../services/googleWorkspace';
import { isAuthExpiredError, invalidateStoredToken } from '../services/googleAuth';
import { getPlatformColor } from '../utils/platformDetector';
import {
  parseNotaDateTime,
  formatElapsedDuration,
  formatThresholdLabel,
  DEFAULT_DELAY_THRESHOLD_MINUTES,
  evaluateNotaPackedStatus,
  isDateToday,
  isDateThisWeek,
  isDateThisMonth,
  normalizeOrderNumber,
  generatePackingReportText,
} from '../utils/notaDelay';

export interface ProcessedNotaSheetHistoryProps {
  accessToken: string | null;
  userEmail?: string;
  onLoginGoogle?: () => void;
  onTokenExpired?: () => void;
  targetSpreadsheetId: string;
  targetSheetTab: string;
  lastSyncTimestamp?: number;
  delayThreshold?: number;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onImportToActiveSession?: (
    items: { orderNumber: string; platform: PlatformType; notes?: string }[]
  ) => void;
  // Shared state with top dashboard
  sheetRows?: SheetProcessedNotaRow[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  lastFetchedAt?: Date | null;
  resolvedTabName?: string;
  selectedStatusFilter?: 'all' | 'pending' | 'overdue' | 'packed';
  onStatusFilterChange?: (filter: 'all' | 'pending' | 'overdue' | 'packed') => void;
  selectedTimeframe?: 'today' | 'week' | 'month' | 'all';
  onTimeframeChange?: (timeframe: 'today' | 'week' | 'month' | 'all') => void;
  packedOrders?: PackedOrder[];
  localNotas?: ProcessedNota[];
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

export const ProcessedNotaSheetHistory: React.FC<ProcessedNotaSheetHistoryProps> = ({
  accessToken,
  userEmail,
  onLoginGoogle,
  onTokenExpired,
  targetSpreadsheetId,
  targetSheetTab,
  lastSyncTimestamp,
  delayThreshold,
  showToast,
  onImportToActiveSession,
  sheetRows: externalSheetRows,
  loading: externalLoading,
  error: externalError,
  onRefresh: externalOnRefresh,
  lastFetchedAt: externalLastFetchedAt,
  resolvedTabName: externalResolvedTabName,
  selectedStatusFilter,
  onStatusFilterChange,
  selectedTimeframe,
  onTimeframeChange,
  packedOrders = [],
  localNotas = [],
}) => {
  const effectiveThreshold = delayThreshold ?? DEFAULT_DELAY_THRESHOLD_MINUTES;

  const [internalLoading, setInternalLoading] = useState<boolean>(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [internalResolvedTabName, setInternalResolvedTabName] = useState<string>(targetSheetTab);
  const [internalSheetRows, setInternalSheetRows] = useState<SheetProcessedNotaRow[]>([]);
  const [internalLastFetchedAt, setInternalLastFetchedAt] = useState<Date | null>(null);

  const isControlled = externalSheetRows !== undefined;
  const rawSheetRows = isControlled ? externalSheetRows : internalSheetRows;

  // Re-evaluate sheetRows with live packedOrders and localNotas so status is always 100% in sync
  const sheetRows = useMemo(() => {
    return rawSheetRows.map((row) => {
      // If row was already matched from Packing Reg sheet, preserve that status
      if (row.matchedFromPackingReg || row.matchedSource === 'packing_reg_sheet') {
        return row;
      }
      const statusEval = evaluateNotaPackedStatus(
        row.packingStatus,
        row.packingTime,
        row.orderNumber,
        packedOrders,
        localNotas
      );
      if (statusEval.isPacked !== row.isPacked || statusEval.matchedSource !== row.matchedSource) {
        return {
          ...row,
          isPacked: statusEval.isPacked,
          packingStatus: statusEval.resolvedStatus,
          packingTime: statusEval.resolvedTime,
          matchedFromPackingReg: statusEval.matchedSource === 'packing_reg_sheet',
          matchedSource: statusEval.matchedSource,
        };
      }
      return row;
    });
  }, [rawSheetRows, packedOrders, localNotas]);
  const loading = externalLoading !== undefined ? externalLoading : internalLoading;
  const error = externalError !== undefined ? externalError : internalError;
  const lastFetchedAt = externalLastFetchedAt !== undefined ? externalLastFetchedAt : internalLastFetchedAt;
  const resolvedTabName = externalResolvedTabName !== undefined ? externalResolvedTabName : internalResolvedTabName;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<'Semua' | 'Shopee' | 'Tokopedia/TikTok'>('Semua');
  const [sourceTabFilter, setSourceTabFilter] = useState<'all' | 'nota' | 'packing'>('all');
  const [internalStatusFilter, setInternalStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'packed'>('all');
  const [internalTimeframe, setInternalTimeframe] = useState<'today' | 'week' | 'month' | 'all'>('today');

  const statusFilter = selectedStatusFilter !== undefined ? selectedStatusFilter : internalStatusFilter;
  const setStatusFilter = (val: 'all' | 'pending' | 'overdue' | 'packed') => {
    setInternalStatusFilter(val);
    if (onStatusFilterChange) {
      onStatusFilterChange(val);
    }
  };

  const timeframe = selectedTimeframe !== undefined ? selectedTimeframe : internalTimeframe;
  const setTimeframe = (val: 'today' | 'week' | 'month' | 'all') => {
    setInternalTimeframe(val);
    if (onTimeframeChange) {
      onTimeframeChange(val);
    }
  };

  const [sortDescending, setSortDescending] = useState<boolean>(true); // latest rows first
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

  // Fetch data from Google Sheet tab "Nota Diproses"
  const loadSheetHistory = useCallback(async () => {
    if (externalOnRefresh) {
      externalOnRefresh();
      return;
    }
    if (!accessToken) {
      setInternalSheetRows([]);
      setInternalError(null);
      return;
    }

    setInternalLoading(true);
    setInternalError(null);

    try {
      const result = await fetchCrossReferencedNotasAndPacking(
        accessToken,
        targetSpreadsheetId,
        targetSheetTab,
        'Packing Reg'
      );
      setInternalResolvedTabName(result.notaTabName);

      // Detect header columns dynamically
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

        // Status packing deduction cross-referenced with Sheet Packing Reg, packedOrders, and localNotas
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
              existing.sourceSheetTab = 'both';
              if (!existing.packingTime || existing.packingTime === '-') {
                existing.packingTime = (r[packColTime] ?? r[4] ?? '-').trim();
              }
            }
            return;
          }

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

      setInternalSheetRows(parsed);
      setInternalLastFetchedAt(new Date());
    } catch (err: any) {
      if (isAuthExpiredError(err)) {
        console.warn('Google Sheet access token expired (401). Invalidating stored token.');
        invalidateStoredToken();
        if (onTokenExpired) {
          onTokenExpired();
        }
        setInternalError('Sesi Google Sheets telah kedaluwarsa. Silakan perbarui sesi login Google Anda.');
      } else {
        console.error('Error fetching sheet processed notas history:', err);
        setInternalError(err.message || 'Gagal membaca riwayat nota dari Google Sheet.');
      }
    } finally {
      setInternalLoading(false);
    }
  }, [
    accessToken,
    targetSpreadsheetId,
    targetSheetTab,
    onTokenExpired,
    externalOnRefresh,
    packedOrders,
    localNotas,
  ]);

  // Initial load & when lastSyncTimestamp or accessToken updates
  useEffect(() => {
    if (!isControlled && accessToken) {
      loadSheetHistory();
    }
  }, [isControlled, accessToken, lastSyncTimestamp, loadSheetHistory]);

  // Statistics
  const totalInSheet = sheetRows.length;
  const packedInSheet = useMemo(
    () => sheetRows.filter((r) => r.isPacked).length,
    [sheetRows]
  );
  const pendingInSheet = totalInSheet - packedInSheet;
  const overdueInSheet = useMemo(() => {
    const nowMs = Date.now();
    return sheetRows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
      return elapsed >= effectiveThreshold;
    }).length;
  }, [sheetRows, effectiveThreshold]);

  const shopeeCount = useMemo(
    () => sheetRows.filter((r) => r.platform === 'Shopee').length,
    [sheetRows]
  );
  const tokpedCount = useMemo(
    () => sheetRows.filter((r) => r.platform === 'Tokopedia/TikTok').length,
    [sheetRows]
  );

  const notaTabCount = useMemo(
    () => sheetRows.filter((r) => r.sourceSheetTab === 'Nota Diproses' || r.sourceSheetTab === 'both' || !r.sourceSheetTab).length,
    [sheetRows]
  );
  const packingTabCount = useMemo(
    () => sheetRows.filter((r) => r.sourceSheetTab === 'Packing Reg' || r.sourceSheetTab === 'both' || r.matchedFromPackingReg).length,
    [sheetRows]
  );
  const syncedBothCount = useMemo(
    () => sheetRows.filter((r) => r.sourceSheetTab === 'both' || (r.matchedFromPackingReg && r.sourceSheetTab === 'Nota Diproses')).length,
    [sheetRows]
  );

  // Timeframe statistics in Google Sheet
  const periodStats = useMemo(() => {
    let effectiveRows = sheetRows;
    if (timeframe === 'today') {
      effectiveRows = sheetRows.filter((r) => isDateToday(r.adminDate, r.adminTime));
    } else if (timeframe === 'week') {
      effectiveRows = sheetRows.filter((r) => isDateThisWeek(r.adminDate, r.adminTime));
    } else if (timeframe === 'month') {
      effectiveRows = sheetRows.filter((r) => isDateThisMonth(r.adminDate, r.adminTime));
    }

    const totalPeriod = effectiveRows.length;
    const packedPeriod = effectiveRows.filter((r) => r.isPacked).length;
    const pendingPeriod = totalPeriod - packedPeriod;
    const percentPeriod =
      totalPeriod > 0 ? Math.round((packedPeriod / totalPeriod) * 100) : 0;

    return {
      totalPeriod,
      packedPeriod,
      pendingPeriod,
      percentPeriod,
    };
  }, [sheetRows, timeframe]);

  // Filter and sort
  const filteredAndSortedRows = useMemo(() => {
    const nowMs = Date.now();

    let result = sheetRows.filter((row) => {
      const matchPlatform =
        platformFilter === 'Semua' || row.platform === platformFilter;

      const matchSourceTab = (() => {
        if (sourceTabFilter === 'all') return true;
        if (sourceTabFilter === 'nota') {
          return row.sourceSheetTab === 'Nota Diproses' || row.sourceSheetTab === 'both' || !row.sourceSheetTab;
        }
        if (sourceTabFilter === 'packing') {
          return row.sourceSheetTab === 'Packing Reg' || row.sourceSheetTab === 'both' || row.matchedFromPackingReg;
        }
        return true;
      })();

      const isRowOverdue = (() => {
        if (row.isPacked) return false;
        const d = parseNotaDateTime(row.adminDate, row.adminTime);
        if (!d) return false;
        const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
        return elapsed >= effectiveThreshold;
      })();

      const matchTimeframe = (() => {
        if (timeframe === 'today') return isDateToday(row.adminDate, row.adminTime);
        if (timeframe === 'week') return isDateThisWeek(row.adminDate, row.adminTime);
        if (timeframe === 'month') return isDateThisMonth(row.adminDate, row.adminTime);
        return true;
      })();

      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'packed' && row.isPacked) ||
        (statusFilter === 'pending' && !row.isPacked) ||
        (statusFilter === 'overdue' && isRowOverdue);
      const matchSearch =
        !searchQuery.trim() ||
        row.orderNumber.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        row.adminDate.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        row.adminTime.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        row.notes.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchPlatform && matchSourceTab && matchStatus && matchSearch && matchTimeframe;
    });

    if (sortDescending) {
      result = [...result].reverse();
    }

    return result;
  }, [
    sheetRows,
    platformFilter,
    sourceTabFilter,
    statusFilter,
    searchQuery,
    sortDescending,
    effectiveThreshold,
    timeframe,
  ]);

  // Copy single order
  const handleCopySingle = (orderNumber: string, id: string) => {
    navigator.clipboard.writeText(orderNumber).then(
      () => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1800);
      },
      () => showToast('Gagal menyalin nomor pesanan.', 'error')
    );
  };

  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // Copy formatted text report based on active period stats
  const handleCopyReport = async () => {
    // Find last packed time in effective period rows
    const effectiveRows = sheetRows.filter((r) => {
      if (timeframe === 'today') return isDateToday(r.adminDate, r.adminTime);
      if (timeframe === 'week') return isDateThisWeek(r.adminDate, r.adminTime);
      if (timeframe === 'month') return isDateThisMonth(r.adminDate, r.adminTime);
      return true;
    });
    const packedItems = effectiveRows.filter((r) => r.isPacked);
    let lastPackedTimeStr = '';
    for (let i = packedItems.length - 1; i >= 0; i--) {
      const pt = packedItems[i].packingTime;
      if (pt && pt !== '-') {
        const match = pt.match(/\b(\d{1,2}:\d{2})(?::\d{2})?\b/);
        if (match) {
          lastPackedTimeStr = match[1];
          break;
        }
      }
    }

    const reportText = generatePackingReportText({
      totalCount: periodStats.totalPeriod,
      packedCount: periodStats.packedPeriod,
      pendingCount: periodStats.pendingPeriod,
      timeframe,
      lastPackedTimeStr: lastPackedTimeStr || undefined,
      customDate: new Date(),
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

  // Copy order numbers from sheet
  const handleCopyOrderNumbers = () => {
    if (filteredAndSortedRows.length === 0) {
      showToast('Tidak ada nomor nota/pesanan untuk disalin.', 'warning');
      return;
    }
    const text = filteredAndSortedRows.map((r) => r.orderNumber).join('\n');
    navigator.clipboard.writeText(text).then(
      () => showToast(`${filteredAndSortedRows.length} nomor pesanan berhasil disalin!`, 'success'),
      () => showToast('Gagal menyalin data ke clipboard.', 'error')
    );
  };

  // Download filtered sheet data to CSV
  const handleDownloadCSV = () => {
    if (sheetRows.length === 0) {
      showToast('Tidak ada data nota Google Sheet untuk diunduh.', 'warning');
      return;
    }
    const header = 'No,No Nota / Pesanan,Platform,Tanggal Admin,Waktu Admin,Status Packing,Waktu Packing,Catatan\n';
    const body = sheetRows
      .map(
        (r, i) =>
          `"${i + 1}","${r.orderNumber}","${r.platform}","${r.adminDate}","${r.adminTime}","${r.packingStatus}","${r.packingTime}","${r.notes}"`
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `nota-diproses-sheet-${targetSheetTab.replace(/\s+/g, '_')}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File CSV riwayat Google Sheet berhasil diunduh.', 'success');
  };

  // Import filtered items into the active scan session
  const handleImportToActiveSession = () => {
    if (!onImportToActiveSession) return;
    if (filteredAndSortedRows.length === 0) {
      showToast('Tidak ada data nota untuk diimpor ke sesi scan.', 'warning');
      return;
    }
    const items = filteredAndSortedRows.map((r) => ({
      orderNumber: r.orderNumber,
      platform: r.platform,
      notes: r.notes || undefined,
    }));
    onImportToActiveSession(items);
  };

  return (
    <div id="section-nota-sheet-history" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-8">
      {/* Header Bar */}
      <div className="p-4 sm:p-6 border-b border-slate-200 bg-gradient-to-r from-emerald-50/70 via-teal-50/30 to-indigo-50/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shadow-xs shrink-0">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-slate-900 text-base sm:text-lg">
                  Hasil Scan di Google Sheet
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                  Tab: {resolvedTabName}
                </span>
                {accessToken && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300/80 flex items-center gap-1.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Terhubung Google Sheets{userEmail ? ` (${userEmail})` : ''}</span>
                  </span>
                )}
                {totalInSheet > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                    {totalInSheet} data tersimpan
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                <span>Data tersimpan langsung di spreadsheet:</span>
                <code className="bg-slate-200/80 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">
                  {targetSpreadsheetId}
                </code>
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="btn-refresh-nota-sheet"
            onClick={() => {
              if (!accessToken && onLoginGoogle) {
                onLoginGoogle();
              } else {
                loadSheetHistory();
              }
            }}
            disabled={loading}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
            title="Segarkan data nota dari Google Sheet"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Memuat...' : 'Segarkan Data'}</span>
          </button>

          <a
            href={spreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Buka file Google Spreadsheet di tab baru"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
            <span>Buka Google Sheets ↗</span>
          </a>
        </div>
      </div>

      {/* Summary Cards (Only shown if standalone / not controlled by top dashboard) */}
      {!isControlled && (
        <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total di Sheet */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-xs font-bold uppercase tracking-wider">
                Total di Sheet
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-slate-900">{totalInSheet}</span>
                <span className="text-xs text-slate-500 font-medium">Nota</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Shopee: {shopeeCount} • Tokped: {tokpedCount}
              </div>
            </div>

            {/* Belum Dipacking di Sheet */}
            <div
              onClick={() => setStatusFilter('pending')}
              className={`p-3.5 rounded-2xl border shadow-2xs cursor-pointer transition-all ${
                statusFilter === 'pending'
                  ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
                  : 'bg-white hover:bg-amber-50/50 border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-amber-800 block text-xs font-bold uppercase tracking-wider">
                  Belum Packing
                </span>
                {pendingInSheet > 0 && (
                  <span className="px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded text-[10px] font-extrabold">
                    Pending
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-amber-700">{pendingInSheet}</span>
                <span className="text-xs text-amber-700 font-medium">Nota</span>
              </div>
              <div className="text-[10px] text-amber-600 mt-0.5">
                Klik untuk filter belum packing
              </div>
            </div>

            {/* Selesai Dipacking di Sheet */}
            <div
              onClick={() => setStatusFilter('packed')}
              className={`p-3.5 rounded-2xl border shadow-2xs cursor-pointer transition-all ${
                statusFilter === 'packed'
                  ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-300'
                  : 'bg-white hover:bg-emerald-50/50 border-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-emerald-800 block text-xs font-bold uppercase tracking-wider">
                  Sudah Packing
                </span>
                <span className="px-1.5 py-0.2 bg-emerald-200 text-emerald-900 rounded text-[10px] font-extrabold">
                  Selesai
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-emerald-800">{packedInSheet}</span>
                <span className="text-xs text-emerald-800 font-medium">Nota</span>
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">
                Klik untuk filter sudah packing
              </div>
            </div>

            {/* Sync Status */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-center">
              <span className="text-slate-500 block text-xs font-bold uppercase tracking-wider">
                Status Sinkronisasi
              </span>
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                {accessToken ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="font-bold text-emerald-700 truncate">
                      {userEmail || 'Terhubung'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-bold text-amber-700">Perlu Login Google</span>
                  </>
                )}
              </div>
              {lastFetchedAt && (
                <span className="text-[10px] text-slate-400 mt-0.5 truncate">
                  Update: {lastFetchedAt.toLocaleTimeString('id-ID')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RINGKASAN STATISTIK KECIL DI ATAS TABEL NOTA DIPROSES                      */}
      {/* ========================================================================= */}
      <div
        id="mini-stats-today-sheet"
        className="p-3.5 sm:p-4 bg-slate-50/90 border-b border-slate-200"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2.5 mb-2.5 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                {timeframe === 'today'
                  ? 'Status Kerja Harian (Hari Ini)'
                  : timeframe === 'week'
                  ? 'Status Kerja Mingguan (Minggu Ini)'
                  : timeframe === 'month'
                  ? 'Status Kerja Bulanan (Bulan Ini)'
                  : 'Status Kerja (Semua Riwayat Data)'}
              </span>
              <span className="text-xs text-slate-500 ml-1.5 font-medium hidden sm:inline">
                ({new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-sheet-history-copy-report"
              onClick={handleCopyReport}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                copiedReport
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300'
              }`}
              title="Salin report ringkasan status packing ke clipboard"
            >
              {copiedReport ? (
                <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{copiedReport ? 'Report Tersalin!' : 'Salin Report'}</span>
            </button>

            <div className="inline-flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                id="btn-sheet-history-timeframe-today"
                onClick={() => setTimeframe('today')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeframe === 'today'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Harian
              </button>
              <button
                type="button"
                id="btn-sheet-history-timeframe-week"
                onClick={() => setTimeframe('week')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeframe === 'week'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mingguan
              </button>
              <button
                type="button"
                id="btn-sheet-history-timeframe-month"
                onClick={() => setTimeframe('month')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeframe === 'month'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bulanan
              </button>
              <button
                type="button"
                id="btn-sheet-history-timeframe-all"
                onClick={() => setTimeframe('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeframe === 'all'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
            </div>
          </div>
        </div>

        {/* 3 Mini Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {/* Card 1: Total Nota Periode */}
          <div
            id="mini-card-today-total"
            onClick={() => setStatusFilter('all')}
            className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
            title="Klik untuk memfilter semua nota pada periode aktif"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Nota (
                  {timeframe === 'today'
                    ? 'Hari Ini'
                    : timeframe === 'week'
                    ? 'Minggu Ini'
                    : timeframe === 'month'
                    ? 'Bulan Ini'
                    : 'Semua'}
                  )
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-black text-slate-900 leading-tight">
                    {periodStats.totalPeriod}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">Nota</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md group-hover:bg-indigo-100 transition-colors">
                Lihat →
              </span>
            </div>
          </div>

          {/* Card 2: Sudah Selesai Periode */}
          <div
            id="mini-card-today-packed"
            onClick={() => setStatusFilter('packed')}
            className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/90 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50 transition-all cursor-pointer group flex items-center justify-between"
            title="Klik untuk memfilter nota periode ini yang sudah selesai"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                  Sudah Selesai
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-black text-emerald-800 leading-tight">
                    {periodStats.packedPeriod}
                  </span>
                  <span className="text-xs text-emerald-700 font-semibold">Nota</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-emerald-900 bg-emerald-200/80 px-2 py-0.5 rounded-full block">
                {periodStats.percentPeriod}% Selesai
              </span>
            </div>
          </div>

          {/* Card 3: Pending Periode */}
          <div
            id="mini-card-today-pending"
            onClick={() => setStatusFilter('pending')}
            className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/90 shadow-2xs hover:border-amber-300 hover:bg-amber-50 transition-all cursor-pointer group flex items-center justify-between"
            title="Klik untuk memfilter nota periode ini yang masih pending"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                  Pending (Belum Selesai)
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-black text-amber-800 leading-tight">
                    {periodStats.pendingPeriod}
                  </span>
                  <span className="text-xs text-amber-700 font-semibold">Nota</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  periodStats.pendingPeriod > 0
                    ? 'bg-amber-200 text-amber-900 animate-pulse'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {periodStats.pendingPeriod > 0 ? 'Menunggu' : 'Beres'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200 space-y-3">
        {/* Row 1: Source Sheet Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 shrink-0">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Sumber Sheet:
            </span>
            <div className="inline-flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                id="btn-source-tab-all"
                onClick={() => setSourceTabFilter('all')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  sourceTabFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilkan seluruh data nota dari tab 'Nota Diproses' dan 'Packing Reg'"
              >
                <span>Semua Sumber ({totalInSheet})</span>
              </button>
              <button
                type="button"
                id="btn-source-tab-nota"
                onClick={() => setSourceTabFilter('nota')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  sourceTabFilter === 'nota'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-indigo-900 hover:text-indigo-950'
                }`}
                title="Tampilkan nota dari Tab 'Nota Diproses'"
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>Tab "Nota Diproses" ({notaTabCount})</span>
              </button>
              <button
                type="button"
                id="btn-source-tab-packing"
                onClick={() => setSourceTabFilter('packing')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  sourceTabFilter === 'packing'
                    ? 'bg-emerald-700 text-white shadow-2xs font-black'
                    : 'text-emerald-900 hover:text-emerald-950'
                }`}
                title="Tampilkan riwayat dari Tab 'Packing Reg'"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Tab "Packing Reg" ({packingTabCount})</span>
              </button>
            </div>
          </div>

          {syncedBothCount > 0 && (
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span><strong>{syncedBothCount}</strong> nota tersinkron di kedua tab</span>
            </span>
          )}
        </div>

        {/* Row 2: Status, Platform, Search */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Status:
            </span>
            <div className="inline-flex bg-slate-200/70 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({totalInSheet})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-amber-800 hover:text-amber-900'
                }`}
              >
                Belum Packing ({pendingInSheet})
              </button>
              {overdueInSheet > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('overdue')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                    statusFilter === 'overdue'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-rose-700 hover:text-rose-900 bg-rose-50/80'
                  }`}
                  title={`Nota pending lebih dari ${formatThresholdLabel(effectiveThreshold)}`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Tertunda &gt;{formatThresholdLabel(effectiveThreshold)} ({overdueInSheet})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatusFilter('packed')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'packed'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-800 hover:text-emerald-900'
                }`}
              >
                Sudah Packing ({packedInSheet})
              </button>
            </div>

            <div className="hidden sm:block h-4 w-[1px] bg-slate-300 mx-1" />

            <span className="text-xs font-bold text-slate-500 hidden sm:inline">Platform:</span>
            {(['Semua', 'Shopee', 'Tokopedia/TikTok'] as const).map((plat) => (
              <button
                key={plat}
                type="button"
                onClick={() => setPlatformFilter(plat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  platformFilter === plat
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {plat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56 md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                placeholder="Cari no nota / tgl / catatan..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-medium text-slate-800 uppercase placeholder:normal-case placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortDescending(!sortDescending)}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors"
              title={sortDescending ? 'Urutan: Baris Terkini di Atas' : 'Urutan: Baris Awal di Atas'}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleCopyOrderNumbers}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Salin semua nomor nota di sheet yang tampil"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleDownloadCSV}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Unduh seluruh data Google Sheet ke file CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        {!accessToken ? (
          <div className="p-8 text-center text-slate-500">
            <AlertCircle className="w-8 h-8 mx-auto text-amber-500 mb-2 opacity-80" />
            <h4 className="text-sm font-bold text-slate-800">
              {userEmail ? 'Sesi Google Sheets Perlu Diperbarui' : 'Hubungkan Akun Google untuk Membaca Sheet'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              {userEmail
                ? `Akun Anda (${userEmail}) sudah terhubung, namun izin sesi Google Sheet perlu diperbarui agar data hasil scan dapat dimuat dari tab "${resolvedTabName}".`
                : `Aplikasi memerlukan izin baca Google Spreadsheet untuk menampilkan data nota yang sudah tersimpan di tab "${resolvedTabName}".`}
            </p>
            {onLoginGoogle && (
              <button
                type="button"
                onClick={onLoginGoogle}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>{userEmail ? 'Perbarui Sesi Google' : 'Masuk dengan Google'}</span>
              </button>
            )}
          </div>
        ) : loading && sheetRows.length === 0 ? (
          <div className="p-10 text-center text-slate-500 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
            <span className="text-sm font-bold text-slate-800">
              Menghubungkan ke Google Sheet...
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Membaca data dari tab "{resolvedTabName}"
            </span>
          </div>
        ) : error ? (
          <div className="p-6 text-center bg-amber-50/80 border border-amber-200 rounded-2xl m-4">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-600" />
            <p className="text-xs font-bold text-slate-800">{error}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {onLoginGoogle && (
                <button
                  type="button"
                  onClick={onLoginGoogle}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Perbarui Sesi Google</span>
                </button>
              )}
              <button
                type="button"
                onClick={loadSheetHistory}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors shadow-2xs"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        ) : sheetRows.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Belum Ada Data di Tab "{resolvedTabName}"</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Gunakan tombol "Simpan ke Sheet" di tabel sesi scan di atas untuk mengunggah hasil scan nota Anda ke Google Spreadsheet.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 text-center w-12">No</th>
                <th className="py-2.5 px-4">No Nota / Pesanan</th>
                <th className="py-2.5 px-4">Platform</th>
                <th className="py-2.5 px-4">Sumber Sheet</th>
                <th className="py-2.5 px-4">Waktu Admin</th>
                <th className="py-2.5 px-4 text-center">Status Packing</th>
                <th className="py-2.5 px-4">Waktu Packing</th>
                <th className="py-2.5 px-4">Catatan</th>
                <th className="py-2.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {filteredAndSortedRows.length > 0 ? (
                filteredAndSortedRows.map((row, idx) => {
                  const parsedRowDate = !row.isPacked ? parseNotaDateTime(row.adminDate, row.adminTime) : null;
                  const elapsedMinutes = parsedRowDate
                    ? Math.max(0, Math.floor((Date.now() - parsedRowDate.getTime()) / 60000))
                    : 0;
                  const isRowOverdue = !row.isPacked && elapsedMinutes >= effectiveThreshold;

                  return (
                    <tr
                      key={`${row.orderNumber}-${row.rowNumber}-${idx}`}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        row.isPacked
                          ? 'bg-emerald-50/15'
                          : isRowOverdue
                          ? 'bg-rose-50/30'
                          : 'bg-amber-50/15'
                      }`}
                    >
                      <td className="py-2.5 px-4 text-center text-slate-400 font-mono text-[11px]">
                        {row.no || idx + 1}
                      </td>

                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          {isRowOverdue && (
                            <AlertTriangle
                              className="w-3.5 h-3.5 text-rose-600 animate-pulse shrink-0"
                              title={`Tertunda > ${formatThresholdLabel(effectiveThreshold)} (+${formatElapsedDuration(elapsedMinutes)})`}
                            />
                          )}
                          <span className={isRowOverdue ? 'text-rose-950 font-black' : ''}>
                            {row.orderNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopySingle(row.orderNumber, `sheet-${idx}`)}
                            className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="Salin nomor"
                          >
                            {copiedId === `sheet-${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md font-bold text-[11px] ${getPlatformColor(
                            row.platform
                          )}`}
                        >
                          {row.platform}
                        </span>
                      </td>

                      <td className="py-2.5 px-4">
                        {row.sourceSheetTab === 'both' || (row.matchedFromPackingReg && row.sourceSheetTab === 'Nota Diproses') ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300"
                            title="Tersinkron di 2 Sheet: Nota Diproses & Packing Reg"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Sinkron 2 Sheet</span>
                          </span>
                        ) : row.sourceSheetTab === 'Packing Reg' || row.matchedFromPackingReg ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200"
                            title="Tersimpan di Sheet Packing Reg (Sudah Packing)"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span>Packing Reg</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                            title="Tersimpan di Sheet Nota Diproses"
                          >
                            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>Nota Diproses</span>
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 text-slate-600">
                        <div>{row.adminTime}</div>
                        <div className="text-[10px] text-slate-400">{row.adminDate}</div>
                      </td>

                      <td className="py-2.5 px-4 text-center">
                        {row.isPacked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Sudah Packing</span>
                          </span>
                        ) : isRowOverdue ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs"
                            title={`Belum dipacking melebihi ${formatThresholdLabel(effectiveThreshold)} (+${formatElapsedDuration(elapsedMinutes)})`}
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600 animate-pulse" />
                            <span>Tertunda &gt;{formatThresholdLabel(effectiveThreshold)}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                            <Clock className="w-3 h-3 text-amber-700" />
                            <span>Belum Packing</span>
                          </span>
                        )}
                      </td>

                    <td className="py-2.5 px-4 text-slate-600 text-[11px]">
                      {row.packingTime && row.packingTime !== '-' ? (
                        <span className="font-semibold text-emerald-800">{row.packingTime}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate text-[11px]">
                      {row.notes || '-'}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopySingle(row.orderNumber, `sheet-${idx}`)}
                        className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all"
                        title="Salin nomor pesanan"
                      >
                        {copiedId === `sheet-${idx}` ? 'Tersalin' : 'Salin'}
                      </button>
                    </td>
                  </tr>
                );
              })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    <p className="text-xs">Tidak ada data sheet yang cocok dengan filter atau kata kunci pencarian.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 px-4">
        <span>
          Menampilkan <strong>{filteredAndSortedRows.length}</strong> dari <strong>{totalInSheet}</strong> baris data di Google Sheet ({resolvedTabName}).
        </span>
        <span className="text-slate-400">
          Data diupdate secara otomatis setiap kali Anda menyimpan dari aplikasi.
        </span>
      </div>
    </div>
  );
};
