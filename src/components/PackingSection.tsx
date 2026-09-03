import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PackedOrder, PlatformType } from '../types';
import { detectPlatform, getPlatformColor } from '../utils/platformDetector';
import { soundFX } from '../utils/audio';

interface PackingSectionProps {
  orders: PackedOrder[];
  onAddOrder: (orderNumber: string, platform: PlatformType) => boolean;
  onRemoveOrder: (id: string) => void;
  onClearOrders: () => void;
  onSyncGoogleSheet?: () => void;
  isSyncing?: boolean;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const PackingSection: React.FC<PackingSectionProps> = ({
  orders,
  onAddOrder,
  onRemoveOrder,
  onClearOrders,
  onSyncGoogleSheet,
  isSyncing = false,
  showToast,
}) => {
  const [scanInput, setScanInput] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoFocus, setAutoFocus] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'Semua' | PlatformType>('Semua');
  const [duplicateWarning, setDuplicateWarning] = useState<PackedOrder | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Sync sound settings
  useEffect(() => {
    soundFX.enabled = soundEnabled;
  }, [soundEnabled]);

  // Keep focus on input for continuous physical barcode scanner operation
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus, orders]);

  // Handle Scan Submit
  const handleProcessScan = (rawCode?: string) => {
    const code = (rawCode !== undefined ? rawCode : scanInput).trim();
    if (!code) {
      showToast('Masukkan atau scan No. Pesanan terlebih dahulu.', 'warning');
      return;
    }

    // Check duplicate
    const existing = orders.find(
      (o) => o.orderNumber.toUpperCase() === code.toUpperCase()
    );

    if (existing) {
      soundFX.playDuplicate();
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

  // Filtered orders
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
      {/* Scanner Control Deck */}
      <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <ScanBarcode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                Scanner Paket Packing
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Siap Scan
                </span>
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Scan barcode nomor pesanan pada resi paket menggunakan barcode scanner fisik atau input manual.
              </p>
            </div>
          </div>

          {/* Scanner Controls: Sound & AutoFocus */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              id="btn-toggle-sound"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                soundEnabled
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
              title="Aktifkan / Matikan suara bip scanner"
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Suara Bip: Aktif</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Suara Bip: Bisu</span>
                </>
              )}
            </button>

            <button
              type="button"
              id="btn-toggle-autofocus"
              onClick={() => setAutoFocus(!autoFocus)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                autoFocus
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
              title="Kunci kursor otomatis di kolom scan untuk pemindaian beruntun tanpa klik mouse"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Auto-Fokus: {autoFocus ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        {/* Big Scanner Input Form */}
        <div className="pt-6 space-y-3">
          <label htmlFor="scanner-input" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
            Kolom Pemindaian Barcode (Arahkan Scanner ke Sini)
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
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
                placeholder="Contoh: 2609032TQ99KX5 (Shopee) atau 585861788212430295 (Tokopedia/TikTok)..."
                className="w-full pl-11 pr-32 py-3 sm:py-3.5 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-base sm:text-lg font-mono font-bold text-slate-900 placeholder:font-sans placeholder:text-slate-400 placeholder:text-xs sm:placeholder:text-sm focus:outline-none shadow-inner transition-colors"
                autoComplete="off"
                spellCheck="false"
              />

              {/* In-field live platform pill preview */}
              {previewPlatform && previewColor && (
                <div className="absolute inset-y-0 right-2 flex items-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${previewColor.bg} ${previewColor.text} border ${previewColor.border} shadow-2xs animate-in fade-in zoom-in-95 duration-150`}
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
              className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-6 py-3 sm:py-3.5 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm transition-colors shrink-0"
            >
              <span>Scan / Simpan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Helper Legend / Platform Detection Rules */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
            <span className="font-semibold text-slate-600">Aturan Otomatis:</span>
            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md border border-orange-200">
              <span className="font-bold">Kombinasi Huruf</span> (contoh: 2609032TQ99KX5) → <strong>Shopee</strong>
            </span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200">
              <span className="font-bold">Kode Angka Saja</span> (contoh: 585861788212430295) → <strong>Tokopedia / TikTok</strong>
            </span>
          </div>
        </div>

        {/* Duplicate Alert Banner (if duplicate scanned) */}
        <AnimatePresence>
          {duplicateWarning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 space-y-2"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-sm text-rose-800">
                    PERINGATAN DUPLIKAT: Paket Ini Sudah Pernah Di-Packing!
                  </h4>
                  <p className="text-xs text-rose-700 mt-0.5">
                    No. Pesanan <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-200">{duplicateWarning.orderNumber}</strong> ({duplicateWarning.platform}) sudah tercatat pada pukul <strong>{duplicateWarning.timestamp}</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-200/60">
                <button
                  type="button"
                  onClick={() => {
                    setDuplicateWarning(null);
                    setScanInput('');
                    if (autoFocus && inputRef.current) inputRef.current.focus();
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg"
                >
                  Tutup / Abaikan
                </button>
                <button
                  type="button"
                  onClick={handleForceAddDuplicate}
                  className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs"
                >
                  Tetap Tambahkan Lagi
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Summary Counters: Total, Shopee, Tokopedia/TikTok */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total Sudah Di-Packing
            </span>
            <div className="text-3xl font-black text-slate-900 mt-1">
              {totalOrders} <span className="text-sm font-semibold text-slate-500">Paket</span>
            </div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Shopee Card */}
        <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
                Pesanan Shopee
              </span>
            </div>
            <div className="text-3xl font-black text-orange-600 mt-1">
              {shopeeCount} <span className="text-sm font-semibold text-slate-500">Paket</span>
            </div>
            <span className="text-[11px] text-slate-400">Kode alfanumerik (ada huruf)</span>
          </div>
          <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
            <span className="font-black text-lg">S</span>
          </div>
        </div>

        {/* Tokopedia / TikTok Card */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Tokopedia / TikTok
              </span>
            </div>
            <div className="text-3xl font-black text-emerald-700 mt-1">
              {tokpedTiktokCount} <span className="text-sm font-semibold text-slate-500">Paket</span>
            </div>
            <span className="text-[11px] text-slate-400">Kode angka murni</span>
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
                      Arahkan scanner ke barcode resi atau ketik no pesanan di kolom scan di atas.
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
