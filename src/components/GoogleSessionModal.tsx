import React, { useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  LogOut,
  ExternalLink,
  HardDrive,
  FileSpreadsheet,
  UserCheck,
  ShieldCheck,
  UserPlus,
  Clock,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { ActiveSpreadsheet } from '../types';
import { isStoredTokenValid } from '../services/googleAuth';

interface GoogleSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  isRenewingSession: boolean;
  onRenewSession: () => Promise<void>;
  onSwitchAccount: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onOpenDriveManager: () => void;
  activeSpreadsheet: ActiveSpreadsheet | null;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const GoogleSessionModal: React.FC<GoogleSessionModalProps> = ({
  isOpen,
  onClose,
  user,
  accessToken,
  isRenewingSession,
  onRenewSession,
  onSwitchAccount,
  onSignOut,
  onOpenDriveManager,
  activeSpreadsheet,
  showToast,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  if (!isOpen) return null;

  const isTokenActive = Boolean(accessToken && isStoredTokenValid());

  const handleRenewClick = async () => {
    setIsProcessing(true);
    try {
      await onRenewSession();
    } catch (err: any) {
      console.error('Renew session failed in modal:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSwitchAccountClick = async () => {
    setIsProcessing(true);
    try {
      await onSwitchAccount();
    } catch (err: any) {
      console.error('Switch account failed in modal:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOutClick = async () => {
    setIsProcessing(true);
    try {
      await onSignOut();
      onClose();
    } catch (err: any) {
      console.error('Sign out error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        id="googleSessionModalOverlay"
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          id="googleSessionModalContent"
          className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-6"
        >
          {/* Modal Header */}
          <div className="bg-linear-to-r from-emerald-600 via-teal-600 to-indigo-700 p-5 sm:p-6 text-white relative">
            <button
              type="button"
              id="btn-close-google-session-modal"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="Tutup pop-up"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>Sesi Akun Google</span>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </h3>
                <p className="text-emerald-100 text-xs mt-0.5 font-medium">
                  Kelola otentikasi login & sinkronisasi Google Sheets
                </p>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 space-y-5">
            {/* Account Status Card */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5">
              {user ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Google User'}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-full border-2 border-emerald-500 shadow-sm"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-emerald-600 text-white font-black text-lg flex items-center justify-center border-2 border-emerald-400">
                        {(user.displayName || user.email || 'G').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-extrabold text-slate-900 text-base leading-tight">
                        {user.displayName || 'Pengguna Google'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">
                        {user.email}
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        {isTokenActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Sesi Aktif & Terhubung</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                            <span>Sesi Perlu Diperbarui</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:block text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Provider
                    </span>
                    <span className="text-xs font-bold text-slate-700">Google OAuth 2.0</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Belum Terhubung ke Akun Google
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Masuk dengan Google agar dapat menyimpan rekap dan membaca data riwayat spreadsheet secara langsung.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Active Spreadsheet Connected */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  <span>Spreadsheet Google Sheet Aktif:</span>
                </span>
                {activeSpreadsheet?.url && (
                  <a
                    href={activeSpreadsheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
                    title="Buka Spreadsheet di Tab Baru"
                  >
                    <span>Buka Sheet</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="bg-white p-3 rounded-xl border border-indigo-200/80 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {activeSpreadsheet?.name || 'Spreadsheet Rekap Packing & Nota'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                    ID: {activeSpreadsheet?.id || 'Default Spreadsheet'}
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-modal-open-drive-manager"
                  onClick={() => {
                    onClose();
                    onOpenDriveManager();
                  }}
                  className="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 rounded-lg text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5"
                  title="Ganti atau buat spreadsheet baru di Google Drive"
                >
                  <HardDrive className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Ganti Sheet</span>
                </button>
              </div>
            </div>

            {/* Action Buttons Section */}
            <div className="space-y-2.5 pt-1">
              <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Aksi Otentikasi
              </div>

              {/* Primary 1-Click Renew / Sign In Button */}
              <button
                type="button"
                id="btn-modal-action-renew-session"
                onClick={handleRenewClick}
                disabled={isRenewingSession || isProcessing}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2.5 group cursor-pointer"
              >
                {isRenewingSession || isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Memperbarui Sesi Google...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500 text-emerald-100" />
                    <span>
                      {user ? 'Perbarui Sesi Google Sekarang' : 'Masuk dengan Akun Google'}
                    </span>
                  </>
                )}
              </button>

              {/* Secondary Actions (Switch Account & Logout) */}
              {user && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    id="btn-modal-switch-google-account"
                    onClick={handleSwitchAccountClick}
                    disabled={isRenewingSession || isProcessing}
                    className="py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                    title="Pilih akun Google yang berbeda"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-slate-600" />
                    <span>Ganti Akun Google</span>
                  </button>

                  <button
                    type="button"
                    id="btn-modal-signout-google"
                    onClick={handleSignOutClick}
                    disabled={isRenewingSession || isProcessing}
                    className="py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                    title="Keluar dari akun Google di aplikasi ini"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-600" />
                    <span>Keluar Akun (Logout)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Informational Guidance */}
            <div className="p-3.5 bg-slate-100/80 rounded-xl text-slate-600 text-xs space-y-1.5 border border-slate-200/70">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Mengapa perlu memperbarui sesi?</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600">
                Google membatasi masa aktif token akses demi keamanan. Jika proses sinkronisasi sheet mengalami kendala akses (401), cukup klik tombol <strong>"Perbarui Sesi Google Sekarang"</strong> di atas untuk menyambungkan kembali tanpa kehilangan data Anda.
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Rekap Kiriman & Packing Reguler
            </span>
            <button
              type="button"
              id="btn-modal-close-footer"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-300/80 rounded-xl transition-colors"
            >
              Tutup
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
