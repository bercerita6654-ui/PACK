import React, { useState, useRef, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PackedOrder, PlatformType } from '../types';
import { detectPlatform, getPlatformColor } from '../utils/platformDetector';
import { soundFX } from '../utils/audio';
import { PackingSheetHistory } from './PackingSheetHistory';

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
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  accessToken?: string | null;
  userEmail?: string;
  onLoginGoogle?: () => void;
  targetSpreadsheetId?: string;
  targetSheetTab?: string;
  lastSyncTimestamp?: number;
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
  targetSpreadsheetId = '1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI',
  targetSheetTab = 'Packing Reg',
  lastSyncTimestamp,
}) => {
  // Navigation between Single Rapid Scan and Batch Paste
  const [scanMode, setScanMode] = useState<ScanMode>('single');

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

  // Batch Paste state
  const [batchText, setBatchText] = useState<string>('');
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);


  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const code = (rawCode !== undefined ? rawCode : scanInput).trim();
    if (!code) {
      showToast('Masukkan atau scan No. Pesanan terlebih dahulu.', 'warning');
      return;
    }

    // Check duplicate against existing orders
    const existing = orders.find(
      (o) => o.orderNumber.toUpperCase() === code.toUpperCase()
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
      showToast(`No. Pesanan ${code} (${platformName}) berhasil di-scan!`, 'success');
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
    const code = duplicateWarning.orderNumber;
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProcessScan();
    }
  };

  // Platform live preview based on what's typed
  const previewPlatform = scanInput.trim() ? detectPlatform(scanInput) : null;
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
      const cleaned = token.replace(/^[",'\s]+|[",'\s]+$/g, '').trim();
      if (!cleaned) continue;

      const upper = cleaned.toUpperCase();
      const isExistingDuplicate = existingMap.has(upper);
      const isInternalDuplicate = seenInThisBatch.has(upper);

      seenInThisBatch.add(upper);

      result.push({
        orderNumber: cleaned,
        platform: detectPlatform(cleaned),
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
        setBatchText((prev) => (prev ? prev + '\n' + content : content));
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
      .map((s) => s.trim())
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

  return (
    <div className="space-y-6">
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
                Paket Packing
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

            {/* Scanner Input Field */}
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
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scan barcode atau ketik no. pesanan..."
                  className="w-full pl-11 pr-28 py-3 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-base sm:text-lg font-mono font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 placeholder:text-sm focus:outline-none transition-colors"
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
              </div>

              <button
                type="button"
                id="btn-submit-scan"
                onClick={() => handleProcessScan()}
                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors shrink-0"
              >
                <span>Scan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Minimalist 1-line helper */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 px-0.5">
              <span>💡 Ada huruf → <strong>Shopee</strong> • Angka saja → <strong>Tokopedia / TikTok</strong></span>
              <button
                type="button"
                onClick={() => setScanMode('batch_paste')}
                className="text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                Banyak resi? Gunakan Tempel Massal →
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
                onChange={(e) => setBatchText(e.target.value)}
                placeholder="Tempel daftar no. pesanan di sini (dari Excel, Word, Notepad, dll)..."
                className="w-full p-3 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs sm:text-sm font-mono text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none transition-colors"
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

      {/* Summary Counters: Total, Shopee, Tokopedia/TikTok */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-100 space-y-4">
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari No. Pesanan..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

            {/* Copy Button */}
            <button
              type="button"
              id="btn-copy-packed-list"
              onClick={() => handleCopyList(selectedPlatformFilter === 'Semua' ? undefined : selectedPlatformFilter)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Salin nomor pesanan ke clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin No</span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              id="btn-export-packing-csv"
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-indigo-200"
              title="Unduh data packing dalam format CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>

            {/* Sync to Google Sheet */}
            {onSyncGoogleSheet && (
              <button
                type="button"
                id="btn-sync-packing-sheet"
                onClick={onSyncGoogleSheet}
                disabled={isSyncing || orders.length === 0}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                title="Simpan data scan ke sheet 'Packing Reg' (1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI)"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>Simpan ke Packing Reg</span>
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
                      <td className="p-3 font-mono font-bold text-slate-900 text-sm sm:text-base">
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Packed
                        </span>
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

      {/* Google Spreadsheet Saved History Section (Packing Reg) */}
      <PackingSheetHistory
        accessToken={accessToken || null}
        userEmail={userEmail}
        onLoginGoogle={onLoginGoogle}
        targetSpreadsheetId={targetSpreadsheetId}
        targetSheetTab={targetSheetTab}
        lastSyncTimestamp={lastSyncTimestamp}
        showToast={showToast}
      />

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
    </div>
  );
};
