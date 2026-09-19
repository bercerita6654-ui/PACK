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
  PackageCheck,
  CheckSquare,
  Square,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SheetProcessedNotaRow, PlatformType, ToastItem } from '../types';
import { getPlatformColor } from '../utils/platformDetector';
import { parseNotaDateTime, formatElapsedDuration, formatThresholdLabel, normalizeOrderNumber } from '../utils/notaDelay';
import { soundFX } from '../utils/audio';

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
  onMarkOrdersAsPacked?: (
    items: { orderNumber: string; platform: PlatformType; rowNumber?: number; adminDate?: string }[]
  ) => Promise<any> | void;
  onMarkOrdersAsUnpacked?: (
    items: { orderNumber: string; platform: PlatformType; rowNumber?: number; adminDate?: string }[]
  ) => Promise<any> | void;
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
  onMarkOrdersAsPacked,
  onMarkOrdersAsUnpacked,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | PlatformType>('ALL');
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [copiedSingleIndex, setCopiedSingleIndex] = useState<string | null>(null);
  const [overdueScope, setOverdueScope] = useState<'period' | 'all'>('all');

  // Track orders marked as packed during this modal session
  const [locallyPackedOrders, setLocallyPackedOrders] = useState<Set<string>>(new Set());
  // Track orders marked as unpacked (reverted / batal packing) during this modal session
  const [locallyUnpackedOrders, setLocallyUnpackedOrders] = useState<Set<string>>(new Set());
  // Track individual orders being processed (loading state)
  const [processingOrders, setProcessingOrders] = useState<Set<string>>(new Set());
  // Multi-select for batch marking
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);

  const nowMs = Date.now();

  // Pastikan saat modal dibuka pada menu Tertunda, langsung default di posisi 'all' (Akumulasi Semua Data)
  useEffect(() => {
    if (isOpen) {
      if (type === 'overdue') {
        setOverdueScope('all');
      }
      setSearchQuery('');
      setPlatformFilter('ALL');
      setSelectedOrders(new Set());
      setLocallyUnpackedOrders(new Set());
    }
  }, [isOpen, type]);

  const isOrderPacked = (row: SheetProcessedNotaRow) => {
    const upper = row.orderNumber.toUpperCase();
    const norm = normalizeOrderNumber(row.orderNumber);
    if (locallyUnpackedOrders.has(upper) || (norm && locallyUnpackedOrders.has(norm))) return false;
    if (locallyPackedOrders.has(upper) || (norm && locallyPackedOrders.has(norm))) return true;
    return row.isPacked;
  };

  // Determine base rows based on type
  const baseRows = useMemo(() => {
    if (type === 'pending') {
      return rows.filter((r) => !isOrderPacked(r));
    }
    if (type === 'packed') {
      return rows.filter((r) => isOrderPacked(r));
    }
    if (type === 'overdue') {
      const source = overdueScope === 'all' || timeframe === 'all' ? allSheetRows : rows;
      return source.filter((r) => {
        if (isOrderPacked(r)) return false;
        const d = parseNotaDateTime(r.adminDate, r.adminTime);
        if (!d) return false;
        const elapsed = Math.floor((nowMs - d.getTime()) / 60000);
        return elapsed >= delayThreshold;
      });
    }
    // type === 'all'
    return rows;
  }, [type, rows, allSheetRows, overdueScope, timeframe, nowMs, delayThreshold, locallyPackedOrders, locallyUnpackedOrders]);

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
      if (isOrderPacked(r)) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      return Math.floor((nowMs - d.getTime()) / 60000) >= delayThreshold;
    }).length;
  }, [rows, nowMs, delayThreshold, locallyPackedOrders, locallyUnpackedOrders]);

  const allOverdueCount = useMemo(() => {
    return allSheetRows.filter((r) => {
      if (isOrderPacked(r)) return false;
      const d = parseNotaDateTime(r.adminDate, r.adminTime);
      if (!d) return false;
      return Math.floor((nowMs - d.getTime()) / 60000) >= delayThreshold;
    }).length;
  }, [allSheetRows, nowMs, delayThreshold, locallyPackedOrders, locallyUnpackedOrders]);

  // Mark single order as packed
  const handleMarkSingleAsPacked = async (row: SheetProcessedNotaRow) => {
    const upper = row.orderNumber.toUpperCase();
    if (processingOrders.has(upper) || isBatchProcessing) return;

    setProcessingOrders((prev) => new Set(prev).add(upper));
    setLocallyPackedOrders((prev) => new Set(prev).add(upper));
    setLocallyUnpackedOrders((prev) => {
      const next = new Set(prev);
      next.delete(upper);
      return next;
    });

    // Deselect if selected
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      next.delete(upper);
      return next;
    });

    try {
      if (onMarkOrdersAsPacked) {
        await onMarkOrdersAsPacked([
          {
            orderNumber: row.orderNumber,
            platform: row.platform,
            rowNumber: row.rowNumber,
            adminDate: row.adminDate,
          },
        ]);
      }
      soundFX.playSuccess();
      showToast(`✓ No. Pesanan ${row.orderNumber} berhasil jadi Terpacking & langsung tersimpan ke Google Sheets!`, 'success');
    } catch (err: any) {
      showToast(`Gagal merubah status: ${err.message || 'Error'}`, 'error');
    } finally {
      setProcessingOrders((prev) => {
        const next = new Set(prev);
        next.delete(upper);
        return next;
      });
    }
  };

  // Mark single order as unpacked (Batal Packing / kembalikan status)
  const handleMarkSingleAsUnpacked = async (row: SheetProcessedNotaRow) => {
    const upper = row.orderNumber.toUpperCase();
    if (processingOrders.has(upper) || isBatchProcessing) return;

    setProcessingOrders((prev) => new Set(prev).add(upper));
    setLocallyUnpackedOrders((prev) => new Set(prev).add(upper));
    setLocallyPackedOrders((prev) => {
      const next = new Set(prev);
      next.delete(upper);
      return next;
    });

    // Deselect if selected
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      next.delete(upper);
      return next;
    });

    try {
      if (onMarkOrdersAsUnpacked) {
        await onMarkOrdersAsUnpacked([
          {
            orderNumber: row.orderNumber,
            platform: row.platform,
            rowNumber: row.rowNumber,
            adminDate: row.adminDate,
          },
        ]);
      }
      soundFX.playSuccess();
      showToast(`✓ No. Pesanan ${row.orderNumber} dikembalikan jadi Belum Packing`, 'info');
    } catch (err: any) {
      showToast(`Gagal merubah status: ${err.message || 'Error'}`, 'error');
    } finally {
      setProcessingOrders((prev) => {
        const next = new Set(prev);
        next.delete(upper);
        return next;
      });
    }
  };

  // Mark all selected orders as packed
  const handleMarkSelectedAsPacked = async () => {
    if (selectedOrders.size === 0 || isBatchProcessing) return;

    const itemsToPack = filteredRows
      .filter((r) => selectedOrders.has(r.orderNumber.toUpperCase()) && !isOrderPacked(r))
      .map((r) => ({
        orderNumber: r.orderNumber,
        platform: r.platform,
        rowNumber: r.rowNumber,
        adminDate: r.adminDate,
      }));

    if (itemsToPack.length === 0) return;

    setIsBatchProcessing(true);
    const upperList = itemsToPack.map((i) => i.orderNumber.toUpperCase());
    setLocallyPackedOrders((prev) => {
      const next = new Set(prev);
      upperList.forEach((o) => next.add(o));
      return next;
    });
    setLocallyUnpackedOrders((prev) => {
      const next = new Set(prev);
      upperList.forEach((o) => next.delete(o));
      return next;
    });

    try {
      if (onMarkOrdersAsPacked) {
        await onMarkOrdersAsPacked(itemsToPack);
      }
      soundFX.playBatchSuccess();
      showToast(`✓ ${itemsToPack.length} No. Pesanan berhasil jadi Terpacking & langsung tersimpan ke Google Sheets!`, 'success');
      setSelectedOrders(new Set());
    } catch (err: any) {
      showToast(`Gagal merubah status: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Mark all selected packed orders as unpacked (Batal Packing massal)
  const handleMarkSelectedAsUnpacked = async () => {
    if (selectedOrders.size === 0 || isBatchProcessing) return;

    const itemsToUnpack = filteredRows
      .filter((r) => selectedOrders.has(r.orderNumber.toUpperCase()) && isOrderPacked(r))
      .map((r) => ({
        orderNumber: r.orderNumber,
        platform: r.platform,
        rowNumber: r.rowNumber,
        adminDate: r.adminDate,
      }));

    if (itemsToUnpack.length === 0) return;

    setIsBatchProcessing(true);
    const upperList = itemsToUnpack.map((i) => i.orderNumber.toUpperCase());
    setLocallyUnpackedOrders((prev) => {
      const next = new Set(prev);
      upperList.forEach((o) => next.add(o));
      return next;
    });
    setLocallyPackedOrders((prev) => {
      const next = new Set(prev);
      upperList.forEach((o) => next.delete(o));
      return next;
    });

    try {
      if (onMarkOrdersAsUnpacked) {
        await onMarkOrdersAsUnpacked(itemsToUnpack);
      }
      soundFX.playSuccess();
      showToast(`✓ ${itemsToUnpack.length} No. Pesanan dikembalikan jadi Belum Packing`, 'info');
      setSelectedOrders(new Set());
    } catch (err: any) {
      showToast(`Gagal merubah status: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Undo all recently packed orders in this modal session
  const handleUndoAllRecentlyPacked = async () => {
    if (locallyPackedOrders.size === 0 || isBatchProcessing) return;

    const itemsToUnpack = allSheetRows
      .filter((r) => locallyPackedOrders.has(r.orderNumber.toUpperCase()))
      .map((r) => ({
        orderNumber: r.orderNumber,
        platform: r.platform,
        rowNumber: r.rowNumber,
        adminDate: r.adminDate,
      }));

    if (itemsToUnpack.length === 0) return;

    setIsBatchProcessing(true);
    const upperList = itemsToUnpack.map((i) => i.orderNumber.toUpperCase());
    setLocallyUnpackedOrders((prev) => {
      const next = new Set(prev);
      upperList.forEach((o) => next.add(o));
      return next;
    });
    setLocallyPackedOrders(new Set());

    try {
      if (onMarkOrdersAsUnpacked) {
        await onMarkOrdersAsUnpacked(itemsToUnpack);
      }
      soundFX.playSuccess();
      showToast(`✓ ${itemsToUnpack.length} No. Pesanan yang baru ditandai berhasil dibatalkan`, 'info');
      setSelectedOrders(new Set());
    } catch (err: any) {
      showToast(`Gagal membatalkan status: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Mark all visible unpacked orders as packed
  const handleMarkAllVisibleAsPacked = async () => {
    const itemsToPack = filteredRows
      .filter((r) => !isOrderPacked(r))
      .map((r) => ({
        orderNumber: r.orderNumber,
        platform: r.platform,
        rowNumber: r.rowNumber,
        adminDate: r.adminDate,
      }));

    if (itemsToPack.length === 0 || isBatchProcessing) return;

    setIsBatchProcessing(true);
    const upperList = itemsToPack.map((i) => i.orderNumber.toUpperCase());
    setLocallyPackedOrders((prev) => {
      const next = new Set(prev);
      upperList.forEach((o) => next.add(o));
      return next;
    });
    setLocallyUnpackedOrders((prev) => {
      const next = new Set(prev);
      upperList.forEach((o) => next.delete(o));
      return next;
    });

    try {
      if (onMarkOrdersAsPacked) {
        await onMarkOrdersAsPacked(itemsToPack);
      }
      soundFX.playBatchSuccess();
      showToast(`✓ Semua ${itemsToPack.length} No. Pesanan berhasil jadi Terpacking & langsung tersimpan ke Google Sheets!`, 'success');
      setSelectedOrders(new Set());
    } catch (err: any) {
      showToast(`Gagal merubah status: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Selection helpers
  const visibleUnpackedOrders = useMemo(() => {
    return filteredRows
      .filter((r) => !isOrderPacked(r))
      .map((r) => r.orderNumber.toUpperCase());
  }, [filteredRows, locallyPackedOrders, locallyUnpackedOrders]);

  const unpackedInFilteredCount = visibleUnpackedOrders.length;

  const selectedUnpackedCount = useMemo(() => {
    return filteredRows.filter((r) => selectedOrders.has(r.orderNumber.toUpperCase()) && !isOrderPacked(r)).length;
  }, [filteredRows, selectedOrders, locallyPackedOrders, locallyUnpackedOrders]);

  const selectedPackedCount = useMemo(() => {
    return filteredRows.filter((r) => selectedOrders.has(r.orderNumber.toUpperCase()) && isOrderPacked(r)).length;
  }, [filteredRows, selectedOrders, locallyPackedOrders, locallyUnpackedOrders]);

  const allVisibleOrderNumbers = useMemo(() => {
    return filteredRows.map((r) => r.orderNumber.toUpperCase());
  }, [filteredRows]);

  const isAllVisibleSelected =
    allVisibleOrderNumbers.length > 0 &&
    allVisibleOrderNumbers.every((o) => selectedOrders.has(o));

  const toggleSelectAll = () => {
    if (isAllVisibleSelected) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(allVisibleOrderNumbers));
    }
  };

  const toggleSelectOrder = (orderNumber: string) => {
    const upper = orderNumber.toUpperCase();
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(upper)) {
        next.delete(upper);
      } else {
        next.add(upper);
      }
      return next;
    });
  };

  const recentlyPackedCount = useMemo(() => {
    return filteredRows.filter((r) => locallyPackedOrders.has(r.orderNumber.toUpperCase())).length;
  }, [filteredRows, locallyPackedOrders]);

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

          {/* Controls Bar: Search, Platform filter, Batch Pack & Copy All button */}
          <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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

              {/* Action Buttons Group */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Batch Pack All Visible Unpacked Button */}
                {unpackedInFilteredCount > 0 && (
                  <button
                    type="button"
                    id="btn-mark-all-visible-packed"
                    onClick={handleMarkAllVisibleAsPacked}
                    disabled={isBatchProcessing}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white disabled:opacity-50"
                    title="Ubah semua pesanan yang belum packing pada daftar ini jadi Terpacking sekaligus"
                  >
                    {isBatchProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PackageCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Jadikan Semua Terpacking ({unpackedInFilteredCount})</span>
                  </button>
                )}

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
            </div>

            {/* Multi-Selection Action Bar */}
            {selectedOrders.size > 0 && (
              <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs animate-fadeIn">
                <div className="flex items-center gap-2 text-emerald-950 font-bold">
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{selectedOrders.size} No. Pesanan dipilih</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedOrders(new Set())}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-all cursor-pointer"
                  >
                    Batal Pilih
                  </button>

                  {selectedUnpackedCount > 0 && (
                    <button
                      type="button"
                      id="btn-mark-selected-packed"
                      onClick={handleMarkSelectedAsPacked}
                      disabled={isBatchProcessing}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isBatchProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Tandai Terpilih Jadi Terpacking ({selectedUnpackedCount})</span>
                    </button>
                  )}

                  {selectedPackedCount > 0 && (
                    <button
                      type="button"
                      id="btn-mark-selected-unpacked"
                      onClick={handleMarkSelectedAsUnpacked}
                      disabled={isBatchProcessing}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Kembalikan pesanan terpacking yang dipilih menjadi Belum Packing (jika salah pencet)"
                    >
                      {isBatchProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>Kembalikan Jadi Belum Packing ({selectedPackedCount})</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Recently Packed Notification Bar */}
            {recentlyPackedCount > 0 && (
              <div className="px-3.5 py-2 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-900">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    <strong>{recentlyPackedCount} No. Pesanan</strong> diubah jadi Terpacking pada sesi ini tanpa perlu scan barcode.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleUndoAllRecentlyPacked}
                  disabled={isBatchProcessing}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-900 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 border border-amber-300 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Batalkan perubahan dan kembalikan semua pesanan yang baru saja diubah jadi terpacking"
                >
                  <RotateCcw className="w-3 h-3 text-amber-700" />
                  <span>Batalkan Semua ({recentlyPackedCount})</span>
                </button>
              </div>
            )}
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
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isAllVisibleSelected}
                          onChange={toggleSelectAll}
                          disabled={filteredRows.length === 0}
                          title={isAllVisibleSelected ? "Batal pilih semua" : "Pilih semua pesanan pada daftar ini"}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer disabled:opacity-40"
                        />
                      </th>
                      <th className="py-2.5 px-2.5 w-12 text-center">No</th>
                      <th className="py-2.5 px-3.5">No Pesanan</th>
                      <th className="py-2.5 px-3.5 w-28">Platform</th>
                      <th className="py-2.5 px-3.5 w-36">Tanggal / Waktu Admin</th>
                      <th className="py-2.5 px-3.5 w-36">Status Packing</th>
                      <th className="py-2.5 px-3.5 w-60 text-center">Ubah Status / Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 bg-white">
                    {filteredRows.map((row, idx) => {
                      const upper = row.orderNumber.toUpperCase();
                      const platformColor = getPlatformColor(row.platform);
                      const isCopiedThis = copiedSingleIndex === row.orderNumber;
                      const isPacked = isOrderPacked(row);
                      const isLocallyPacked = locallyPackedOrders.has(upper);
                      const isLocallyUnpacked = locallyUnpackedOrders.has(upper);
                      const isProcessing = processingOrders.has(upper);
                      const isSelected = selectedOrders.has(upper);

                      // Calculate overdue
                      let isOverdue = false;
                      let elapsedMinutes = 0;
                      if (!isPacked) {
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
                            isLocallyPacked
                              ? 'bg-emerald-50/40'
                              : isLocallyUnpacked
                              ? 'bg-amber-50/40'
                              : isOverdue
                              ? 'bg-rose-50/30'
                              : ''
                          }`}
                        >
                          {/* Multi-Select Checkbox */}
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOrder(row.orderNumber)}
                              title={isPacked ? "Pilih pesanan terpacking ini (bisa untuk batalkan packing massal)" : "Pilih pesanan ini"}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                            />
                          </td>

                          {/* Index */}
                          <td className="py-2.5 px-2.5 text-center text-slate-400 font-mono font-semibold">
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
                            {isPacked ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  Sudah Packing
                                </span>
                                {isLocallyPacked ? (
                                  <span className="text-[10px] text-emerald-600 font-semibold pl-0.5">
                                    Baru saja diubah
                                  </span>
                                ) : row.packingTime && row.packingTime !== '-' ? (
                                  <span className="text-[10px] text-slate-400 pl-0.5">
                                    Pukul: {row.packingTime}
                                  </span>
                                ) : null}
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
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                  <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                  Belum Packing
                                </span>
                                {isLocallyUnpacked && (
                                  <span className="text-[10px] text-amber-600 font-semibold pl-0.5">
                                    Batal (Belum Packing)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Ubah Status & Copy Action */}
                          <td className="py-2.5 px-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {isPacked ? (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    id={`badge-packed-${idx}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  >
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Terpacking</span>
                                  </span>
                                  <button
                                    type="button"
                                    id={`btn-mark-unpacked-${idx}`}
                                    onClick={() => handleMarkSingleAsUnpacked(row)}
                                    disabled={isProcessing || isBatchProcessing}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                    title="Ubah kembali status jadi Belum Packing (Batal Packing jika salah pencet)"
                                  >
                                    {isProcessing ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-amber-700" />
                                    ) : (
                                      <RotateCcw className="w-3 h-3 text-amber-700" />
                                    )}
                                    <span>Batal</span>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  id={`btn-mark-packed-${idx}`}
                                  onClick={() => handleMarkSingleAsPacked(row)}
                                  disabled={isProcessing || isBatchProcessing}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                                  title="1 Klik: Ubah jadi Terpacking & langsung simpan otomatis ke Google Sheets (Packing Reg & Nota Diproses)"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>Jadikan Terpacking</span>
                                </button>
                              )}

                              {/* Single Copy Action */}
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
                            </div>
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
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>
                Total: <strong className="text-slate-800">{filteredRows.length} No. Pesanan</strong>
              </span>
              {filteredRows.length > 0 && (
                <span className="text-slate-400">
                  (Shopee: {filteredRows.filter(r => r.platform === 'Shopee').length}, Tokopedia: {filteredRows.filter(r => r.platform === 'Tokopedia/TikTok').length})
                </span>
              )}
              {recentlyPackedCount > 0 && (
                <span className="text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md border border-emerald-200">
                  • {recentlyPackedCount} Baru Saja Ditandai Terpacking
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
