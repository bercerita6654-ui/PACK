import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ScanBarcode,
  Search,
  Copy,
  Trash2,
  Download,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  CloudUpload,
  Loader2,
  ClipboardList,
  Upload,
  Zap,
  Clock,
  Check,
  FileText,
  X,
  CornerDownLeft,
  Barcode,
  Share2,
  FileSpreadsheet,
  TrendingUp,
  Percent,
  Boxes,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Info,
  ChevronDown,
  ExternalLink,
  Camera,
  Smartphone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CameraBarcodeScannerModal } from './CameraBarcodeScannerModal';
import {
  PackedOrder,
  PlatformType,
  ProcessedNota,
  SheetProcessedNotaRow,
  ToastItem,
  ToastOptions,
} from '../types';
import { detectPlatform, getPlatformColor } from '../utils/platformDetector';
import { soundFX } from '../utils/audio';
import { PackingSheetHistory } from './PackingSheetHistory';
import { fetchCrossReferencedNotasAndPacking } from '../services/googleWorkspace';
import {
  isNotaDelayed,
  isDateToday,
  isDateYesterday,
  isDateThisWeek,
  isDateThisMonth,
  DEFAULT_DELAY_THRESHOLD_MINUTES,
  formatThresholdLabel,
  generatePackingReportText,
  normalizeOrderNumber,
  evaluateNotaPackedStatus,
} from '../utils/notaDelay';

interface PackingSectionProps {
  orders: PackedOrder[];
  onAddOrder: (orderNumber: string, platform: PlatformType) => boolean;
  onAddOrdersBatch?: (
    orders: { orderNumber: string; platform: PlatformType }[],
    allowDuplicates?: boolean
  ) => { added: number; duplicates: number };
  onRemoveOrder: (id: string) => void;
  onClearOrders: () => void;
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
  targetSpreadsheetId?: string;
  targetSheetTab?: string;
  lastSyncTimestamp?: number;
  processedNotas?: ProcessedNota[];
  onNavigateToNotas?: () => void;
  onNavigateToSheetHistory?: () => void;
  onNavigateToBeranda?: () => void;
  delayThreshold?: number;
}

type ScanMode = 'single' | 'batch_paste';

interface ParsedBatchItem {
  orderNumber: string;
  platform: PlatformType;
  isExistingDuplicate: boolean;
  isInternalDuplicate: boolean;
}

