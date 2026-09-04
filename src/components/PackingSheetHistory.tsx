import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Search,
  CheckCircle2,
  Copy,
  AlertCircle,
  LogIn,
  Layers,
  Filter,
  ArrowUpDown,
  Download,
} from 'lucide-react';
import { PlatformType } from '../types';
import { fetchPackingRegHistory } from '../services/googleWorkspace';

interface PackingSheetHistoryProps {
  accessToken: string | null;
  userEmail?: string;
  onLoginGoogle?: () => void;
  targetSpreadsheetId: string;
  targetSheetTab: string;
  lastSyncTimestamp?: number;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface SheetPackingRow {
  rowNumber: number;
  no: string;
  orderNumber: string;
  platform: PlatformType;
  date: string;
  timestamp: string;
  status: string;
}

export const PackingSheetHistory: React.FC<PackingSheetHistoryProps> = ({
  accessToken,
  userEmail,
  onLoginGoogle,
  targetSpreadsheetId,
  targetSheetTab,
  lastSyncTimestamp,
  showToast,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedTabName, setResolvedTabName] = useState<string>(targetSheetTab);
  const [sheetRows, setSheetRows] = useState<SheetPackingRow[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<'Semua' | 'Shopee' | 'Tokopedia/TikTok'>('Semua');
  const [sortDescending, setSortDescending] = useState<boolean>(true); // latest rows first

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

  // Fetch data from Google Sheet
  const loadSheetHistory = useCallback(async () => {
    if (!accessToken) {
      setSheetRows([]);
      setError('Belum terhubung dengan akun Google. Silakan login untuk membaca data sheet.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchPackingRegHistory(accessToken, targetSpreadsheetId, targetSheetTab);
      setResolvedTabName(result.tabName);

      // Parse rows
      // Headers expected: [No, No Pesanan, Platform, Tanggal, Waktu Scan, Status]
      const parsed: SheetPackingRow[] = [];
      result.rows.forEach((r, idx) => {
        // Skip empty rows
        if (!r || r.length === 0 || !r.some((cell) => cell && cell.trim() !== '')) {
          return;
        }

        const no = r[0] || String(idx + 1);
        const orderNumber = r[1] ? r[1].trim().toUpperCase() : '';
        const rawPlatform = r[2] ? r[2].trim() : '';
        const date = r[3] ? r[3].trim() : '-';
        const timestamp = r[4] ? r[4].trim() : '-';
        const status = r[5] ? r[5].trim() : 'Selesai Packing';

        if (!orderNumber) return;

        let platform: PlatformType = 'Shopee';
        if (
          rawPlatform.toLowerCase().includes('tokopedia') ||
          rawPlatform.toLowerCase().includes('tiktok')
        ) {
          platform = 'Tokopedia/TikTok';
        } else if (orderNumber.length >= 16 && /^\d+$/.test(orderNumber)) {
          platform = 'Tokopedia/TikTok';
        }

        parsed.push({
          rowNumber: idx + 2, // 1-indexed including header
          no,
          orderNumber,
          platform,
          date,
          timestamp,
          status,
        });
      });

      setSheetRows(parsed);
      setLastFetchedAt(new Date());
    } catch (err: any) {
      console.error('Error fetching sheet packing history:', err);
      setError(err.message || 'Gagal membaca riwayat dari Google Sheet.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, targetSpreadsheetId, targetSheetTab]);

  // Initial load or when accessToken / lastSyncTimestamp changes
  useEffect(() => {
    if (accessToken) {
      loadSheetHistory();
    }
  }, [accessToken, lastSyncTimestamp, loadSheetHistory]);

  // Counts
  const shopeeCount = useMemo(
    () => sheetRows.filter((r) => r.platform === 'Shopee').length,
    [sheetRows]
  );
  const tokpedCount = useMemo(
    () => sheetRows.filter((r) => r.platform === 'Tokopedia/TikTok').length,
    [sheetRows]
  );

  // Filter and sort
  const filteredAndSortedRows = useMemo(() => {
    let result = sheetRows.filter((row) => {
      const matchPlatform =
        platformFilter === 'Semua' || row.platform === platformFilter;
      const matchSearch =
        !searchQuery.trim() ||
        row.orderNumber.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        row.date.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        row.timestamp.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchPlatform && matchSearch;
    });

    if (sortDescending) {
      result = [...result].reverse();
    }

    return result;
  }, [sheetRows, platformFilter, searchQuery, sortDescending]);

  // Copy order numbers from sheet
  const handleCopyOrderNumbers = () => {
    if (filteredAndSortedRows.length === 0) {
      showToast('Tidak ada nomor pesanan untuk disalin.', 'warning');
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
      showToast('Tidak ada data riwayat untuk diunduh.', 'warning');
      return;
    }
    const header = 'No,No Pesanan,Platform,Tanggal,Waktu Scan,Status\n';
    const body = sheetRows
      .map(
        (r, i) =>
          `"${i + 1}","${r.orderNumber}","${r.platform}","${r.date}","${r.timestamp}","${r.status}"`
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `riwayat-packing-sheet-${targetSheetTab.replace(/\s+/g, '_')}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File CSV riwayat Google Sheet berhasil diunduh.', 'success');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                  Riwayat Tersimpan di Google Sheet
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Tab: {resolvedTabName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <span>Spreadsheet:</span>
                <code className="bg-slate-200/70 text-slate-700 px-1.5 py-0.2 rounded text-[11px] font-mono">
                  {targetSpreadsheetId}
                </code>
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {accessToken ? (
            <button
              type="button"
              id="btn-refresh-sheet-history"
              onClick={loadSheetHistory}
              disabled={loading}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
              title="Segarkan data dari Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Memuat...' : 'Segarkan Data'}</span>
            </button>
          ) : (
            onLoginGoogle && (
              <button
                type="button"
                onClick={onLoginGoogle}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Hubungkan Google Drive</span>
              </button>
            )
          )}

          <a
            href={spreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Buka file Google Spreadsheet di tab baru"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
            <span>Buka di Google Sheets ↗</span>
          </a>
        </div>
      </div>

      {/* Summary Badges & Stats */}
      <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-slate-400 block text-xs font-semibold">Total Tersimpan di Sheet</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-extrabold text-slate-900">{sheetRows.length}</span>
              <span className="text-xs text-slate-500 font-medium">Paket</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-orange-200 shadow-2xs">
            <span className="text-orange-600 block text-xs font-semibold">Shopee di Sheet</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-extrabold text-orange-600">{shopeeCount}</span>
              <span className="text-xs text-slate-500 font-medium">Paket</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
            <span className="text-emerald-700 block text-xs font-semibold">Tokopedia / TikTok</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-extrabold text-emerald-700">{tokpedCount}</span>
              <span className="text-xs text-slate-500 font-medium">Paket</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-center">
            <span className="text-slate-400 block text-xs font-semibold">Status Sinkronisasi</span>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              {accessToken ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-emerald-700 truncate">
                    {userEmail || 'Terhubung'}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-bold text-amber-700">Perlu Login</span>
                </>
              )}
            </div>
            {lastFetchedAt && (
              <span className="text-[10px] text-slate-400 mt-0.5">
                Sinkron: {lastFetchedAt.toLocaleTimeString('id-ID')}
              </span>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Filter:
            </span>
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
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                placeholder="Cari no pesanan / tgl..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-medium text-slate-800 uppercase placeholder:normal-case placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortDescending(!sortDescending)}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors"
              title={sortDescending ? 'Urutan: Data Terkini di Atas' : 'Urutan: Data Awal di Atas'}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleCopyOrderNumbers}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Salin daftar nomor pesanan yang tampil"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleDownloadCSV}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Unduh seluruh riwayat Google Sheet ke CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Table Data or State */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
        {!accessToken ? (
          <div className="p-8 text-center text-slate-500">
            <AlertCircle className="w-8 h-8 mx-auto text-amber-500 mb-2 opacity-80" />
            <h4 className="text-sm font-bold text-slate-800">
              Koneksikan Akun Google untuk Membaca Riwayat Sheet
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Aplikasi memerlukan izin baca Google Spreadsheet untuk menampilkan daftar paket yang sudah tersimpan di sheet <code>{resolvedTabName}</code> secara real-time.
            </p>
            {onLoginGoogle && (
              <button
                type="button"
                onClick={onLoginGoogle}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Masuk dengan Google</span>
              </button>
            )}
          </div>
        ) : loading && sheetRows.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center">
            <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mb-3" />
            <span className="text-sm font-bold text-slate-800">
              Menghubungkan ke Google Sheet...
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Membaca data dari tab "{resolvedTabName}"
            </span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-600 bg-rose-50/50">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-rose-500" />
            <p className="text-xs font-bold">{error}</p>
            <button
              type="button"
              onClick={loadSheetHistory}
              className="mt-3 px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-100 rounded-lg text-xs font-bold text-rose-700 transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredAndSortedRows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium text-slate-600">
              {sheetRows.length === 0
                ? `Belum ada riwayat baris data pada sheet "${resolvedTabName}". Simpan scan pertama Anda untuk melihatnya di sini!`
                : 'Tidak ada data yang sesuai dengan pencarian / filter ini.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100/90 text-slate-600 uppercase font-bold text-[11px] sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-3 w-12 text-center">No</th>
                <th className="p-3">No. Pesanan / Resi</th>
                <th className="p-3">Platform</th>
                <th className="p-3">Tanggal</th>
                <th className="p-3">Waktu Scan</th>
                <th className="p-3">Status di Sheet</th>
                <th className="p-3 w-16 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {filteredAndSortedRows.map((row, idx) => {
                const isShopee = row.platform === 'Shopee';
                return (
                  <tr key={`${row.orderNumber}-${idx}`} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-mono font-bold uppercase text-slate-900 tracking-wide">
                      {row.orderNumber}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          isShopee
                            ? 'bg-orange-50 text-orange-700 border border-orange-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {isShopee ? 'Shopee' : 'Tokopedia / TikTok'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 font-medium text-xs">
                      {row.date}
                    </td>
                    <td className="p-3 text-slate-500 font-medium text-xs">
                      {row.timestamp}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(row.orderNumber);
                          showToast(`No. pesanan ${row.orderNumber} disalin!`, 'info');
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Salin No. Pesanan"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-slate-500 text-[11px] flex flex-col sm:flex-row items-center justify-between gap-2 font-medium">
        <span>
          Menampilkan <strong>{filteredAndSortedRows.length}</strong> dari{' '}
          <strong>{sheetRows.length}</strong> total baris di sheet{' '}
          <strong>{resolvedTabName}</strong>.
        </span>
        <span className="text-slate-400">
          Data tersimpan permanen di cloud Google Spreadsheet Anda
        </span>
      </div>
    </div>
  );
};
