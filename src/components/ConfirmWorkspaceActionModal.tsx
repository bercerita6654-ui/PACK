import React from 'react';
import { AlertCircle, Check, X, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmWorkspaceActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  spreadsheetName: string;
  spreadsheetUrl?: string;
  details?: { label: string; value: string | number }[];
  isSubmitting?: boolean;
}

export const ConfirmWorkspaceActionModal: React.FC<ConfirmWorkspaceActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  spreadsheetName,
  spreadsheetUrl,
  details = [],
  isSubmitting = false,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="confirmWorkspaceActionModal"
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col space-y-4"
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0 mt-0.5">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 leading-snug">
                {title}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {description}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Spreadsheet Target Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Target Spreadsheet
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 truncate">
                {spreadsheetName}
              </span>
              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold shrink-0 ml-2"
                >
                  Buka Sheet <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Details preview */}
          {details.length > 0 && (
            <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3 space-y-1.5 text-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Rincian Data yang Akan Ditambahkan:
              </div>
              <div className="grid grid-cols-2 gap-2">
                {details.map((item, idx) => (
                  <div key={idx} className="bg-white p-2 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 block">{item.label}</span>
                    <span className="font-bold text-slate-800 text-xs">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notice */}
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-800 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              Data akan ditambahkan sebagai baris baru di spreadsheet Google Anda.
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Ya, Simpan ke Google Sheet</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
