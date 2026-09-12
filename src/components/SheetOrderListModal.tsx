import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ExternalLink,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SheetProcessedNotaRow, PlatformType, ToastItem } from '../types';
import { getPlatformColor } from '../utils/platformDetector';
import { parseNotaDateTime, formatElapsedDuration, formatThresholdLabel } from '../utils/notaDelay';

export interface SheetOrderListModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'pending' | 'packed' | 'overdue' | 'all';
  timeframe: 'today' | 'yesterday' | 'week' | 'month' | 'all';
  timeframeLabel: string;
  rows: SheetProcessedNotaRow[];
  allSheetRows: SheetProcessedNotaRow[];
  delayThreshold: number;
  onNavigateToSheetHistory?: (filter: 'all' | 'pending' | 'overdue' | 'packed') => void;
  showToast: (msg: string, type?: ToastItem['type']) => void;
}

export const SheetOrderListModal: React.FC<SheetOrderListModalProps> = ({
  isOpen,
  onClose,
  type,
  timeframe,
  timeframeLabel,
  rows,
  allSheetRows,
  delayThreshold,
  onNavigateToSheetHistory,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | PlatformType>('ALL');
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [copiedSingleIndex, setCopiedSingleIndex] = useState<string | null>(null);
  const [overdueScope, setOverdueScope] = useState<'period' | 'all'>('all');

  const nowMs = Date.now();

  // Pastikan saat modal dibuka pada menu Tertunda, langsung default di posisi 'all' (Akumulasi Semua Data)
  useEffect(() => {
    if (isOpen) {
      if (type === 'overdue') {
        setOverdueScope('all');
      }
      setSearchQuery('');
      setPlatformFilter('ALL');
    }
  }, [isOpen, type]);

  // Determine base rows based on type
  const baseRows = useMemo(() => {
    if (type === 'pending') {
      return rows.filter((r) => !r.isPacked);
    }
    if (type === 'packed') {
      return rows.filter((r) => r.isPacked);
    }
    if (type === 'overdue') {
      const source = overdueScope === 'all' || timeframe === 'all' ? allSheetRows : rows;
      return source.filter((r) => {
        if (r.isPacked) return false;
        const d = parseNotaDateTime(r.adminDate, r.adminTime);
        if (!d) return false;
        const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
        return elapsed >= delayThreshold;
      });
    }
    // type === 'all'
    return rows;
  }, [type, rows, allSheetRows, overdueScope, timeframe, nowMs, delayThreshold]);

  // Filter by search query and platform
  const filteredRows = useMemo(() => {
    let result = baseRows;

    if (platformFilter !== 'ALL') {
      result = result.filter((r) => r.platform === platformFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((r) => {
        return (
          r.orderNumber.toLowerCase().includes(q) ||
          r.adminDate.toLowerCase().includes(q) ||
          r.adminTime.toLowerCase().includes(q) ||
          (r.packingTime && r.packingTime.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [baseRows, platformFilter, searchQuery]);

  // Hitungan cepat overdue untuk tombol toggle
  const periodOverdueCount = useMemo(() => {
    return rows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      return Math.floor((nowMs - d.getTime()) / 60000) >= delayThreshold;
    }).length;
  }, [rows, nowMs, delayThreshold]);

  const allOverdueCount = useMemo(() => {
    return allSheetRows.filter((r) => {
      if (r.isPacked) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      return Math.floor((nowMs - d.getTime()) / 60000) >= delayThreshold;
    }).length;
  }, [allSheetRows, nowMs, delayThreshold]);

  // Copy all visible order numbers to clipboard
  const handleCopyAllOrders = async () => {
    if (filteredRows.length === 0) return;
    const text = filteredRows.map((r) => r.orderNumber).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      showToast(`${filteredRows.length} No. Pesanan berhasil disalin!`, 'success');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      showToast('Gagal menyalin ke clipboard', 'error');
    }
  };

  // Copy single order number
  const handleCopySingle = async (orderNumber: string) => {
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopiedSingleIndex(orderNumber);
      showToast(`No. Pesanan ${orderNumber} disalin!`, 'info');
      setTimeout(() => setCopiedSingleIndex(null), 1500);
    } catch {
      showToast('Gagal menyalin No. Pesanan', 'error');
    }
  };

  if (!isOpen) return null;

  // Header configuration by type
  const config = {
    pending: {
      title: 'Daftar No Pesanan - Belum Packing',
      badgeText: 'Menunggu Packing',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      headerBorder: 'border-amber-200/80',
      tagColor: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    packed: {
      title: 'Daftar No Pesanan - Sudah Packing',
      badgeText: 'Sudah Selesai',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
      headerBorder: 'border-emerald-200/80',
      tagColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    overdue: {
      title: `Daftar No Pesanan - Tertunda > ${formatThresholdLabel(delayThreshold)}`,
      badgeText: 'Perlu Cek',
      badgeClass: 'bg-rose-100 text-rose-900 border-rose-300 animate-pulse',
      icon: <AlertTriangle className="w-5 h-5 text-rose-500" />,
      headerBorder: 'border-rose-200/80',
      tagColor: 'text-rose-700 bg-rose-50 border-rose-200',
    },
    all: {
      title: `Daftar No Pesanan - ${timeframeLabel}`,
      badgeText: 'Semua Status',
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      icon: <Layers className="w-5 h-5 text-indigo-500" />,
      headerBorder: 'border-indigo-200/80',
      tagColor: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    },
  }[type];

  const shopeeCount = baseRows.filter((r) => r.platform === 'Shopee').length;
  const tokpedCount = baseRows.filter((r) => r.platform === 'Tokopedia/TikTok').length;

  return (
    <AnimatePresence>
      <div
        id="modal-sheet-order-list"
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-5"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col w-full max-w-4xl max-h-[88vh] overflow-hidden"
        >
          {/* Header */}
          <div className={`p-4 sm:p-5 border-b ${config.headerBorder} bg-slate-50/60 flex items-start justify-between gap-3`}>
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-white shadow-2xs border border-slate-200 shrink-0">
                {config.icon}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    {config.title}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${config.badgeClass}`}>
                    {config.badgeText}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200/80 text-slate-700">
                    Periode: {type === 'overdue' ? (overdueScope === 'all' ? 'Akumulasi Semua Data' : timeframeLabel) : timeframeLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Menampilkan <strong className="text-slate-900 font-bold">{filteredRows.length}</strong> dari total {baseRows.length} nota yang sesuai.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="btn-close-order-list-modal"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-all cursor-pointer shrink-0"
              title="Tutup (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Overdue Scope Toggle (Only for Overdue and when timeframe is not all) */}
          {type === 'overdue' && timeframe !== 'all' && (
            <div className="px-4 sm:px-5 py-2.5 bg-rose-50/60 border-b border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <span className="text-rose-800 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                Pilih Cakupan Data Tertunda:
              </span>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-rose-200 shadow-2xs">
                <button
                  type="button"
                  id="btn-overdue-scope-all"
                  onClick={() => setOverdueScope('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                    overdueScope === 'all'
                      ? 'bg-rose-600 text-white shadow-2xs font-black'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  Akumulasi Semua Data ({allOverdueCount})
                </button>
                <button
                  type="button"
                  id="btn-overdue-scope-period"
                  onClick={() => setOverdueScope('period')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                    overdueScope === 'period'
                      ? 'bg-rose-600 text-white shadow-2xs font-black'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  Sesuai Periode ({timeframeLabel}: {periodOverdueCount})
                </button>
              </div>
            </div>
          )}

          {/* Controls Bar: Search, Platform filter & Copy All button */}
          <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                id="input-search-modal-orders"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari No. Pesanan, tanggal, jam..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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

            {/* Platform Filter Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setPlatformFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  platformFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({baseRows.length})
              </button>
              <button
                type="button"
                onClick={() => setPlatformFilter('Shopee')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  platformFilter === 'Shopee'
                    ? 'bg-orange-500 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-orange-600'
                }`}
              >
                Shopee ({shopeeCount})
              </button>
              <button
                type="button"
                onClick={() => setPlatformFilter('Tokopedia/TikTok')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  platformFilter === 'Tokopedia/TikTok'
                    ? 'bg-emerald-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                Tokopedia ({tokpedCount})
              </button>
            </div>

            {/* Copy All Orders Button */}
            <button
              type="button"
              id="btn-copy-all-orders-modal"
              onClick={handleCopyAllOrders}
              disabled={filteredRows.length === 0}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer disabled:opacity-40 ${
                copiedAll
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white'
              }`}
              title="Salin seluruh No. Pesanan yang ditampilkan ke clipboard (per baris)"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAll ? 'Tersalin!' : 'Salin Semua No Pesanan'}</span>
            </button>
          </div>

          {/* List Table Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {filteredRows.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Search className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  {searchQuery ? 'Tidak ada No. Pesanan yang cocok' : 'Tidak ada data pesanan pada kategori ini'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {searchQuery
                    ? 'Coba gunakan kata kunci nomor pesanan lain atau ubah filter platform.'
                    : 'Seluruh pesanan sesuai filter telah ditangani atau belum ada baris baru di sheet.'}
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3.5 w-12 text-center">No</th>
                      <th className="py-2.5 px-3.5">No Pesanan</th>
                      <th className="py-2.5 px-3.5 w-32">Platform</th>
                      <th className="py-2.5 px-3.5 w-36">Tanggal / Waktu Admin</th>
                      <th className="py-2.5 px-3.5 w-40">Status Packing</th>
                      <th className="py-2.5 px-3.5 w-16 text-center">Salin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 bg-white">
                    {filteredRows.map((row, idx) => {
                      const platformColor = getPlatformColor(row.platform);
                      const isCopiedThis = copiedSingleIndex === row.orderNumber;

                      // Calculate overdue
                      let isOverdue = false;
                      let elapsedMinutes = 0;
                      if (!row.isPacked) {
                        const d = parseNotaDateTime(row.adminDate, row.adminTime);
                        if (d) {
                          elapsedMinutes = Math.floor((nowMs - d.getTime()) / 60000);
                          isOverdue = elapsedMinutes >= delayThreshold;
                        }
                      }

                      return (
                        <tr
                          key={`${row.orderNumber}-${idx}`}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isOverdue ? 'bg-rose-50/30' : ''
                          }`}
                        >
                          {/* Index */}
                          <td className="py-2.5 px-3.5 text-center text-slate-400 font-mono font-semibold">
                            {idx + 1}
                          </td>

                          {/* Order Number */}
                          <td className="py-2.5 px-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-slate-900 tracking-wider text-xs select-all">
                                {row.orderNumber}
                              </span>
                              {row.sourceSheetTab && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded font-medium">
                                  {row.sourceSheetTab}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Platform */}
                          <td className="py-2.5 px-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${platformColor.bg} ${platformColor.text} ${platformColor.border}`}
                            >
                              {row.platform}
                            </span>
                          </td>

                          {/* Admin Date & Time */}
                          <td className="py-2.5 px-3.5 text-slate-600">
                            <div className="font-medium text-[11px] text-slate-800">
                              {row.adminDate || '-'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Pukul: {row.adminTime || '-'}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3.5">
                            {row.isPacked ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  Sudah Packing
                                </span>
                                {row.packingTime && row.packingTime !== '-' && (
                                  <span className="text-[10px] text-slate-400 pl-0.5">
                                    Pukul: {row.packingTime}
                                  </span>
                                )}
                              </div>
                            ) : isOverdue ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                  Tertunda &gt;{formatThresholdLabel(delayThreshold)}
                                </span>
                                <span className="text-[10px] font-semibold text-rose-600 pl-0.5">
                                  +{formatElapsedDuration(elapsedMinutes)}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                Belum Packing
                              </span>
                            )}
                          </td>

                          {/* Single Copy Action */}
                          <td className="py-2.5 px-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleCopySingle(row.orderNumber)}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                isCopiedThis
                                  ? 'bg-emerald-500 text-white border-emerald-600'
                                  : 'bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-900 border-slate-200'
                              }`}
                              title="Salin No Pesanan ini"
                            >
                              {isCopiedThis ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>
                Total: <strong className="text-slate-800">{filteredRows.length} No. Pesanan</strong>
              </span>
              {filteredRows.length > 0 && (
                <span className="text-slate-400">
                  (Shopee: {filteredRows.filter(r => r.platform === 'Shopee').length}, Tokopedia: {filteredRows.filter(r => r.platform === 'Tokopedia/TikTok').length})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {onNavigateToSheetHistory && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToSheetHistory(type);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                  title="Buka tampilan tabel riwayat Google Sheet lengkap"
                >
                  <span>Buka di Tabel Riwayat Sheet</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
