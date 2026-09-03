import React, { useEffect, useState, useCallback } from 'react';
import {
  Database,
  X,
  RotateCw,
  AlertCircle,
  Search,
  ExternalLink,
  FileSpreadsheet,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseCSV } from '../utils/csv';
import { fetchSheetValues, getSpreadsheetDetails } from '../services/googleWorkspace';
import { ActiveSpreadsheet } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  csvUrl: string;
  activeSpreadsheet?: ActiveSpreadsheet | null;
  accessToken?: string | null;
  initialTab?: string;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  csvUrl,
  activeSpreadsheet,
  accessToken,
  initialTab = 'Rekap Harian',
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [activeTabName, setActiveTabName] = useState<string>(initialTab);

  // Sync activeTabName with initialTab when opened
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTabName(initialTab);
    }
  }, [isOpen, initialTab]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    // If signed in with Google Drive/Sheets API
    if (accessToken && activeSpreadsheet) {
      try {
        const details = await getSpreadsheetDetails(accessToken, activeSpreadsheet.id);
        const tabs = details.sheets.map((s) => s.title);
        setAvailableTabs(tabs);

        const currentTab = tabs.includes(activeTabName) ? activeTabName : tabs[0] || 'Sheet1';
        if (currentTab !== activeTabName) {
          setActiveTabName(currentTab);
        }

        const values = await fetchSheetValues(
          accessToken,
          activeSpreadsheet.id,
          `${currentTab}!A1:Z300`
        );

        if (!values || values.length <= 1) {
          setHeaders(values && values[0] ? values[0].map(String) : []);
          setRows([]);
          return;
        }

        setHeaders(values[0].map(String));
        const dataRows = values
          .slice(1)
          .map((r) => r.map(String))
          .reverse();
        setRows(dataRows.filter((row) => row.length > 0 && row.some((c) => c.trim() !== '')));
      } catch (err: any) {
        console.error('Fetch Google Sheets API error:', err);
        setError(err.message || 'Gagal membaca data dari Google Sheets API.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Fallback to CSV URL
    if (!csvUrl || csvUrl.trim() === '') {
      setError('Belum ada akun Google terhubung atau URL CSV belum dikonfigurasi.');
      setLoading(false);
      return;
    }

    try {
      const fetchUrl = `${csvUrl}${csvUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Status ${response.status}: Gagal memuat data dari spreadsheet`);
      }

      const csvText = await response.text();
      const parsed = parseCSV(csvText);

      if (parsed.length <= 1) {
        setHeaders([]);
        setRows([]);
        return;
      }

      setHeaders(parsed[0]);
      const dataRows = parsed.slice(1).reverse();
      setRows(dataRows.filter((row) => row.length > 1 || (row[0] && row[0].trim() !== '')));
    } catch (err: unknown) {
      console.error('Fetch CSV error:', err);
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeSpreadsheet, activeTabName, csvUrl]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  if (!isOpen) return null;

  const filteredRows = rows.filter((row) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return row.some((cell) => cell.toLowerCase().includes(query));
  });

  return (
    <AnimatePresence>
      <div
        id="historyModal"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          id="historyModalContent"
          className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-5xl shadow-2xl border border-slate-100 flex flex-col h-full max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900">
                    Data Tersimpan di Google Sheets
                  </h3>
                  {activeSpreadsheet && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      {activeSpreadsheet.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {accessToken
                    ? 'Terbaca langsung via Google Sheets API resmi'
                    : 'Terbaca via published CSV URL'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeSpreadsheet?.url && (
                <a
                  href={activeSpreadsheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Buka Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={fetchHistory}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab Selector if multiple sheets available */}
          {availableTabs.length > 1 && (
            <div className="flex items-center gap-2 mb-3 bg-slate-100/90 p-1 rounded-xl shrink-0 overflow-x-auto">
              <span className="text-xs font-bold text-slate-500 px-2 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> Tab:
              </span>
              {availableTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTabName(tab)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    activeTabName === tab
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          {/* Search bar inside modal */}
          {rows.length > 0 && (
            <div className="mb-3 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari berdasarkan tanggal, ekspedisi, atau kata kunci..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>
          )}

          {/* Table Container */}
          <div className="overflow-auto flex-1 border border-slate-200 rounded-xl relative bg-slate-50/40">
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center">
                <RotateCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
                <p className="font-semibold text-slate-700 text-sm">
                  Menghubungkan ke Google Sheets...
                </p>
                <span className="text-xs text-slate-400 mt-1">
                  Mengambil rekapan data terbaru
                </span>
              </div>
            ) : error ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <AlertCircle className="w-10 h-10 text-amber-500 mb-2" />
                <h4 className="font-bold text-slate-800 text-base mb-1">
                  Tidak Dapat Memuat Data
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">{error}</p>
                <button
                  onClick={fetchHistory}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
                >
                  Coba Lagi
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p className="text-sm font-semibold text-slate-600">
                  Belum ada data di sheet ini.
                </p>
                <p className="text-xs mt-1">
                  Klik tombol "Simpan Data" di aplikasi untuk mencatat ke Google Sheet.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider z-10">
                  <tr>
                    <th className="p-3 border-r border-slate-200 text-center w-12">#</th>
                    {headers.map((head, idx) => (
                      <th key={idx} className="p-3 border-r border-slate-200 whitespace-nowrap">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-indigo-50/40 transition-colors odd:bg-white even:bg-slate-50/50"
                    >
                      <td className="p-3 font-mono text-slate-400 text-center border-r border-slate-200">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="p-3 border-r border-slate-200 font-medium text-slate-800 whitespace-nowrap"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer stats */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Total Baris:{' '}
              <strong className="text-slate-800">
                {filteredRows.length} dari {rows.length} baris
              </strong>
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Data terurut dari yang terbaru
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
