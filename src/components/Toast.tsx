import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ToastItem } from '../types';

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      id="toast-container"
      className="fixed bottom-5 right-4 sm:right-6 z-50 flex flex-col gap-2.5 pointer-events-none max-w-md w-full px-3"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';
          const isInfo = toast.type === 'info';
          const isSuccess = toast.type === 'success';

          const hasRichDetails =
            toast.title ||
            typeof toast.rowsAdded === 'number' ||
            typeof toast.rowsSkipped === 'number' ||
            toast.sheetTab;

          let cardStyle =
            'bg-slate-900/95 text-white border-slate-700/80 shadow-xl shadow-slate-950/30';
          let iconBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
          let Icon = CheckCircle2;

          if (isError) {
            cardStyle =
              'bg-red-950/95 text-white border-red-500/40 shadow-xl shadow-red-950/30';
            iconBg = 'bg-red-500/20 text-red-400 border-red-500/30';
            Icon = XCircle;
          } else if (isWarning) {
            cardStyle =
              'bg-amber-950/95 text-white border-amber-500/40 shadow-xl shadow-amber-950/30';
            iconBg = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            Icon = AlertTriangle;
          } else if (isInfo) {
            cardStyle =
              'bg-slate-900/95 text-white border-indigo-500/40 shadow-xl shadow-indigo-950/30';
            iconBg = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
            Icon = Info;
          } else if (isSuccess) {
            cardStyle =
              'bg-slate-900/95 text-white border-emerald-500/50 shadow-xl shadow-emerald-950/30';
            iconBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            Icon = CheckCircle2;
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 25, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={`pointer-events-auto rounded-2xl border backdrop-blur-md p-4 transition-all ${cardStyle}`}
            >
              <div className="flex items-start gap-3">
                {/* Status / Feature Icon */}
                <div
                  className={`p-2 rounded-xl border shrink-0 flex items-center justify-center ${iconBg}`}
                >
                  {toast.rowsAdded !== undefined && toast.rowsAdded > 0 ? (
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                  {/* Title & Metadata Pills */}
                  {hasRichDetails ? (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-100">
                          {toast.title || (isSuccess ? 'Sinkronisasi Berhasil' : isError ? 'Gagal Sinkronisasi' : 'Informasi')}
                        </span>

                        {/* Sheet Tab Badge */}
                        {toast.sheetTab && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5 text-emerald-400" />
                            <span>{toast.sheetTab}</span>
                          </span>
                        )}
                      </div>

                      {/* Row Count Highlights */}
                      {(typeof toast.rowsAdded === 'number' || typeof toast.rowsSkipped === 'number') && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {typeof toast.rowsAdded === 'number' && (
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 shadow-2xs ${
                                toast.rowsAdded > 0
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>
                                {toast.rowsAdded > 0
                                  ? `+${toast.rowsAdded} Baris Berhasil Diunggah`
                                  : '0 Baris Baru'}
                              </span>
                            </span>
                          )}

                          {typeof toast.rowsSkipped === 'number' && toast.rowsSkipped > 0 && (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <span>{toast.rowsSkipped} Duplikat Dilewati</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Main Message */}
                  <p className={`text-xs sm:text-[13px] leading-relaxed ${hasRichDetails ? 'text-slate-300' : 'text-slate-100 font-medium'}`}>
                    {toast.message}
                  </p>
                </div>

                {/* Dismiss Button */}
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0 -mr-1 -mt-1 cursor-pointer"
                  title="Tutup notifikasi"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
