import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Layers,
  ExternalLink,
  RefreshCw,
  FileText,
  ScanBarcode,
  Calendar,
  Sparkles,
  HardDrive,
} from 'lucide-react';
import { ProcessedNotaSheetHistory } from './ProcessedNotaSheetHistory';
import { PackingSheetHistory } from './PackingSheetHistory';
import { HistoryModal } from './HistoryModal';
import { PackedOrder, ProcessedNota, ActiveSpreadsheet, ToastItem, ToastOptions } from '../types';

interface GoogleSheetHistorySectionProps {
  accessToken: string | null;
  userEmail?: string | null;
  onLoginGoogle: () => void;
  onTokenExpired?: () => void;
  targetSpreadsheetId: string;
  targetPackingTab: string;
  targetNotaTab: string;
  lastSyncTimestamp?: number;
  showToast: (
    msg: string,
    type?: ToastItem['type'],
    options?: ToastOptions
  ) => void;
  packedOrders: PackedOrder[];
  localNotas: ProcessedNota[];
  activeSpreadsheet: ActiveSpreadsheet | null;
  csvUrl: string;
  initialSubTab?: 'nota' | 'packing' | 'rekap';
  showRekapTab?: boolean;
  initialFilter?: 'all' | 'pending' | 'overdue' | 'packed';
  onFilterChange?: (filter: 'all' | 'pending' | 'overdue' | 'packed') => void;
}

export const GoogleSheetHistorySection: React.FC<GoogleSheetHistorySectionProps> = ({
  accessToken,
  userEmail,
  onLoginGoogle,
  onTokenExpired,
  targetSpreadsheetId,
  targetPackingTab,
  targetNotaTab,
  lastSyncTimestamp,
  showToast,
  packedOrders,
  localNotas,
  activeSpreadsheet,
  csvUrl,
  initialSubTab = 'nota',
  showRekapTab = false,
  initialFilter,
  onFilterChange,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'nota' | 'packing' | 'rekap'>(
    initialSubTab === 'rekap' && !showRekapTab ? 'nota' : initialSubTab
  );

  const [currentFilter, setCurrentFilter] = useState<'all' | 'pending' | 'overdue' | 'packed'>(
    initialFilter || 'all'
  );

  useEffect(() => {
    if (initialFilter) {
      setCurrentFilter(initialFilter);
    }
  }, [initialFilter]);

  const handleStatusFilterChange = (newFilter: 'all' | 'pending' | 'overdue' | 'packed') => {
    setCurrentFilter(newFilter);
    if (onFilterChange) {
      onFilterChange(newFilter);
    }
  };

  const sheetUrl =
    activeSpreadsheet?.url ||
    `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

  return (
    <section id="google-sheet-history-section" className="space-y-6">
      {/* Top Banner & Tab Controls */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/80 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Riwayat Tersimpan di Google Sheet
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 hidden sm:inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>Cloud Sync</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pantau seluruh arsip data yang telah tersinkronisasi ke spreadsheet cloud tanpa perlu scroll ke bawah.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Buka spreadsheet aktif di Google Sheets tab baru"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Buka Google Sheet</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
            </a>

            {!accessToken && (
              <button
                type="button"
                id="btn-login-google-from-sheet-history"
                onClick={onLoginGoogle}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Hubungkan Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Tab Switcher */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="subtab-sheet-nota"
            onClick={() => setActiveSubTab('nota')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'nota'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Nota Diproses & Sinkron Packing</span>
          </button>

          <button
            type="button"
            id="subtab-sheet-packing"
            onClick={() => setActiveSubTab('packing')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'packing'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900'
            }`}
          >
            <ScanBarcode className="w-4 h-4" />
            <span>Tab "Packing Reg"</span>
          </button>

          {showRekapTab && (
            <button
              type="button"
              id="subtab-sheet-rekap"
              onClick={() => setActiveSubTab('rekap')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeSubTab === 'rekap'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Tab "Rekap Harian"</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tab View Rendering */}
      <div>
        {activeSubTab === 'nota' && (
          <ProcessedNotaSheetHistory
            accessToken={accessToken}
            userEmail={userEmail}
            onLoginGoogle={onLoginGoogle}
            onTokenExpired={onTokenExpired}
            targetSpreadsheetId={targetSpreadsheetId}
            targetSheetTab={targetNotaTab}
            lastSyncTimestamp={lastSyncTimestamp}
            showToast={showToast}
            packedOrders={packedOrders}
            localNotas={localNotas}
            selectedStatusFilter={currentFilter}
            onStatusFilterChange={handleStatusFilterChange}
          />
        )}

        {activeSubTab === 'packing' && (
          <PackingSheetHistory
            accessToken={accessToken}
            userEmail={userEmail}
            onLoginGoogle={onLoginGoogle}
            onTokenExpired={onTokenExpired}
            targetSpreadsheetId={targetSpreadsheetId}
            targetSheetTab={targetPackingTab}
            lastSyncTimestamp={lastSyncTimestamp}
            showToast={showToast}
          />
        )}

        {activeSubTab === 'rekap' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Data Tab "Rekap Harian" (Ekspedisi & Kiriman)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tabel data kiriman harian paket JNE, J&T, SPX, dan ID Express yang tersimpan di Google Sheet.
                </p>
              </div>
            </div>

            <PackingSheetHistory
              accessToken={accessToken}
              userEmail={userEmail}
              onLoginGoogle={onLoginGoogle}
              onTokenExpired={onTokenExpired}
              targetSpreadsheetId={targetSpreadsheetId}
              targetSheetTab="Rekap Harian"
              lastSyncTimestamp={lastSyncTimestamp}
              showToast={showToast}
            />
          </div>
        )}
      </div>
    </section>
  );
};