export const PackingSection: React.FC<PackingSectionProps> = ({
  orders,
  onAddOrder,
  onAddOrdersBatch,
  onRemoveOrder,
  onClearOrders,
  onSyncGoogleSheet,
  isSyncing = false,
  showToast,
  accessToken,
  userEmail,
  onLoginGoogle,
  onTokenExpired,
  targetSpreadsheetId = '1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI',
  targetSheetTab = 'Packing Reg',
  lastSyncTimestamp,
  processedNotas = [],
  onNavigateToNotas,
  onNavigateToSheetHistory,
  onNavigateToBeranda,
  delayThreshold = DEFAULT_DELAY_THRESHOLD_MINUTES,
}) => {
  // Navigation between Single Rapid Scan and Batch Paste
  const [scanMode, setScanMode] = useState<ScanMode>('single');

  // Count delayed pending notas
  const delayedNotasCount = useMemo(() => {
    const now = Date.now();
    return processedNotas.filter((n) => isNotaDelayed(n, delayThreshold, now)).length;
  }, [processedNotas, delayThreshold]);

  // Single Scanner state
  const [scanInput, setScanInput] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoFocus, setAutoFocus] = useState<boolean>(true);
  const [continuousBatchMode, setContinuousBatchMode] = useState<boolean>(true);
  const [sessionBatchCount, setSessionBatchCount] = useState<number>(0);
  const [recentScans, setRecentScans] = useState<
    { id: string; orderNumber: string; platform: PlatformType; timestamp: string; isDuplicate?: boolean }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'Semua' | PlatformType>('Semua');
  const [duplicateWarning, setDuplicateWarning] = useState<PackedOrder | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState<boolean>(false);

  // Autocomplete / Suggestions for Unpacked Orders
  const [isSuggestionOpen, setIsSuggestionOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const suggestionContainerRef = useRef<HTMLDivElement>(null);

  // Batch Paste state
  const [batchText, setBatchText] = useState<string>('');
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionContainerRef.current &&
        !suggestionContainerRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsSuggestionOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync sound settings
  useEffect(() => {
    soundFX.enabled = soundEnabled;
  }, [soundEnabled]);

  // Keep focus on input for continuous physical barcode scanner operation
  useEffect(() => {
    if (scanMode === 'single' && autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus, scanMode, orders]);

  // Handle Single Scan Submit
  const handleProcessScan = (rawCode?: string) => {
    const code = (rawCode !== undefined ? rawCode : scanInput).trim().toUpperCase();
    if (!code) {
      showToast('Masukkan atau scan No. Pesanan terlebih dahulu.', 'warning');
      return;
    }

    // Check duplicate against existing orders
    const existing = orders.find(
      (o) => o.orderNumber.toUpperCase() === code
    );

    const nowStr = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (existing) {
      soundFX.playDuplicate();

      // If continuous batch mode is ON, record warning in recent scans and toast, without stopping continuous flow
      if (continuousBatchMode) {
        showToast(`[DUPLIKAT] No. Pesanan ${code} sudah pernah di-scan sebelumnya!`, 'warning');
        setRecentScans((prev) => [
          {
            id: `${Date.now()}-dup`,
            orderNumber: code,
            platform: existing.platform,
            timestamp: nowStr,
            isDuplicate: true,
          },
          ...prev.slice(0, 4),
        ]);
        setScanInput('');
        if (autoFocus && inputRef.current) {
          inputRef.current.focus();
        }
        return;
      }

      setDuplicateWarning(existing);
      return;
    }

    // Detect platform
    const platform = detectPlatform(code);

    const success = onAddOrder(code, platform);
    if (success) {
      soundFX.playSuccess();
      const platformName = platform === 'Tokopedia/TikTok' ? 'Tokopedia / TikTok' : platform;
      const matchingNota = processedNotas?.find((n) => n.orderNumber.toUpperCase() === code);

      if (matchingNota) {
        showToast(`No. Pesanan ${code} (${platformName}) di-scan! ✓ Cocok dengan Nota Admin`, 'success');
      } else if (processedNotas && processedNotas.length > 0) {
        showToast(`No. Pesanan ${code} (${platformName}) di-scan (Belum ada di daftar Nota Admin)`, 'info');
      } else {
        showToast(`No. Pesanan ${code} (${platformName}) berhasil di-scan!`, 'success');
      }

      setSessionBatchCount((prev) => prev + 1);

      // Add to live recent scans ticker
      setRecentScans((prev) => [
        {
          id: `${Date.now()}`,
          orderNumber: code,
          platform,
          timestamp: nowStr,
          isDuplicate: false,
        },
        ...prev.slice(0, 4),
      ]);

      setScanInput('');
      setDuplicateWarning(null);
      if (autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  // If user chooses to add anyway despite duplicate
  const handleForceAddDuplicate = () => {
    if (!duplicateWarning) return;
    const code = duplicateWarning.orderNumber.trim().toUpperCase();
    const platform = detectPlatform(code);
    onAddOrder(code, platform);
    soundFX.playSuccess();
    showToast(`No. Pesanan ${code} tetap ditambahkan.`, 'info');
    setSessionBatchCount((prev) => prev + 1);
    setScanInput('');
    setDuplicateWarning(null);
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Platform live preview based on what's typed
  const previewPlatform = scanInput.trim() ? detectPlatform(scanInput.toUpperCase()) : null;
  const previewColor = previewPlatform ? getPlatformColor(previewPlatform) : null;

  // Stats calculation
  const totalOrders = orders.length;
  const shopeeCount = orders.filter((o) => o.platform === 'Shopee').length;
  const tokpedTiktokCount = orders.filter((o) => o.platform === 'Tokopedia/TikTok').length;

  // =====================
  // BATCH PARSING ENGINE
  // =====================
  const parsedBatchItems: ParsedBatchItem[] = useMemo(() => {
    if (!batchText.trim()) return [];

    // Split by newlines, commas, semicolons, tabs or multiple spaces
    const tokens = batchText
      .split(/[\r\n,;\t]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const existingMap = new Set(orders.map((o) => o.orderNumber.toUpperCase()));
    const seenInThisBatch = new Set<string>();
    const result: ParsedBatchItem[] = [];

    for (const token of tokens) {
      // Remove surrounding quotes or clean up barcode prefixes if any
      const cleaned = token.replace(/^[",'\s]+|[",'\s]+$/g, '').trim().toUpperCase();
      if (!cleaned) continue;

      const upper = cleaned;
      const isExistingDuplicate = existingMap.has(upper);
      const isInternalDuplicate = seenInThisBatch.has(upper);

      seenInThisBatch.add(upper);

      result.push({
        orderNumber: upper,
        platform: detectPlatform(upper),
        isExistingDuplicate,
        isInternalDuplicate,
      });
    }

    return result;
  }, [batchText, orders]);

  // Batch analytics
  const batchStats = useMemo(() => {
    const total = parsedBatchItems.length;
    const existingDuplicates = parsedBatchItems.filter((i) => i.isExistingDuplicate).length;
    const internalDuplicates = parsedBatchItems.filter((i) => i.isInternalDuplicate).length;
    const uniqueTotal = skipDuplicates
      ? parsedBatchItems.filter((i) => !i.isExistingDuplicate && !i.isInternalDuplicate).length
      : total;

    const shopeeInBatch = parsedBatchItems.filter((i) => i.platform === 'Shopee').length;
    const tokpedInBatch = parsedBatchItems.filter((i) => i.platform === 'Tokopedia/TikTok').length;

    return {
      total,
      existingDuplicates,
      internalDuplicates,
      uniqueTotal,
      shopeeInBatch,
      tokpedInBatch,
    };
  }, [parsedBatchItems, skipDuplicates]);

  // Execute Batch Import
  const handleExecuteBatchImport = () => {
    if (parsedBatchItems.length === 0) {
      showToast('Tidak ada nomor pesanan yang valid untuk diimpor.', 'warning');
      return;
    }

    setIsProcessingBatch(true);

    const itemsToImport = skipDuplicates
      ? parsedBatchItems.filter((i) => !i.isExistingDuplicate && !i.isInternalDuplicate)
      : parsedBatchItems;

    if (itemsToImport.length === 0) {
      showToast('Semua nomor pesanan dalam batch sudah pernah di-scan sebelumnya (Duplikat).', 'warning');
      setIsProcessingBatch(false);
      return;
    }

    if (onAddOrdersBatch) {
      const { added, duplicates } = onAddOrdersBatch(
        itemsToImport.map((i) => ({ orderNumber: i.orderNumber, platform: i.platform })),
        !skipDuplicates
      );
      soundFX.playBatchSuccess();
      showToast(
        `Berhasil mengimpor ${added} nomor pesanan ke daftar packing!${
          duplicates > 0 ? ` (${duplicates} duplikat dilewati)` : ''
        }`,
        'success'
      );
    } else {
      // Fallback
      let count = 0;
      for (const item of itemsToImport) {
        onAddOrder(item.orderNumber, item.platform);
        count++;
      }
      soundFX.playBatchSuccess();
      showToast(`Berhasil mengimpor ${count} nomor pesanan!`, 'success');
    }

    setBatchText('');
    setIsProcessingBatch(false);
  };

  // Load Batch Example Data
  const handleLoadSampleBatch = () => {
    const sample = [
      '2609032TQ99KX5',
      '585861788212430295',
      '26090389XYZ12A',
      '585861788212430299',
      '26090344PLMN80',
      '585861788212430302',
      '26090399KLOP01',
      '585861788212430310',
    ].join('\n');
    setBatchText(sample);
    showToast('8 nomor pesanan contoh berhasil dimasukkan.', 'info');
  };

  // Handle File Upload (.txt or .csv)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setBatchText((prev) => (prev ? prev + '\n' + content.toUpperCase() : content.toUpperCase()));
        showToast(`File "${file.name}" berhasil dimuat.`, 'success');
      }
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Clean and format batch text separators into neat newlines
  const handleFormatBatchSeparators = () => {
    if (!batchText.trim()) return;
    const items = batchText
      .split(/[\r\n,;\t\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    setBatchText(items.join('\n'));
    showToast(`${items.length} nomor pesanan dirapikan per baris.`, 'success');
  };

  // Filtered orders for table
  const filteredOrders = orders.filter((order) => {
    const matchPlatform =
      selectedPlatformFilter === 'Semua' || order.platform === selectedPlatformFilter;
    const matchQuery =
      !searchQuery.trim() ||
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      order.platform.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchPlatform && matchQuery;
  });

  // Copy order numbers to clipboard
  const handleCopyList = (platform?: PlatformType) => {
    const target = platform
      ? orders.filter((o) => o.platform === platform)
      : orders;

    if (target.length === 0) {
      showToast('Tidak ada data no. pesanan untuk disalin.', 'warning');
      return;
    }

    const text = target.map((o) => o.orderNumber).join('\n');
    navigator.clipboard.writeText(text).then(
      () => {
        showToast(
          `${target.length} nomor pesanan ${platform || 'semua'} berhasil disalin ke clipboard!`,
          'success'
        );
      },
      () => {
        showToast('Gagal menyalin data ke clipboard.', 'warning');
      }
    );
  };

  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // Copy Formatted Packing Status Report (e.g. Update Harian Pesanan REG)
  const handleCopyPackingReport = async () => {
    const totalNotas =
      processedNotas && processedNotas.length > 0 ? processedNotas.length : orders.length;
    const packedNotas =
      processedNotas && processedNotas.length > 0
        ? processedNotas.filter((n) => n.isPacked).length
        : orders.length;
    const pendingNotas = Math.max(0, totalNotas - packedNotas);

    // Extract last update time
    const lastPackedTimeStr =
      orders.length > 0 ? orders[orders.length - 1].timestamp : undefined;

    const sourceRows = processedNotas && processedNotas.length > 0 ? processedNotas : orders;
    const shopeeTotal = sourceRows.filter((n) => n.platform === 'Shopee').length;
    const tokpedTotal = sourceRows.filter((n) => n.platform === 'Tokopedia/TikTok').length;
    const shopeePacked =
      processedNotas && processedNotas.length > 0
        ? processedNotas.filter((n) => n.isPacked && n.platform === 'Shopee').length
        : orders.filter((o) => o.platform === 'Shopee').length;
    const tokpedPacked =
      processedNotas && processedNotas.length > 0
        ? processedNotas.filter((n) => n.isPacked && n.platform === 'Tokopedia/TikTok').length
        : orders.filter((o) => o.platform === 'Tokopedia/TikTok').length;
    const shopeePending = Math.max(0, shopeeTotal - shopeePacked);
    const tokpedPending = Math.max(0, tokpedTotal - tokpedPacked);

    const reportText = generatePackingReportText({
      totalCount: totalNotas,
      packedCount: packedNotas,
      pendingCount: pendingNotas,
      timeframe: 'today',
      lastPackedTimeStr,
      customDate: new Date(),
      breakdown: {
        total: { shopee: shopeeTotal, tokped: tokpedTotal },
        packed: { shopee: shopeePacked, tokped: tokpedPacked },
        pending: { shopee: shopeePending, tokped: tokpedPending },
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

  // Export Packing CSV
  const handleExportCSV = () => {
    if (orders.length === 0) {
      showToast('Belum ada data paket packing untuk diunduh.', 'warning');
      return;
    }

    let csv = 'No,No Pesanan,Platform,Tanggal,Waktu Scan,Status\n';
    orders.forEach((o, idx) => {
      csv += `${idx + 1},"${o.orderNumber}","${o.platform}","${o.date}","${o.timestamp}","Sudah di-packing"\n`;
    });

    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csv);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `paket-packing-${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File CSV Paket Packing berhasil diunduh.', 'success');
  };

  // Google Sheet live cross-referenced state for Performa Packing
  const [sheetRows, setSheetRows] = useState<SheetProcessedNotaRow[]>([]);
  const [sheetLoading, setSheetLoading] = useState<boolean>(false);
  const [todayStatsSource, setTodayStatsSource] = useState<'sheet' | 'local'>('sheet');
  const [sheetResolvedTab, setSheetResolvedTab] = useState<string>('Nota Diproses');
  const [sheetResolvedPackingTab, setSheetResolvedPackingTab] = useState<string>(targetSheetTab || 'Packing Reg');
  const [packingTimeframe, setPackingTimeframe] = useState<'today' | 'yesterday' | 'week' | 'all'>('today');

  // Cache raw sheet payload to allow instant in-memory re-evaluations when orders change
  const rawSheetResultRef = useRef<{
    notaRows: string[][];
    packingRows: string[][];
    packingMap: Map<string, { timestamp: string; platform: string; date: string }>;
    totalPackingCount: number;
    notaTabName: string;
    packingTabName: string;
    notaHeaders: string[];
    packingHeaders: string[];
  } | null>(null);

  // 5-minute auto-refresh cycle (300 seconds)
  const REFRESH_INTERVAL_SECONDS = 300;
  const [countdown, setCountdown] = useState<number>(REFRESH_INTERVAL_SECONDS);

  const sheetLoadingRef = useRef(sheetLoading);
  useEffect(() => {
    sheetLoadingRef.current = sheetLoading;
  }, [sheetLoading]);

  const loadSheetData = useCallback(async () => {
    if (!accessToken) {
      setSheetRows([]);
      rawSheetResultRef.current = null;
      return;
    }
    setSheetLoading(true);
    try {
      const result = await fetchCrossReferencedNotasAndPacking(
        accessToken,
        targetSpreadsheetId,
        'Nota Diproses',
        targetSheetTab || 'Packing Reg'
      );
      rawSheetResultRef.current = result;
      setSheetResolvedTab(result.notaTabName);
      setSheetResolvedPackingTab(result.packingTabName);

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
        const rawStatus = r[colStatus] ? r[colStatus].trim() : '';
        const packingTime = r[colPackTime] ? r[colPackTime].trim() : '';
        const notes = r[colNotes] ? r[colNotes].trim() : '';

        if (!orderNumber) return;

        const evaluated = evaluateNotaPackedStatus(
          rawStatus,
          packingTime,
          orderNumber,
          orders,
          processedNotas,
          result.packingMap
        );
        const isPacked = evaluated.isPacked;

        let platform: PlatformType = 'Shopee';
        const pLower = rawPlatform.toLowerCase();
        if (pLower.includes('tokopedia') || pLower.includes('tiktok') || pLower.includes('tokped')) {
          platform = 'Tokopedia/TikTok';
        } else if (pLower.includes('shopee')) {
          platform = 'Shopee';
        } else {
          platform = detectPlatform(orderNumber);
        }

        parsed.push({
          rowNumber: idx + 2,
          no,
          orderNumber,
          platform,
          adminDate,
          adminTime,
          isPacked,
          packingStatus: evaluated.resolvedStatus,
          packingTime: evaluated.resolvedTime,
          notes,
        });
      });

      setSheetRows(parsed);
      setTodayStatsSource('sheet');
    } catch {
      // ignore
    } finally {
      setSheetLoading(false);
    }
  }, [accessToken, targetSpreadsheetId, targetSheetTab]);

  const loadSheetDataRef = useRef(loadSheetData);
  useEffect(() => {
    loadSheetDataRef.current = loadSheetData;
  }, [loadSheetData]);

  useEffect(() => {
    if (accessToken) {
      loadSheetData();
    }
  }, [accessToken, loadSheetData]);

  // Reset 5-minute countdown on sync
  useEffect(() => {
    setCountdown(REFRESH_INTERVAL_SECONDS);
  }, [lastSyncTimestamp]);

  // Auto-refresh interval every 5 minutes (300 seconds)
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

  const handleManualRefreshSheet = () => {
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

  // Instant in-memory re-evaluation when orders or processedNotas change without triggering network requests
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
          orders,
          processedNotas,
          packingMap
        );
        if (evalRes.isPacked !== r.isPacked || evalRes.resolvedStatus !== r.packingStatus) {
          return {
            ...r,
            isPacked: evalRes.isPacked,
            packingStatus: evalRes.resolvedStatus,
            packingTime: evalRes.resolvedTime || r.packingTime,
          };
        }
        return r;
      });
    });
  }, [orders, processedNotas]);

  // Fast reactive lookup for orders scanned in active packing session
  const scannedOrdersLookup = useMemo(() => {
    const exactSet = new Set<string>();
    const normSet = new Set<string>();
    orders.forEach((o) => {
      const u = o.orderNumber.trim().toUpperCase();
      if (u) exactSet.add(u);
      const n = normalizeOrderNumber(o.orderNumber);
      if (n) normSet.add(n);
    });
    return {
      has: (orderNum?: string) => {
        if (!orderNum) return false;
        const u = orderNum.trim().toUpperCase();
        if (exactSet.has(u)) return true;
        const n = normalizeOrderNumber(orderNum);
        return Boolean(n && normSet.has(n));
      },
    };
  }, [orders]);

  // Aggregated list of all UNPACKED orders (from both Google Sheets & Local Processed Notas)
  const allUnpackedOrders = useMemo(() => {
    const seen = new Set<string>();
    const list: {
      orderNumber: string;
      platform: PlatformType;
      adminDate?: string;
      adminTime?: string;
      rowNumber?: number;
      isDelayed?: boolean;
      source: 'sheet' | 'local';
    }[] = [];
    const now = Date.now();

    // 1. From Google Sheet Nota Diproses
    sheetRows.forEach((r) => {
      const u = (r.orderNumber || '').trim().toUpperCase();
      if (!u || r.isPacked || scannedOrdersLookup.has(r.orderNumber)) return;
      const norm = normalizeOrderNumber(r.orderNumber) || u;
      if (seen.has(norm)) return;
      seen.add(norm);

      const delayed = isNotaDelayed(
        { orderNumber: r.orderNumber, date: r.adminDate, timestamp: r.adminTime } as any,
        delayThreshold,
        now
      );

      list.push({
        orderNumber: r.orderNumber,
        platform: r.platform || detectPlatform(r.orderNumber),
        adminDate: r.adminDate,
        adminTime: r.adminTime,
        rowNumber: r.rowNumber,
        isDelayed: delayed,
        source: 'sheet',
      });
    });

    // 2. From Local Processed Notas
    (processedNotas || []).forEach((n) => {
      const u = (n.orderNumber || '').trim().toUpperCase();
      if (!u || n.isPacked || scannedOrdersLookup.has(n.orderNumber)) return;
      const norm = normalizeOrderNumber(n.orderNumber) || u;
      if (seen.has(norm)) return;
      seen.add(norm);

      const delayed = isNotaDelayed(n, delayThreshold, now);

      list.push({
        orderNumber: n.orderNumber,
        platform: n.platform || detectPlatform(n.orderNumber),
        adminDate: n.date,
        adminTime: n.timestamp,
        isDelayed: delayed,
        source: 'local',
      });
    });

    return list;
  }, [sheetRows, processedNotas, scannedOrdersLookup, delayThreshold]);

  // Autocomplete suggestions based on user input
  const filteredSuggestions = useMemo(() => {
    const query = scanInput.trim().toUpperCase();
    if (!query) {
      // When input is empty, show up to 12 latest pending orders
      return allUnpackedOrders.slice(0, 12);
    }
    const cleanQuery = query.replace(/[^A-Z0-9]/g, '');
    return allUnpackedOrders
      .filter((item) => {
        const rawUpper = item.orderNumber.toUpperCase();
        if (rawUpper.includes(query)) return true;
        if (cleanQuery) {
          const cleanOrder = rawUpper.replace(/[^A-Z0-9]/g, '');
          return cleanOrder.includes(cleanQuery);
        }
        return false;
      })
      .slice(0, 10);
  }, [allUnpackedOrders, scanInput]);

  // Handler to select and scan a suggestion item immediately
  const handleSelectSuggestion = (item: { orderNumber: string; platform: PlatformType }) => {
    setIsSuggestionOpen(false);
    setHighlightedIndex(-1);
    handleProcessScan(item.orderNumber);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSuggestionOpen && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSuggestionOpen(false);
        setHighlightedIndex(-1);
        return;
      }
      if (e.key === 'Enter') {
        if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(filteredSuggestions[highlightedIndex]);
          return;
        }
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      setIsSuggestionOpen(false);
      setHighlightedIndex(-1);
      handleProcessScan();
    }
  };

  const renderHighlightedOrderNumber = (orderNumber: string, query: string) => {
    if (!query) return <span>{orderNumber}</span>;
    const upperOrder = orderNumber.toUpperCase();
    const upperQuery = query.toUpperCase();
    const index = upperOrder.indexOf(upperQuery);
    if (index === -1) return <span>{orderNumber}</span>;

    const before = orderNumber.substring(0, index);
    const match = orderNumber.substring(index, index + query.length);
    const after = orderNumber.substring(index + query.length);

    return (
      <span>
        {before}
        <span className="bg-amber-300 text-amber-950 font-black px-0.5 rounded">
          {match}
        </span>
        {after}
      </span>
    );
  };

  // Google Sheet filtered rows by selected timeframe
  const sheetTimeframeRows = useMemo(() => {
    if (packingTimeframe === 'today') {
      const todayFiltered = sheetRows.filter((r) => isDateToday(r.adminDate, r.adminTime));
      return todayFiltered.length > 0 ? todayFiltered : sheetRows;
    }
    if (packingTimeframe === 'yesterday') {
      return sheetRows.filter((r) => isDateYesterday(r.adminDate, r.adminTime));
    }
    if (packingTimeframe === 'week') {
      return sheetRows.filter((r) => isDateThisWeek(r.adminDate, r.adminTime));
    }
    return sheetRows;
  }, [sheetRows, packingTimeframe]);

  const sheetTodayStats = useMemo(() => {
    // 1. Cek baris sheet yang sudah packing (dari sheet atau baru di-scan saat ini)
    const packedRowsInSheet = sheetTimeframeRows.filter(
      (r) => r.isPacked || scannedOrdersLookup.has(r.orderNumber)
    );
    const pendingRowsInSheet = sheetTimeframeRows.filter(
      (r) => !r.isPacked && !scannedOrdersLookup.has(r.orderNumber)
    );

    // 2. Pesanan yang di-scan di sesi packing tapi tidak tercatat di baris nota sheet
    const extraScannedOrders = orders.filter(
      (o) =>
        !sheetTimeframeRows.some((r) => {
          const rU = r.orderNumber.trim().toUpperCase();
          const oU = o.orderNumber.trim().toUpperCase();
          const rN = normalizeOrderNumber(r.orderNumber);
          const oN = normalizeOrderNumber(o.orderNumber);
          return rU === oU || (Boolean(oN) && rN === oN);
        })
    );

    // Hitung tingkat keberhasilan: dibandingkan pesanan sudah packing vs belum packing
    const packedToday = packedRowsInSheet.length + extraScannedOrders.length;
    const pendingToday = pendingRowsInSheet.length;
    const totalToday = packedToday + pendingToday;
    const percentToday = totalToday > 0 ? Math.round((packedToday / totalToday) * 100) : 0;

    const shopeePacked =
      packedRowsInSheet.filter((r) => r.platform === 'Shopee').length +
      extraScannedOrders.filter((o) => o.platform === 'Shopee').length;
    const shopeePending = pendingRowsInSheet.filter((r) => r.platform === 'Shopee').length;
    const shopeeTotal = shopeePacked + shopeePending;

    const tokpedPacked =
      packedRowsInSheet.filter((r) => r.platform === 'Tokopedia/TikTok').length +
      extraScannedOrders.filter((o) => o.platform === 'Tokopedia/TikTok').length;
    const tokpedPending = pendingRowsInSheet.filter((r) => r.platform === 'Tokopedia/TikTok').length;
    const tokpedTotal = tokpedPacked + tokpedPending;

    return {
      totalToday,
      packedToday,
      pendingToday,
      percentToday,
      shopeeTotal,
      tokpedTotal,
      shopeePacked,
      tokpedPacked,
      shopeePending,
      tokpedPending,
    };
  }, [sheetTimeframeRows, scannedOrdersLookup, orders]);

  // Statistics for active session filtered by timeframe
  const localTodayStats = useMemo(() => {
    let targetNotas = processedNotas;
    if (packingTimeframe === 'today') {
      const todayNotas = processedNotas.filter((n) =>
        isDateToday(n.date, n.timestamp, n.createdAt)
      );
      targetNotas = todayNotas.length > 0 ? todayNotas : processedNotas;
    } else if (packingTimeframe === 'yesterday') {
      targetNotas = processedNotas.filter((n) =>
        isDateYesterday(n.date, n.timestamp, n.createdAt)
      );
    } else if (packingTimeframe === 'week') {
      targetNotas = processedNotas.filter((n) =>
        isDateThisWeek(n.date, n.timestamp, n.createdAt)
      );
    }

    // 1. Cek nota yang sudah packing (dari processedNotas atau baru di-scan saat ini)
    const packedNotas = targetNotas.filter(
      (n) => n.isPacked || scannedOrdersLookup.has(n.orderNumber)
    );
    const pendingNotas = targetNotas.filter(
      (n) => !n.isPacked && !scannedOrdersLookup.has(n.orderNumber)
    );

    // 2. Pesanan di-scan di sesi packing yang belum ada di targetNotas
    const extraScannedOrders = orders.filter(
      (o) =>
        !targetNotas.some((n) => {
          const nU = n.orderNumber.trim().toUpperCase();
          const oU = o.orderNumber.trim().toUpperCase();
          const nN = normalizeOrderNumber(n.orderNumber);
          const oN = normalizeOrderNumber(o.orderNumber);
          return nU === oU || (Boolean(oN) && nN === oN);
        })
    );

    // Hitung tingkat keberhasilan: dibandingkan pesanan sudah packing vs belum packing
    const packedToday = packedNotas.length + extraScannedOrders.length;
    const pendingToday = pendingNotas.length;
    const totalToday = packedToday + pendingToday;
    const percentToday = totalToday > 0 ? Math.round((packedToday / totalToday) * 100) : 0;

    const shopeePacked =
      packedNotas.filter((n) => n.platform === 'Shopee').length +
      extraScannedOrders.filter((o) => o.platform === 'Shopee').length;
    const shopeePending = pendingNotas.filter((n) => n.platform === 'Shopee').length;
    const shopeeTotal = shopeePacked + shopeePending;

    const tokpedPacked =
      packedNotas.filter((n) => n.platform === 'Tokopedia/TikTok').length +
      extraScannedOrders.filter((o) => o.platform === 'Tokopedia/TikTok').length;
    const tokpedPending = pendingNotas.filter((n) => n.platform === 'Tokopedia/TikTok').length;
    const tokpedTotal = tokpedPacked + tokpedPending;

    return {
      totalToday,
      packedToday,
      pendingToday,
      percentToday,
      shopeeTotal,
      tokpedTotal,
      shopeePacked,
      tokpedPacked,
      shopeePending,
      tokpedPending,
    };
  }, [processedNotas, packingTimeframe, scannedOrdersLookup, orders]);

  const timeframeLabel = useMemo(() => {
    switch (packingTimeframe) {
      case 'today':
        return 'Hari Ini';
      case 'yesterday':
        return 'Kemarin';
      case 'week':
        return 'Minggu Ini';
      case 'all':
        return 'Semua Data';
    }
  }, [packingTimeframe]);

  // Active performance metrics chosen by user or auto-fallback
  const activePerformanceStats = useMemo(() => {
    if (todayStatsSource === 'sheet' && sheetRows.length > 0) {
      return {
        source: 'sheet' as const,
        label: `Google Sheet ("${sheetResolvedTab}" ↔ "${sheetResolvedPackingTab}")`,
        timeframeLabel,
        ...sheetTodayStats,
      };
    }
    return {
      source: 'local' as const,
      label: 'Sesi Scan Lokal',
      timeframeLabel,
      ...localTodayStats,
    };
  }, [todayStatsSource, sheetRows.length, sheetTodayStats, localTodayStats, sheetResolvedTab, sheetResolvedPackingTab, timeframeLabel]);

  return (
    <div className="space-y-6">
      {/* Ringkasan Metrik Performa Packing Hari Ini (Nota Masuk vs Berhasil Di-Packing) */}
      <div
        id="packing-performance-summary-top"
        className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-md relative overflow-hidden space-y-4"
      >
        {/* Subtle decorative glows */}
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-white tracking-tight">
                  Performa Packing {activePerformanceStats.timeframeLabel}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {activePerformanceStats.percentToday}% Berhasil Di-Packing
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                <span>
                  {new Date().toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                <span>•</span>
                <span className="text-slate-300">
                  Sumber: <strong>{activePerformanceStats.label}</strong>
                </span>
              </p>
            </div>
          </div>

          {/* Quick Tools & Source Switcher */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
            {/* Timeframe Filter Buttons */}
            <div className="flex items-center gap-0.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setPackingTimeframe('today')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  packingTimeframe === 'today'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
                title="Tampilkan pesanan hari ini"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setPackingTimeframe('yesterday')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  packingTimeframe === 'yesterday'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
                title="Tampilkan pesanan kemarin"
              >
                Kemarin
              </button>
              <button
                type="button"
                onClick={() => setPackingTimeframe('week')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  packingTimeframe === 'week'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
                title="Tampilkan pesanan minggu ini"
              >
                Minggu
              </button>
              <button
                type="button"
                onClick={() => setPackingTimeframe('all')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  packingTimeframe === 'all'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
                title="Tampilkan semua data pesanan"
              >
                Semua
              </button>
            </div>

            {sheetRows.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  id="btn-metric-source-sheet"
                  onClick={() => setTodayStatsSource('sheet')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    todayStatsSource === 'sheet'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                  }`}
                  title="Gunakan data dari Google Sheet"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Google Sheet ({sheetTodayStats.totalToday})</span>
                </button>
                <button
                  type="button"
                  id="btn-metric-source-local"
                  onClick={() => setTodayStatsSource('local')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    todayStatsSource === 'local'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                  }`}
                  title="Gunakan data dari Sesi Scan Lokal"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Sesi Lokal ({localTodayStats.totalToday})</span>
                </button>
              </div>
            )}

            {accessToken && (
              <button
                type="button"
                id="btn-metric-refresh-sheet"
                onClick={handleManualRefreshSheet}
                disabled={sheetLoading}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Segarkan data dari Google Sheets (Auto-refresh setiap 5 menit)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sheetLoading ? 'animate-spin text-emerald-400' : ''}`} />
                <span className="font-mono text-[11px] bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">
                  {formatCountdown(countdown)}
                </span>
              </button>
            )}

            {onNavigateToBeranda && (
              <button
                type="button"
                id="btn-open-beranda-from-metric"
                onClick={onNavigateToBeranda}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1 cursor-pointer"
                title="Buka dashboard lengkap di Beranda"
              >
                <span>Dashboard Beranda</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Primary Metric Grid: Hero Progress & Stat Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 relative z-10">
          {/* Hero Performance Card (5 cols) */}
          <div
            id="card-metric-hero-performance"
            className="lg:col-span-5 bg-slate-800/60 border border-slate-700/70 rounded-xl p-4 sm:p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-emerald-400" />
                  Tingkat Keberhasilan Packing
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                    activePerformanceStats.percentToday === 100
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : activePerformanceStats.percentToday >= 80
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : activePerformanceStats.percentToday >= 50
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : activePerformanceStats.totalToday === 0
                      ? 'bg-slate-700/60 text-slate-400 border-slate-600'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {activePerformanceStats.percentToday === 100
                    ? '✓ 100% Selesai'
                    : activePerformanceStats.percentToday >= 80
                    ? '⚡ Performa Tinggi'
                    : activePerformanceStats.percentToday >= 50
                    ? '⏳ Sedang Berjalan'
                    : activePerformanceStats.totalToday === 0
                    ? 'Belum Ada Pesanan'
                    : '⚠️ Perlu Dikejar'}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-tight transition-all duration-300">
                  {activePerformanceStats.percentToday}%
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  Berhasil Di-Packing
                </span>
              </div>

              <p className="text-xs text-slate-300 mt-1">
                {activePerformanceStats.totalToday > 0 ? (
                  <>
                    <strong className="text-emerald-300 font-bold">
                      {activePerformanceStats.packedToday} sudah packing
                    </strong>{' '}
                    dibandingkan{' '}
                    <strong className="text-amber-300 font-bold">
                      {activePerformanceStats.pendingToday} belum packing
                    </strong>{' '}
                    (Total{' '}
                    <strong className="text-white font-bold">
                      {activePerformanceStats.totalToday} pesanan
                    </strong>).
                  </>
                ) : (
                  'Belum ada data pesanan tercatat untuk periode ini. Scan nota atau periksa data Google Sheet.'
                )}
              </p>

              {/* Dynamic comparison formula feedback */}
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <span className="text-slate-500">Rumus:</span>
                <span className="bg-slate-900/90 px-2 py-0.5 rounded border border-slate-700/80 text-emerald-300">
                  ({activePerformanceStats.packedToday} Sudah ÷ {activePerformanceStats.totalToday} Total) × 100% = {activePerformanceStats.percentToday}%
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="mt-4 pt-3 border-t border-slate-700/60">
              <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
                  style={{ width: `${activePerformanceStats.percentToday}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-medium mt-1.5">
                <span className="text-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Sudah: {activePerformanceStats.packedToday} ({activePerformanceStats.percentToday}%)
                </span>
                <span className="text-amber-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  Belum: {activePerformanceStats.pendingToday} ({activePerformanceStats.totalToday > 0 ? 100 - activePerformanceStats.percentToday : 0}%)
                </span>
              </div>
            </div>
          </div>

          {/* 3 Metric Stat Cards (7 cols) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: TOTAL PESANAN HARI INI */}
            <div
              id="card-metric-total-incoming"
              className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-indigo-300 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Total Pesanan
                  </span>
                  <Boxes className="w-4 h-4 text-indigo-400 shrink-0" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {sheetLoading && todayStatsSource === 'sheet' ? '...' : activePerformanceStats.totalToday}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">Pesanan</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Sudah ({activePerformanceStats.packedToday}) + Belum ({activePerformanceStats.pendingToday})
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-700/60 text-[10px] text-slate-300 flex items-center justify-between">
                <span>Shopee: <strong>{activePerformanceStats.shopeeTotal}</strong></span>
                <span>Tokped: <strong>{activePerformanceStats.tokpedTotal}</strong></span>
              </div>
            </div>

            {/* Card 2: SUDAH DI-PACKING HARI INI */}
            <div
              id="card-metric-total-packed"
              className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-emerald-300 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Sudah Di-Packing
                  </span>
                  <PackageCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
                    {sheetLoading && todayStatsSource === 'sheet' ? '...' : activePerformanceStats.packedToday}
                  </span>
                  <span className="text-xs text-emerald-200/80 font-semibold">Pesanan</span>
                </div>
                <p className="text-[11px] text-emerald-300/80 mt-1">
                  {activePerformanceStats.percentToday}% selesai packing
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-emerald-800/60 text-[10px] text-emerald-200 flex items-center justify-between">
                <span>Shopee: <strong>{activePerformanceStats.shopeePacked}</strong></span>
                <span>Tokped: <strong>{activePerformanceStats.tokpedPacked}</strong></span>
              </div>
            </div>

            {/* Card 3: BELUM DI-PACKING (SISA) */}
            <div
              id="card-metric-total-pending"
              className={`rounded-xl p-3.5 sm:p-4 flex flex-col justify-between border ${
                activePerformanceStats.pendingToday > 0
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  : 'bg-slate-800/60 border-slate-700/70 text-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Belum Di-Packing
                  </span>
                  <Clock className={`w-4 h-4 shrink-0 ${activePerformanceStats.pendingToday > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl sm:text-3xl font-black tracking-tight ${activePerformanceStats.pendingToday > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {sheetLoading && todayStatsSource === 'sheet' ? '...' : activePerformanceStats.pendingToday}
                  </span>
                  <span className="text-xs font-semibold">Pesanan</span>
                </div>
                <p className="text-[11px] mt-1 opacity-80">
                  {activePerformanceStats.pendingToday > 0
                    ? 'Menunggu di-scan packing'
                    : 'Semua sudah selesai packing!'}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-700/60 text-[10px] flex items-center justify-between">
                <span>Shopee: <strong>{activePerformanceStats.shopeePending}</strong></span>
                <span>Tokped: <strong>{activePerformanceStats.tokpedPending}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800 text-xs relative z-10">
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {activePerformanceStats.totalToday > 0 ? (
                <>
                  Tingkat keberhasilan = Sudah Packing / (Sudah Packing + Belum Packing):{' '}
                  <strong className="text-slate-200">
                    ({activePerformanceStats.packedToday} / {activePerformanceStats.totalToday}) × 100% = {activePerformanceStats.percentToday}%
                  </strong>
                </>
              ) : (
                'Menunggu data pesanan untuk menghitung persentase tingkat keberhasilan packing.'
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              id="btn-metric-copy-report"
              onClick={handleCopyPackingReport}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 hover:text-white rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Salin ringkasan laporan packing hari ini untuk dibagikan ke WhatsApp tim"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Laporan Disalin!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Salin Laporan (WA)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Admin Nota Status Banner */}
      {processedNotas && processedNotas.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900">
                  Verifikasi Nota Admin
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200/80 text-amber-900">
                  {processedNotas.filter((n) => n.isPacked).length} / {processedNotas.length} Selesai Dipacking
                </span>
              </div>
              <p className="text-xs text-amber-800/90 mt-0.5">
                {processedNotas.filter((n) => !n.isPacked).length > 0 ? (
                  <span>
                    Masih ada{' '}
                    <strong className="font-bold underline text-amber-950">
                      {processedNotas.filter((n) => !n.isPacked).length} nota diproses
                    </strong>{' '}
                    yang belum di-scan packing.
                  </span>
                ) : (
                  <span className="text-emerald-800 font-bold">
                    ✓ Semua nota yang diproses admin telah selesai dipacking!
                  </span>
                )}
              </p>

              {delayedNotasCount > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-100/90 border border-rose-300 text-rose-900 rounded-lg text-xs font-bold animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>
                    Perhatian: Terdapat {delayedNotasCount} nota tertunda &gt;{formatThresholdLabel(delayThreshold ?? DEFAULT_DELAY_THRESHOLD_MINUTES)} belum di-packing!
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-copy-report-banner-packing"
              onClick={handleCopyPackingReport}
              className="px-3.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
              title="Salin ringkasan format WhatsApp/laporan (Update Harian Pesanan REG)"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Report Tersalin!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-amber-700" />
                  <span>Salin Report</span>
                </>
              )}
            </button>

            {onNavigateToNotas && (
              <button
                type="button"
                id="btn-goto-nota-from-packing"
                onClick={onNavigateToNotas}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 shadow-2xs"
              >
                <span>Lihat Antrean Nota</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scanner Deck (Simplified & Clean) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-100 space-y-4">
        {/* Header & Mode Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Scan Nota (Sudah Packing)
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Siap Scan
              </span>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0 border border-slate-200/80">
            <button
              type="button"
              id="tab-mode-single-scan"
              onClick={() => setScanMode('single')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                scanMode === 'single'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Scan Satuan</span>
            </button>
            <button
              type="button"
              id="tab-mode-batch-paste"
              onClick={() => setScanMode('batch_paste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                scanMode === 'batch_paste'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tempel Massal</span>
              {parsedBatchItems.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-bold">
                  {parsedBatchItems.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* VIEW 1: SINGLE SCAN MODE */}
        {scanMode === 'single' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* Quick Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  id="btn-open-camera-scanner-top"
                  onClick={() => setIsCameraScannerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border transition-all bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs cursor-pointer"
                  title="Buka Scanner Barcode Kamera (Sangat praktis digunakan di HP / Mobile)"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan Kamera</span>
                  <span className="hidden sm:inline text-[10px] bg-indigo-500/80 px-1 py-0.2 rounded font-medium">HP</span>
                </button>

                <button
                  type="button"
                  id="btn-toggle-continuous"
                  onClick={() => setContinuousBatchMode(!continuousBatchMode)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium border transition-colors ${
                    continuousBatchMode
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Scan beruntun cepat tanpa terhenti pop-up duplikat"
                >
                  <Zap className={`w-3 h-3 ${continuousBatchMode ? 'text-amber-300' : 'text-slate-400'}`} />
                  <span>Mode Cepat: {continuousBatchMode ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  id="btn-toggle-autofocus"
                  onClick={() => setAutoFocus(!autoFocus)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium border transition-colors ${
                    autoFocus
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  title="Kunci kursor otomatis di kolom scan"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Auto-Fokus</span>
                </button>

                <button
                  type="button"
                  id="btn-toggle-sound"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium border transition-colors ${
                    soundEnabled
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  title="Suara bip saat scan"
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-3 h-3" />
                      <span>Suara ON</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3 h-3" />
                      <span>Bisu</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Sesi ini: <strong className="text-indigo-700 font-bold">{sessionBatchCount}</strong> paket</span>
                {sessionBatchCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSessionBatchCount(0)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    title="Reset hitungan sesi"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Scanner Input Field with Live Autocomplete */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <ScanBarcode className="w-5 h-5 text-indigo-600" />
                </div>
                <input
                  ref={inputRef}
                  id="scanner-input"
                  type="text"
                  value={scanInput}
                  onFocus={() => {
                    if (allUnpackedOrders.length > 0) {
                      setIsSuggestionOpen(true);
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase();
                    setScanInput(v);
                    setIsSuggestionOpen(true);
                    setHighlightedIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Scan barcode atau ketik no. pesanan..."
                  className="w-full pl-11 pr-28 py-3 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-base sm:text-lg font-mono font-bold uppercase text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 placeholder:text-sm focus:outline-none transition-colors shadow-xs"
                  autoComplete="off"
                  spellCheck="false"
                />

                {/* In-field live platform pill preview */}
                {previewPlatform && previewColor && (
                  <div className="absolute inset-y-0 right-2 flex items-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${previewColor.bg} ${previewColor.text} border ${previewColor.border}`}
                    >
                      <Sparkles className="w-3 h-3" />
                      {previewColor.label}
                    </span>
                  </div>
                )}

                {/* Autocomplete Suggestions Popup for Unpacked Orders */}
                <AnimatePresence>
                  {isSuggestionOpen && filteredSuggestions.length > 0 && (
                    <motion.div
                      ref={suggestionContainerRef}
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white border-2 border-indigo-400 rounded-xl shadow-2xl overflow-hidden max-h-80 flex flex-col"
                    >
                      {/* Suggestions Header */}
                      <div className="bg-slate-900 text-white px-3.5 py-2 flex items-center justify-between text-xs border-b border-slate-800 shrink-0">
                        <div className="flex items-center gap-1.5 font-bold">
                          <PackageOpen className="w-4 h-4 text-amber-400" />
                          <span>
                            {scanInput.trim()
                              ? `Saran Belum Packing (${filteredSuggestions.length})`
                              : `Daftar Belum Packing (${allUnpackedOrders.length} Pesanan)`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-300">
                          <span className="hidden sm:inline">Gunakan <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px]">↓</kbd> lalu <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px]">Enter</kbd></span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsSuggestionOpen(false);
                              setHighlightedIndex(-1);
                            }}
                            className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                            title="Tutup saran"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Suggestions List */}
                      <div className="overflow-y-auto divide-y divide-slate-100 flex-1 overscroll-contain">
                        {filteredSuggestions.map((item, idx) => {
                          const isHighlighted = idx === highlightedIndex;
                          const pCol = getPlatformColor(item.platform);
                          return (
                            <div
                              key={`${item.orderNumber}-${idx}`}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              onClick={() => handleSelectSuggestion(item)}
                              className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                isHighlighted
                                  ? 'bg-indigo-50/90 text-indigo-950 font-medium'
                                  : 'bg-white hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold shrink-0 border ${pCol.bg} ${pCol.text} ${pCol.border}`}
                                >
                                  {item.platform}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <div className="font-mono font-bold text-sm tracking-wide truncate flex items-center gap-1.5">
                                    {renderHighlightedOrderNumber(item.orderNumber, scanInput.trim())}
                                    {item.isDelayed && (
                                      <span className="text-[10px] font-sans font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-300 shrink-0">
                                        ⚠️ Terlambat
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-sans flex items-center gap-2 mt-0.5">
                                    {item.adminDate && (
                                      <span>Tgl: <strong>{item.adminDate}</strong></span>
                                    )}
                                    {item.adminTime && (
                                      <span>Jam: <strong>{item.adminTime}</strong></span>
                                    )}
                                    {item.source === 'sheet' && (
                                      <span className="text-emerald-600 font-medium">(Sheet)</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    isHighlighted
                                      ? 'bg-indigo-600 text-white shadow-xs scale-105'
                                      : 'bg-slate-100 text-slate-700 hover:bg-indigo-100 hover:text-indigo-800'
                                  }`}
                                >
                                  <span>Pilih & Scan</span>
                                  <CornerDownLeft className="w-3.5 h-3.5" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Suggestions Footer */}
                      <div className="bg-slate-50 px-3.5 py-1.5 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-200 shrink-0">
                        <span>Menampilkan {filteredSuggestions.length} dari {allUnpackedOrders.length} belum packing</span>
                        <span className="text-indigo-600 font-medium">Klik no. pesanan untuk langsung scan</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Camera Scanner Button (Mobile / Web) */}
              <button
                type="button"
                id="btn-open-camera-scanner-action"
                onClick={() => setIsCameraScannerOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
                title="Buka Kamera HP / Web untuk scan barcode resi langsung"
              >
                <Camera className="w-4 h-4" />
                <span className="sm:inline">Kamera HP</span>
              </button>

              <button
                type="button"
                id="btn-submit-scan"
                onClick={() => handleProcessScan()}
                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-5 sm:px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <span>Scan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Pending Counter & Helper Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                {allUnpackedOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuggestionOpen((prev) => !prev);
                      if (inputRef.current) inputRef.current.focus();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold transition-colors shadow-2xs"
                    title="Klik untuk membuka/menutup daftar saran pesanan belum packing"
                  >
                    <PackageOpen className="w-3.5 h-3.5 text-amber-600" />
                    <span>{allUnpackedOrders.length} Pesanan Belum Di-Packing</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isSuggestionOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <span>💡 Ada huruf → <strong>Shopee</strong> • Angka saja → <strong>Tokopedia / TikTok</strong></span>
              </div>
              <button
                type="button"
                onClick={() => setScanMode('batch_paste')}
                className="text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                Banyak resi? Tempel Massal →
              </button>
            </div>

            {/* Compact Recent Scans Chips */}
            {recentScans.length > 0 && (
              <div className="pt-1 flex items-center gap-2 overflow-x-auto text-xs">
                <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-indigo-500" />
                  Terbaru:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {recentScans.map((item) => {
                    const pCol = getPlatformColor(item.platform);
                    return (
                      <div
                        key={item.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs ${
                          item.isDuplicate
                            ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        {item.isDuplicate ? (
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                        ) : (
                          <Check className="w-3 h-3 text-emerald-600" />
                        )}
                        <span className="font-bold">{item.orderNumber}</span>
                        <span
                          className={`text-[10px] font-semibold px-1 rounded ${
                            item.isDuplicate ? 'bg-rose-100 text-rose-700' : `${pCol.bg} ${pCol.text}`
                          }`}
                        >
                          {item.isDuplicate ? 'Duplikat' : item.platform}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Duplicate Alert Banner (if non-continuous mode) */}
            <AnimatePresence>
              {duplicateWarning && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-xs">
                      No. Pesanan <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-200">{duplicateWarning.orderNumber}</strong> sudah tercatat pada {duplicateWarning.timestamp}.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setDuplicateWarning(null);
                        setScanInput('');
                        if (autoFocus && inputRef.current) inputRef.current.focus();
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
                    >
                      Lewati
                    </button>
                    <button
                      type="button"
                      onClick={handleForceAddDuplicate}
                      className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg"
                    >
                      Tetap Tambah
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* VIEW 2: BATCH PASTE MODE (Simplified) */}
        {scanMode === 'batch_paste' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* Simple Toolbar */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Tempel daftar no. pesanan (satu per baris):
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  id="btn-upload-file-batch"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                  title="Muat file .txt atau .csv"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Unggah File</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadSampleBatch}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium transition-colors"
                >
                  Contoh Data
                </button>
                {batchText && (
                  <button
                    type="button"
                    onClick={handleFormatBatchSeparators}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                    title="Rapikan format spasi/koma menjadi baris baru"
                  >
                    Rapikan
                  </button>
                )}
              </div>
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                id="batch-scan-textarea"
                rows={5}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value.toUpperCase())}
                placeholder="Tempel daftar no. pesanan di sini (dari Excel, Word, Notepad, dll)..."
                className="w-full p-3 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs sm:text-sm font-mono uppercase text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none transition-colors"
                spellCheck="false"
              />
              {batchText && (
                <button
                  type="button"
                  onClick={() => setBatchText('')}
                  className="absolute top-2.5 right-2.5 p-1 text-slate-400 hover:text-slate-600 bg-white/90 hover:bg-white rounded-md border border-slate-200 text-xs font-medium flex items-center gap-1"
                  title="Hapus teks"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}
            </div>

            {/* Batch Detection Summary Strip & Execute Button */}
            {parsedBatchItems.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-700 font-semibold">
                    Terdeteksi: <strong className="text-slate-900 font-bold">{batchStats.total}</strong> paket
                  </span>
                  <span className="text-orange-600 font-medium">Shopee: {batchStats.shopeeInBatch}</span>
                  <span className="text-emerald-700 font-medium">Tokopedia/TikTok: {batchStats.tokpedInBatch}</span>
                  {batchStats.existingDuplicates + batchStats.internalDuplicates > 0 && (
                    <span className="text-rose-600 font-medium">
                      Duplikat: {batchStats.existingDuplicates + batchStats.internalDuplicates}
                    </span>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700 ml-1">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 w-3.5 h-3.5"
                    />
                    <span>Lewati duplikat</span>
                  </label>
                </div>

                <button
                  type="button"
                  id="btn-execute-batch-import"
                  onClick={handleExecuteBatchImport}
                  disabled={isProcessingBatch || batchStats.uniqueTotal === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
                >
                  {isProcessingBatch ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <CornerDownLeft className="w-3.5 h-3.5" />
                      <span>Impor {batchStats.uniqueTotal} Paket</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Counters & Orders List: Muncul otomatis begitu sudah ada data yang di-scan */}
      {totalOrders > 0 && (
        <>
          {/* Summary Counters: Total, Shopee, Tokopedia/TikTok */}
          <div id="packing-summary-counters" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Card */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Total Sudah Di-Packing
                </span>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                  {totalOrders} <span className="text-xs sm:text-sm font-semibold text-slate-500">Paket</span>
                </div>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>

            {/* Shopee Card */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-orange-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
                    Pesanan Shopee
                  </span>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-orange-600 mt-1">
                  {shopeeCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Paket</span>
                </div>
              </div>
              <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
                <span className="font-black text-lg">S</span>
              </div>
            </div>

            {/* Tokopedia / TikTok Card */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Tokopedia / TikTok
                  </span>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-1">
                  {tokpedTiktokCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Paket</span>
                </div>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
                <span className="font-black text-lg">T</span>
              </div>
            </div>
          </div>

          {/* Orders List & Management */}
          <div id="packing-orders-list-container" className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-100 space-y-4">
            {/* Table Controls: Search, Platform Filter & Export Actions */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Left: Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl shrink-0 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSelectedPlatformFilter('Semua')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    selectedPlatformFilter === 'Semua'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({totalOrders})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatformFilter('Shopee')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    selectedPlatformFilter === 'Shopee'
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-orange-600'
                  }`}
                >
                  Shopee ({shopeeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatformFilter('Tokopedia/TikTok')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    selectedPlatformFilter === 'Tokopedia/TikTok'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  Tokopedia / TikTok ({tokpedTiktokCount})
                </button>
              </div>

              {/* Right: Search & Action buttons */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                    placeholder="Cari No. Pesanan..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Sync to Google Sheet */}
                {onSyncGoogleSheet && (
                  <button
                    type="button"
                    id="btn-sync-packing-sheet"
                    onClick={onSyncGoogleSheet}
                    disabled={isSyncing || orders.length === 0}
                    className="px-5 py-2.5 sm:px-6 sm:py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-sm sm:text-base font-extrabold flex items-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer shrink-0"
                    title="Simpan data scan ke sheet 'Packing Reg' (1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI)"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Menyimpan Data...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-5 h-5" />
                        <span>Simpan Data</span>
                      </>
                    )}
                  </button>
                )}

                {/* Clear Button */}
                {orders.length > 0 && (
                  <button
                    type="button"
                    id="btn-clear-packing"
                    onClick={() => setConfirmClearOpen(true)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-rose-200"
                    title="Kosongkan data paket packing"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100/75 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="p-3 text-center w-12">#</th>
                    <th className="p-3">No. Pesanan</th>
                    <th className="p-3">Platform</th>
                    <th className="p-3">Waktu Scan</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center w-16">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        <ScanBarcode className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-600 text-sm">
                          {searchQuery || selectedPlatformFilter !== 'Semua'
                            ? 'Tidak ada nomor pesanan yang cocok dengan filter.'
                            : 'Belum ada paket yang di-scan.'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Scan barcode resi atau gunakan tab "Tempel Massal" untuk input banyak data sekaligus.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order, idx) => {
                      const platColor = getPlatformColor(order.platform);
                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-slate-50/80 transition-colors group"
                        >
                          <td className="p-3 text-center text-xs font-semibold text-slate-400">
                            {filteredOrders.length - idx}
                          </td>
                          <td className="p-3 font-mono font-bold uppercase text-slate-900 text-sm sm:text-base">
                            <div className="flex items-center gap-2">
                              <span>{order.orderNumber}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(order.orderNumber);
                                  showToast(`No. Pesanan ${order.orderNumber} disalin!`, 'info');
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 rounded transition-opacity"
                                title="Salin No. Pesanan"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${platColor.bg} ${platColor.text} border ${platColor.border}`}
                            >
                              {platColor.label}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-600 font-medium">
                            {order.timestamp}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Packed
                              </span>
                              {processedNotas && processedNotas.length > 0 && (
                                (() => {
                                  const match = processedNotas.find(
                                    (n) => n.orderNumber.toUpperCase() === order.orderNumber.toUpperCase()
                                  );
                                  if (match) {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                        <FileText className="w-2.5 h-2.5 text-amber-600" />
                                        Nota Admin ✓
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                                      Belum di Nota
                                    </span>
                                  );
                                })()
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                onRemoveOrder(order.id);
                                showToast(`Pesanan ${order.orderNumber} dihapus.`, 'info');
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus baris ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {confirmClearOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100"
            >
              <div className="flex items-center gap-3 text-rose-600 mb-3">
                <div className="p-2.5 bg-rose-50 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Kosongkan Data Paket Packing?
                </h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                Tindakan ini akan menghapus <strong>{orders.length} daftar nomor pesanan</strong> yang sudah di-scan hari ini. Pastikan Anda sudah mengunduh CSV jika masih memerlukan arsip data ini.
              </p>
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearOrders();
                    setConfirmClearOpen(false);
                    showToast('Data paket packing berhasil dikosongkan.', 'info');
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs"
                >
                  Ya, Kosongkan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Camera Barcode Scanner Modal (Optimized for Mobile & Web) */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => {
          setIsCameraScannerOpen(false);
          if (autoFocus && inputRef.current) {
            inputRef.current.focus();
          }
        }}
        onScanResult={(code) => {
          handleProcessScan(code);
        }}
        showToast={showToast}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        recentScans={recentScans}
        totalScannedCount={orders.length}
      />
    </div>
  );
};
