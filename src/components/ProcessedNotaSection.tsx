import React, { useState, useRef, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProcessedNota, PlatformType } from '../types';
import { detectPlatform, getPlatformColor } from '../utils/platformDetector';
import { soundFX } from '../utils/audio';

interface ProcessedNotaSectionProps {
  notas: ProcessedNota[];
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
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  accessToken?: string | null;
  userEmail?: string;
  onLoginGoogle?: () => void;
  targetSpreadsheetId?: string;
  targetSheetTab?: string;
  onNavigateToPacking?: () => void;
}

type ScanMode = 'single' | 'batch_paste';
type StatusFilter = 'all' | 'pending' | 'packed';

export const ProcessedNotaSection: React.FC<ProcessedNotaSectionProps> = ({
  notas,
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
  targetSpreadsheetId = '1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI',
  targetSheetTab = 'Nota Diproses',
  onNavigateToPacking,
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

  // Calculations for stats
  const totalNotas = notas.length;
  const packedCount = useMemo(() => notas.filter((n) => n.isPacked).length, [notas]);
  const pendingCount = totalNotas - packedCount;
  const progressPercent = totalNotas > 0 ? Math.round((packedCount / totalNotas) * 100) : 0;

  // Filtered notas list
  const filteredNotas = useMemo(() => {
    return notas.filter((nota) => {
      // Status filter
      if (statusFilter === 'pending' && nota.isPacked) return false;
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
  }, [notas, statusFilter, platformFilter, searchQuery]);

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
                  Scan Nota Diproses (Admin)
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
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition-all"
            >
              <span>Buka Menu Packing</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

        {/* Belum Packing (Pending) - High Contrast Alert */}
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

        {/* Sudah Packing (Selesai) */}
        <div className="bg-emerald-50/70 border border-emerald-200 p-4 sm:p-5 rounded-2xl shadow-xs">
          <div className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-1">
            Sudah Dipacking
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-emerald-800 leading-none">
              {packedCount}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900">
              {progressPercent}% Selesai
            </span>
          </div>
        </div>

        {/* Progress Bar & Status */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Kemajuan Packing
            </span>
            <span className="text-xs font-extrabold text-indigo-700">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
            <span>{packedCount} Selesai</span>
            <span>{pendingCount} Pending</span>
          </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* 1-Click WhatsApp Pending Copy */}
            <button
              type="button"
              onClick={handleCopyPendingNotas}
              disabled={pendingCount === 0}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                pendingCount > 0
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 shadow-2xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="Salin daftar nomor nota yang belum dipacking untuk WhatsApp tim packing"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Salin Nota Belum Packing ({pendingCount})</span>
            </button>

            {/* Sync to Google Sheet */}
            {onSyncGoogleSheet && (
              <button
                type="button"
                id="btn-sync-nota-sheet"
                onClick={onSyncGoogleSheet}
                disabled={isSyncing || totalNotas === 0}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  totalNotas > 0 && !isSyncing
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title="Simpan daftar nota ke Google Sheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isSyncing ? 'Menyimpan...' : 'Simpan ke Google Sheet'}</span>
              </button>
            )}

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={totalNotas === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>
          </div>

          {/* Reset / Clear List */}
          {totalNotas > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
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
                filteredNotas.map((nota, index) => (
                  <tr
                    key={nota.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      nota.isPacked ? 'bg-emerald-50/20' : 'bg-amber-50/10'
                    }`}
                  >
                    <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* Order Number with Copy */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 tracking-wide">
                      <div className="flex items-center gap-2">
                        <span>{nota.orderNumber}</span>
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
                      <div className="text-[10px] text-slate-400">{nota.date}</div>
                    </td>

                    {/* Packing Status Badge */}
                    <td className="py-3 px-4 text-center">
                      {nota.isPacked ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sudah Packing</span>
                          {nota.packedAt && (
                            <span className="text-[10px] font-normal text-emerald-700">
                              ({nota.packedAt})
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse">
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
                ))
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
