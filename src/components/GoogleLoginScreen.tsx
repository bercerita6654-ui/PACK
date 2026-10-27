import React from 'react';
import { motion } from 'motion/react';
import {
  Package,
  FileSpreadsheet,
  ScanBarcode,
  ShieldCheck,
  Clock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

import { CachedGoogleProfile } from '../services/googleAuth';
import { User } from 'firebase/auth';

interface GoogleLoginScreenProps {
  onGoogleSignIn: () => void;
  isLoading: boolean;
  onContinueAsGuest?: () => void;
  user?: User | null;
  cachedProfile?: CachedGoogleProfile | null;
}

export const GoogleLoginScreen: React.FC<GoogleLoginScreenProps> = ({
  onGoogleSignIn,
  isLoading,
  onContinueAsGuest,
  user,
  cachedProfile,
}) => {
  const activeEmail = user?.email || cachedProfile?.email;
  const activeName = user?.displayName || cachedProfile?.displayName;
  const activePhoto = user?.photoURL || cachedProfile?.photoURL;
  const isReturningUser = Boolean(activeEmail);
  return (
    <div
      id="screen-google-login"
      className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col justify-between p-4 sm:p-6 md:p-8 relative overflow-hidden font-sans"
    >
      {/* Background ambient lighting orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Subtle tech grid background overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-40" />

      {/* Top Navbar Brand */}
      <header className="relative z-10 max-w-5xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl shadow-lg shadow-emerald-500/30 text-slate-950 ring-2 ring-emerald-300/40">
            <Package className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              <span>PackTrack</span>
              <span className="text-emerald-400 font-mono text-xs px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 font-bold">
                REGULER
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Logistik & Packing Tracking System</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/80 text-xs text-slate-300 backdrop-blur-md shadow-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Google Workspace Verified</span>
        </div>
      </header>

      {/* Main Login Content Card */}
      <main className="relative z-10 max-w-xl w-full mx-auto my-auto py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
          className="bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-9 border border-slate-700/80 shadow-[0_25px_60px_-15px_rgba(2,6,23,0.9)] ring-1 ring-white/10 relative overflow-hidden"
        >
          {/* Top glowing accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />

          {/* Badge */}
          <div className="flex items-center justify-between gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isReturningUser ? 'Sesi Tersimpan • Siap Masuk' : 'Sistem Terintegrasi Google Sheets'}</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400 font-semibold bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
              Auto-Sync 5 Menit
            </span>
          </div>

          {/* Returning User Profile Banner */}
          {isReturningUser && (
            <div className="mb-6 p-3.5 bg-slate-950/70 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-3 min-w-0">
                {activePhoto ? (
                  <img
                    src={activePhoto}
                    alt={activeName || activeEmail || 'User'}
                    className="w-10 h-10 rounded-full border-2 border-emerald-400 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-600/30 border border-emerald-400/40 text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0">
                    {(activeName || activeEmail || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    <span>{activeName || 'Pengguna Google'}</span>
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-500/40 rounded">
                      Tersimpan
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{activeEmail}</div>
                </div>
              </div>
              <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 shrink-0">
                1-Klik Masuk
              </span>
            </div>
          )}

          {/* Headline */}
          <div className="space-y-2 mb-7 text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              {isReturningUser
                ? 'Perbarui Sesi Google & Masuk ke Dashboard'
                : 'Masuk untuk Memulai Pemantauan & Scanner Paket'}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {isReturningUser
                ? 'Klik tombol di bawah untuk memperbarui sesi Google otomatis dan melanjutkan sinkronisasi data lembar kerja.'
                : 'Hubungkan akun Google Anda untuk mengakses data lembar kerja Packing Reg dan Nota Diproses Admin secara langsung dan realtime.'}
            </p>
          </div>

          {/* Primary Action Button: Masuk dengan Akun Google */}
          <div className="space-y-3.5 mb-7">
            <button
              type="button"
              id="btn-login-google-primary"
              onClick={onGoogleSignIn}
              disabled={isLoading}
              className="w-full py-4 px-6 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-extrabold text-sm sm:text-base border-2 border-slate-200 hover:border-emerald-400 shadow-[0_10px_25px_rgba(255,255,255,0.15)] hover:shadow-[0_12px_30px_rgba(16,185,129,0.3)] flex items-center justify-center gap-3 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-60 disabled:pointer-events-none group"
            >
              {isLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>{isReturningUser ? 'Memperbarui Sesi Google...' : 'Menghubungkan Akun Google...'}</span>
                </>
              ) : (
                <>
                  {/* Official Google G Logo */}
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>
                    {isReturningUser ? `Perbarui Sesi & Masuk Otomatis` : 'Masuk dengan Akun Google'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 group-hover:text-slate-900 transition-all ml-0.5" />
                </>
              )}
            </button>

            {onContinueAsGuest && (
              <button
                type="button"
                id="btn-login-guest-mode"
                onClick={onContinueAsGuest}
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Lihat Tampilan Dashboard (Mode Tamu / Offline)</span>
              </button>
            )}
          </div>

          {/* Key Advantages Grid */}
          <div className="pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">Sinkron Realtime</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Langsung ke Google Sheet</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2.5">
              <ScanBarcode className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">Scanner Barcode</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Verifikasi cepat & tepat</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">Cek Keterlambatan</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Peringatan paket tertunda</p>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-5xl w-full mx-auto text-center py-3 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Sistem Operasional Gudang & Ekspedisi Reguler</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Dilindungi enkripsi Google OAuth 2.0 Client • PackTrack System
        </div>
      </footer>
    </div>
  );
};
