import React from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  ArrowUpRight,
  Database,
  Filter,
  Cloud,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SyncProgressInfo } from '../types';

interface SyncProgressModalProps {
  progress: SyncProgressInfo | null;
  onClose?: () => void;
  spreadsheetUrl?: string;
}

export const SyncProgressModal: React.FC<SyncProgressModalProps> = ({
  progress,
  onClose,
  spreadsheetUrl,
}) => {
  if (!progress || !progress.isActive) return null;

  const isComplete = progress.status === 'success' || progress.percent >= 100;
  const isError = progress.status === 'error';

  const stages = [
    { id: 1, label: 'Koneksi Sheet', icon: Cloud },
    { id: 2, label: 'Baca Data', icon: Database },
    { id: 3, label: 'Filter Duplikat', icon: Filter },
    { id: 4, label: 'Unggah Batch', icon: Layers },
    { id: 5, label: 'Finalisasi', icon: CheckCircle2 },
  ];

  return (
    <AnimatePresence>
      <div
        id="sync-progress-modal-backdrop"
        className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col space-y-5 overflow-hidden relative"
        >
          {/* Subtle decorative background gradient */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Header */}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-xs transition-colors ${
                  isError
                    ? 'bg-rose-50 text-rose-600 border border-rose-200'
                    : isComplete
                    ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {isError ? (
                  <AlertCircle className="w-6 h-6" />
                ) : isComplete ? (
                  <CheckCircle2 className="w-6 h-6 animate-bounce" />
                ) : (
                  <FileSpreadsheet className="w-6 h-6 animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  {progress.title || 'Sinkronisasi Google Sheets'}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {progress.sheetTab ? (
                    <span>
                      Tab: <strong className="text-emerald-700 font-bold">{progress.sheetTab}</strong>
                    </span>
                  ) : (
                    'Mengunggah data ke Google Drive & Sheets'
                  )}
                </p>
              </div>
            </div>

            {/* Percentage Badge */}
            <div
              className={`px-3 py-1.5 rounded-xl font-black text-sm tabular-nums flex items-center gap-1.5 shadow-2xs border ${
                isError
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : isComplete
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-slate-100 text-slate-800 border-slate-200'
              }`}
            >
              {!isComplete && !isError && (
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
              <span>{Math.min(100, Math.max(0, Math.round(progress.percent)))}%</span>
            </div>
          </div>

          {/* Stepper Indicator */}
          <div className="relative z-10 pt-1">
            <div className="grid grid-cols-5 gap-1 text-center">
              {stages.map((st) => {
                const isPassed = progress.stageIndex > st.id || isComplete;
                const isCurrent = progress.stageIndex === st.id && !isComplete && !isError;
                const Icon = st.icon;

                return (
                  <div key={st.id} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${
                        isPassed
                          ? 'bg-emerald-500 text-white font-bold shadow-2xs'
                          : isCurrent
                          ? 'bg-emerald-100 text-emerald-800 font-black ring-2 ring-emerald-500 ring-offset-1'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isPassed ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] leading-tight font-semibold truncate max-w-full px-0.5 ${
                        isCurrent
                          ? 'text-emerald-900 font-bold'
                          : isPassed
                          ? 'text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Progress Bar Card */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3 relative z-10 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 truncate">
                {!isComplete && !isError && (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span className="truncate">{progress.currentStage || 'Memproses data...'}</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-500 shrink-0 ml-2">
                Tahap {Math.min(5, Math.max(1, progress.stageIndex))} / 5
              </span>
            </div>

            {/* Visual Animated Progress Bar */}
            <div className="relative w-full h-3.5 bg-slate-200/90 rounded-full overflow-hidden p-0.5 border border-slate-300/60 shadow-inner">
              <motion.div
                className={`h-full rounded-full transition-all duration-300 relative ${
                  isError
                    ? 'bg-rose-500'
                    : isComplete
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400'
                }`}
                initial={{ width: '0%' }}
                animate={{ width: `${Math.min(100, Math.max(5, progress.percent))}%` }}
                transition={{ ease: 'easeOut', duration: 0.3 }}
              >
                {!isComplete && !isError && (
                  <div className="absolute inset-0 bg-white/20 animate-[pulse_1.5s_infinite]" />
                )}
              </motion.div>
            </div>

            {/* Sub Detail / Batch message */}
            <div className="text-[11px] text-slate-600 font-medium flex items-center justify-between">
              <span className="truncate">
                {progress.detailMessage || 'Menyiapkan baris data untuk Google Sheets...'}
              </span>
              {progress.totalBatches && progress.totalBatches > 1 ? (
                <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0 ml-2">
                  Batch {progress.currentBatch || 1}/{progress.totalBatches}
                </span>
              ) : null}
            </div>
          </div>

          {/* Metrics Overview Grid */}
          <div className="grid grid-cols-3 gap-2 relative z-10">
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Total Data
              </span>
              <span className="text-sm font-black text-slate-800 tabular-nums">
                {progress.totalItems} <span className="text-[10px] font-normal text-slate-500">item</span>
              </span>
            </div>

            <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200/80 text-center">
              <span className="text-[10px] uppercase font-bold text-emerald-600 block tracking-wider">
                Data Baru
              </span>
              <span className="text-sm font-black text-emerald-800 tabular-nums">
                {progress.newItemsAdded} <span className="text-[10px] font-normal text-emerald-600">baris</span>
              </span>
            </div>

            <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/80 text-center">
              <span className="text-[10px] uppercase font-bold text-amber-700 block tracking-wider">
                Duplikat
              </span>
              <span className="text-sm font-black text-amber-900 tabular-nums">
                {progress.duplicateItemsSkipped} <span className="text-[10px] font-normal text-amber-700">dilewati</span>
              </span>
            </div>
          </div>

          {/* Error Notice */}
          {isError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 relative z-10">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Gagal Menyimpan ke Google Sheets</p>
                <p className="mt-0.5 text-rose-700">{progress.errorMessage || 'Terjadi kesalahan pada koneksi jaringan atau token akses Google.'}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-1 relative z-10">
            {spreadsheetUrl ? (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 hover:underline"
              >
                Lihat Spreadsheet <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            ) : (
              <div />
            )}

            {(isComplete || isError) && onClose && (
              <button
                type="button"
                id="btn-close-sync-progress"
                onClick={onClose}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs ${
                  isComplete
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                {isComplete ? 'Selesai & Tutup' : 'Tutup'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
