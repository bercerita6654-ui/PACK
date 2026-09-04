import React, { useState, useMemo } from 'react';
import {
  Clock,
  RotateCcw,
  CloudUpload,
  Server,
  X,
  Plus,
  Minus,
  Inbox,
  Filter,
  Loader2,
  Truck,
  Store,
  Calendar,
  CalendarDays,
  Search,
  Copy,
  Download,
  CheckCircle2,
} from 'lucide-react';
import { EXPEDITION_KEYS, EXPEDITIONS } from '../data/constants';
import { ExpeditionCode, PackageLog, DeliveryMethod } from '../types';

interface LogTableProps {
  logs: PackageLog[];
  todayLogsCount?: number;
  currentDate?: string;
  isSyncing: boolean;
  onRemoveLog: (id: string) => void;
  onPromptReset: () => void;
  onSyncGoogleSheet: () => void;
  onOpenHistory: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

type DateFilterPreset = 'today' | 'yesterday' | '7days' | 'all' | 'custom';

export const LogTable: React.FC<LogTableProps> = ({
  logs,
  todayLogsCount,
  currentDate,
  isSyncing,
  onRemoveLog,
  onPromptReset,
  onSyncGoogleSheet,
  onOpenHistory,
  showToast,
}) => {
  // Date filter state
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [customDate, setCustomDate] = useState<string>('');

  // Expedition & Method & Search filter state
  const [filterExpedition, setFilterExpedition] = useState<string>('ALL');
  const [filterMethod, setFilterMethod] = useState<'ALL' | DeliveryMethod>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Helpers for ISO dates
  const todayIso = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const yesterdayIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const sevenDaysAgoIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Format ISO date to Indonesian readable string
  const formatIsoToIndonesian = (isoStr?: string): string => {
    if (!isoStr) return '-';
    try {
      const parts = isoStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    } catch {
      // fallback
    }
    return isoStr;
  };

  // Distinct dates in the logs for reference and counts
  const distinctDates = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l) => {
      const d = l.date || todayIso;
      map.set(d, (map.get(d) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateIso, count]) => ({
        dateIso,
        count,
        formatted: formatIsoToIndonesian(dateIso),
      }));
  }, [logs, todayIso]);

  // Counts for preset buttons
  const todayCount = useMemo(
    () => logs.filter((l) => (l.date || todayIso) === todayIso).length,
    [logs, todayIso]
  );
  const yesterdayCount = useMemo(
    () => logs.filter((l) => (l.date || todayIso) === yesterdayIso).length,
    [logs, todayIso, yesterdayIso]
  );
  const sevenDaysCount = useMemo(
    () => logs.filter((l) => (l.date || todayIso) >= sevenDaysAgoIso).length,
    [logs, todayIso, sevenDaysAgoIso]
  );

  // Apply all filters: Date, Expedition, Delivery Method, and Search
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const logDate = log.date || todayIso;

      // 1. Date Filter
      if (datePreset === 'today') {
        if (logDate !== todayIso) return false;
      } else if (datePreset === 'yesterday') {
        if (logDate !== yesterdayIso) return false;
      } else if (datePreset === '7days') {
        if (logDate < sevenDaysAgoIso) return false;
      } else if (datePreset === 'custom') {
        if (customDate && logDate !== customDate) return false;
      }

      // 2. Expedition Filter
      if (filterExpedition !== 'ALL' && log.expedition !== filterExpedition) {
        return false;
      }

      // 3. Method Filter
      const method = log.method || 'pickup';
      if (filterMethod !== 'ALL' && method !== filterMethod) {
        return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const expName = EXPEDITIONS[log.expedition]?.name?.toLowerCase() || '';
        const matchExp = log.expedition.toLowerCase().includes(q) || expName.includes(q);
        const matchTime = log.timestamp.toLowerCase().includes(q);
        const matchDate = (log.date || '').includes(q) || (log.dateFormatted || '').toLowerCase().includes(q);
        const matchMethod = method.toLowerCase().includes(q);
        const matchAmount = String(log.amount).includes(q);
        if (!matchExp && !matchTime && !matchDate && !matchMethod && !matchAmount) {
          return false;
        }
      }

      return true;
    });
  }, [
    logs,
    todayIso,
    yesterdayIso,
    sevenDaysAgoIso,
    datePreset,
    customDate,
    filterExpedition,
    filterMethod,
    searchQuery,
  ]);

  // Aggregate metrics for currently filtered logs
  const metrics = useMemo(() => {
    const totalPcs = filteredLogs.reduce((sum, l) => sum + l.amount, 0);
    const pickupPcs = filteredLogs
      .filter((l) => (l.method || 'pickup') === 'pickup')
      .reduce((sum, l) => sum + l.amount, 0);
    const dropOffPcs = filteredLogs
      .filter((l) => l.method === 'drop off')
      .reduce((sum, l) => sum + l.amount, 0);

    return {
      totalPcs,
      pickupPcs,
      dropOffPcs,
      count: filteredLogs.length,
    };
  }, [filteredLogs]);

  // Dynamic header label based on date filter
  const activeDateLabel = useMemo(() => {
    if (datePreset === 'today') {
      return `Hari Ini (${formatIsoToIndonesian(todayIso)})`;
    }
    if (datePreset === 'yesterday') {
      return `Kemarin (${formatIsoToIndonesian(yesterdayIso)})`;
    }
    if (datePreset === '7days') {
      return '7 Hari Terakhir';
    }
    if (datePreset === 'custom') {
      return customDate
        ? `Tanggal: ${formatIsoToIndonesian(customDate)}`
        : 'Pilih Tanggal Kalender';
    }
    return `Semua Tanggal (${distinctDates.length} Hari Tersedia)`;
  }, [datePreset, customDate, todayIso, yesterdayIso, distinctDates.length]);

  // Handle custom date picker input change
  const handleCustomDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomDate(val);
    if (val) {
      setDatePreset('custom');
    } else {
      setDatePreset('today');
    }
  };

  // Copy summary of filtered date
  const handleCopyFilteredSummary = () => {
    if (filteredLogs.length === 0) {
      showToast?.('Tidak ada data pada filter tanggal ini untuk disalin.', 'warning');
      return;
    }

    const jneCount = filteredLogs
      .filter((l) => l.expedition === 'JNE')
      .reduce((s, l) => s + l.amount, 0);
    const jntCount = filteredLogs
      .filter((l) => l.expedition === 'JNT')
      .reduce((s, l) => s + l.amount, 0);
    const spxCount = filteredLogs
      .filter((l) => l.expedition === 'SPX')
      .reduce((s, l) => s + l.amount, 0);
    const idxCount = filteredLogs
      .filter((l) => l.expedition === 'IDX')
      .reduce((s, l) => s + l.amount, 0);

    const summary = `📦 REKAP LOG PAKET - ${activeDateLabel}
• Total: ${metrics.totalPcs} paket (${metrics.count} transaksi)
• JNE: ${jneCount} paket
• J&T: ${jntCount} paket
• SPX: ${spxCount} paket
• ID Express: ${idxCount} paket
• Pickup: ${metrics.pickupPcs} | Drop Off: ${metrics.dropOffPcs}`;

    navigator.clipboard.writeText(summary).then(
      () => showToast?.(`Ringkasan ${activeDateLabel} berhasil disalin!`, 'success'),
      () => showToast?.('Gagal menyalin teks.', 'error')
    );
  };

  // Download filtered date logs as CSV
  const handleDownloadFilteredCSV = () => {
    if (filteredLogs.length === 0) {
      showToast?.('Tidak ada data pada filter tanggal ini untuk diunduh.', 'warning');
      return;
    }

    let csv = 'Tanggal,Waktu,Ekspedisi,Metode,Jumlah Pcs\n';
    filteredLogs.forEach((l) => {
      const d = l.dateFormatted || l.date || todayIso;
      const exp = EXPEDITIONS[l.expedition]?.name || l.expedition;
      const m = l.method || 'pickup';
      csv += `"${d}","${l.timestamp}","${exp}","${m}",${l.amount}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileSuffix =
      datePreset === 'custom' && customDate
        ? customDate
        : datePreset;
    link.setAttribute('download', `log-rekap-${fileSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast?.(`File CSV log ${activeDateLabel} berhasil diunduh.`, 'success');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
      {/* Header bar with actions (Clean & Spacious) */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-base">Riwayat Catatan</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {metrics.count} Transaksi
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {activeDateLabel}
            </p>
          </div>
        </div>

        {/* Action buttons (Clean, no clutter) */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            id="btn-prompt-reset"
            onClick={onPromptReset}
            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Reset hitungan hari ini"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset</span>
          </button>

          <button
            id="btn-open-server"
            onClick={onOpenHistory}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            title="Lihat riwayat data tersimpan di Google Sheet"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Data Tersimpan</span>
          </button>

          <button
            id="btn-sync"
            disabled={isSyncing}
            onClick={onSyncGoogleSheet}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="Kirim total data paket ke Google Sheet"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <CloudUpload className="w-3.5 h-3.5" />
                <span>Simpan Data</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unified Compact Filter Bar (Replaces 3 stacked toolbars) */}
      <div className="p-3 bg-white border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
        {/* Date presets + calendar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setDatePreset('today');
                setCustomDate('');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                datePreset === 'today'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hari Ini ({todayCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setDatePreset('yesterday');
                setCustomDate('');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                datePreset === 'yesterday'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kemarin ({yesterdayCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setDatePreset('all');
                setCustomDate('');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                datePreset === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({logs.length})
            </button>
          </div>

          {/* Date Picker Input */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
            <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="date"
              id="input-filter-date"
              value={customDate}
              onChange={handleCustomDateChange}
              max={todayIso}
              className="bg-transparent text-slate-700 font-medium focus:outline-none text-xs cursor-pointer"
            />
            {customDate && (
              <button
                type="button"
                onClick={() => {
                  setCustomDate('');
                  setDatePreset('today');
                }}
                className="text-slate-400 hover:text-slate-700 p-0.5"
                title="Hapus tanggal custom"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Courier Filter Dropdown, Method Dropdown & Search Input */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Ekspedisi Dropdown */}
          <select
            value={filterExpedition}
            onChange={(e) => setFilterExpedition(e.target.value)}
            className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Ekspedisi</option>
            {EXPEDITION_KEYS.map((k) => (
              <option key={k} value={k}>
                {EXPEDITIONS[k].name}
              </option>
            ))}
          </select>

          {/* Metode Dropdown */}
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value as any)}
            className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Metode</option>
            <option value="pickup">Pickup</option>
            <option value="drop off">Drop Off</option>
          </select>

          {/* Search Box */}
          <div className="relative w-32 sm:w-40">
            <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari..."
              className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Table & Body */}
      <div className="overflow-y-auto flex-1 max-h-[420px]">
        {filteredLogs.length === 0 ? (
          <div
            id="emptyLogState"
            className="flex flex-col items-center justify-center p-12 text-slate-400 text-center"
          >
            <div className="p-3 bg-slate-50 rounded-full mb-3 text-slate-300">
              <Inbox className="w-10 h-10" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {logs.length === 0
                ? 'Belum ada catatan paket yang diinput.'
                : `Tidak ada catatan untuk filter tanggal "${activeDateLabel}".`}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {logs.length === 0
                ? 'Gunakan form Input Cepat di atas untuk mencatat pengiriman hari ini.'
                : 'Pilih tombol "Hari Ini", "Semua Tanggal", atau ubah pilihan tanggal di kalender.'}
            </p>
            {datePreset !== 'today' && (
              <button
                type="button"
                onClick={() => {
                  setDatePreset('today');
                  setCustomDate('');
                }}
                className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors"
              >
                Kembali ke Hari Ini
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/90 backdrop-blur-xs sticky top-0 shadow-2xs z-10">
              <tr>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Tanggal & Waktu
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Ekspedisi
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Metode
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Jumlah
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 text-center">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody id="logTableBody" className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const expInfo = EXPEDITIONS[log.expedition];
                const method = log.method || 'pickup';
                const logDate = log.date || todayIso;
                const isToday = logDate === todayIso;
                const isYesterday = logDate === yesterdayIso;

                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="p-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-slate-700 font-bold font-mono">
                            {log.timestamp}
                          </span>
                          {isToday ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Hari Ini
                            </span>
                          ) : isYesterday ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Kemarin
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                              {formatIsoToIndonesian(logDate)}
                            </span>
                          )}
                        </div>
                        {log.dateFormatted && (
                          <span className="text-[11px] text-slate-400 mt-0.5">
                            {log.dateFormatted}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold"
                        style={{
                          backgroundColor: `${expInfo.colorHex}15`,
                          color: expInfo.colorHex,
                          border: `1px solid ${expInfo.colorHex}30`,
                        }}
                      >
                        {expInfo.name}
                      </span>
                    </td>
                    <td className="p-3">
                      {method === 'drop off' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Store className="w-3 h-3 text-amber-600" />
                          <span>Drop Off</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Truck className="w-3 h-3 text-indigo-600" />
                          <span>Pickup</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-sm font-bold">
                      {log.amount < 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-600">
                          <Minus className="w-3 h-3 stroke-[3]" />
                          {Math.abs(log.amount)} Pcs
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Plus className="w-3 h-3 stroke-[3]" />
                          {log.amount} Pcs
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onRemoveLog(log.id)}
                        className="text-slate-400 hover:text-red-600 bg-slate-100 hover:bg-red-50 p-1.5 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="Batalkan / Hapus catatan ini"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Info & Quick Export */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-slate-600 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 font-medium">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Total: <strong className="text-indigo-700 font-bold">{metrics.totalPcs} Pcs</strong>
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-500">
            Pickup: <strong>{metrics.pickupPcs}</strong>
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-500">
            Drop Off: <strong>{metrics.dropOffPcs}</strong>
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-400 text-[11px]">
            ({filteredLogs.length} catatan)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyFilteredSummary}
            disabled={filteredLogs.length === 0}
            className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 flex items-center gap-1"
            title="Salin ringkasan data tanggal ini"
          >
            <Copy className="w-3 h-3 text-slate-400" />
            <span>Salin Rekap</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadFilteredCSV}
            disabled={filteredLogs.length === 0}
            className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 flex items-center gap-1"
            title="Unduh CSV catatan pada tanggal ini"
          >
            <Download className="w-3 h-3 text-slate-400" />
            <span>CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
};
