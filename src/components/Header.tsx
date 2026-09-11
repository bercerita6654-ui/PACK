import React from 'react';
import {
  Calendar,
  Package,
  Download,
  Settings,
  Truck,
  ScanBarcode,
  HardDrive,
  FileSpreadsheet,
  Check,
  FileText,
  RefreshCw,
  LogIn,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AppState, ActiveTab, ActiveSpreadsheet } from '../types';

interface HeaderProps {
  appData: AppState;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  packingCount: number;
  notaCount?: number;
  pendingNotaCount?: number;
  delayedNotaCount?: number;
  showRekapTab?: boolean;
  user: User | null;
  activeSpreadsheet: ActiveSpreadsheet | null;
  onOpenGoogleDriveModal: () => void;
  onOpenSessionModal?: () => void;
  onGoogleSignIn: () => void;
  onRenewSession?: () => void;
  isRenewingSession?: boolean;
  onOpenSettings: () => void;
  onShareWhatsApp?: () => void;
  onExportCSV: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  appData,
  activeTab,
  onTabChange,
  packingCount,
  notaCount = 0,
  pendingNotaCount = 0,
  delayedNotaCount = 0,
  showRekapTab = false,
  user,
  activeSpreadsheet,
  onOpenGoogleDriveModal,
  onOpenSessionModal,
  onGoogleSignIn,
  onRenewSession,
  isRenewingSession = false,
  onOpenSettings,
  onExportCSV,
}) => {
  const total =
    appData.counts.JNE +
    appData.counts.JNT +
    appData.counts.SPX +
    appData.counts.IDX;

  const handleOpenAuthPopup = () => {
    if (onOpenSessionModal) {
      onOpenSessionModal();
    } else if (onRenewSession) {
      onRenewSession();
    } else {
      onGoogleSignIn();
    }
  };

  return (
    <header
      id="app-header"
      className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                Rekap Kiriman Reguler
              </h1>
              <div className="flex items-center gap-2 text-slate-500 text-sm mt-0.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span id="currentDate" className="font-medium">
                  {appData.date || 'Memuat tanggal...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Pop-up Trigger Google Session & Login Button */}
          {user ? (
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                id="btn-google-renew-session"
                onClick={handleOpenAuthPopup}
                disabled={isRenewingSession}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200/80 transition-all text-xs font-black shadow-2xs group cursor-pointer"
                title={`Akun: ${user.email || user.displayName || 'Google User'}. Klik untuk buka pop-up kelola & perbarui sesi Google`}
              >
                {isRenewingSession ? (
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                ) : user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Google User'}
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full border border-emerald-400"
                  />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                )}
                <div className="text-left flex items-center gap-1.5">
                  <span className="font-black text-[11px] leading-tight text-slate-800 group-hover:text-emerald-900">
                    {isRenewingSession ? 'Memperbarui Sesi...' : 'Perbarui Sesi Google'}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Sesi Aktif" />
                </div>
              </button>

              <button
                type="button"
                id="btn-google-drive-connected"
                onClick={onOpenGoogleDriveModal}
                className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded-lg transition-all cursor-pointer"
                title={`Kelola Google Drive & Spreadsheet (${activeSpreadsheet?.name || 'Default'})`}
              >
                <HardDrive className="w-4 h-4 text-emerald-600" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="btn-google-signin-header"
              onClick={handleOpenAuthPopup}
              disabled={isRenewingSession}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-emerald-400/80 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-black text-xs transition-all shadow-xs cursor-pointer"
              title="Buka pop-up masuk & kelola Sesi Google"
            >
              {isRenewingSession ? (
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>{isRenewingSession ? 'Menghubungkan...' : 'Perbarui Sesi Google'}</span>
            </button>
          )}

          {/* Quick Utility Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl">
            <button
              id="btn-export-csv"
              onClick={onExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-700 hover:bg-white rounded-lg transition-all"
              title="Unduh file CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>
            <button
              id="btn-open-settings"
              onClick={onOpenSettings}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
              title="Pengaturan Google Sheet URL"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Menu Navigation Tabs */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            id="nav-tab-nota"
            onClick={() => onTabChange('nota')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'nota'
                ? 'bg-white text-amber-900 shadow-xs ring-1 ring-amber-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-600" />
            <span>Scan Nota (Belum Packing)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 ${
                delayedNotaCount > 0
                  ? 'bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs'
                  : activeTab === 'nota'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-slate-200/70 text-slate-600'
              }`}
            >
              {delayedNotaCount > 0 ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping inline-block" />
                  <span>{delayedNotaCount} Tertunda!</span>
                </>
              ) : pendingNotaCount > 0 ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" />
                  <span>{pendingNotaCount} Pending</span>
                </>
              ) : (
                <span>{notaCount}</span>
              )}
            </span>
          </button>

          <button
            type="button"
            id="nav-tab-packing"
            onClick={() => onTabChange('packing')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'packing'
                ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ScanBarcode className="w-4 h-4 text-emerald-600" />
            <span>Scan Nota (Sudah Packing)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                activeTab === 'packing'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200/70 text-slate-600'
              }`}
            >
              {packingCount}
            </span>
          </button>

          {showRekapTab && (
            <button
              type="button"
              id="nav-tab-rekap"
              onClick={() => onTabChange('rekap')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'rekap'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-4 h-4 text-indigo-600" />
              <span>Rekap Kiriman Reguler</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                  activeTab === 'rekap'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {total}
              </span>
            </button>
          )}

          <button
            type="button"
            id="nav-tab-sheet-history"
            onClick={() => onTabChange('sheet_history')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'sheet_history'
                ? 'bg-white text-emerald-900 shadow-xs ring-1 ring-emerald-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Riwayat Google Sheet</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 ${
                activeTab === 'sheet_history'
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-slate-200/70 text-slate-600'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              <span>Cloud</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
