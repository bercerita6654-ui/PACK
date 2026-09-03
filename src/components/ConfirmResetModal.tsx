import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmResetModal: React.FC<ConfirmResetModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="confirmModal"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          id="confirmModalContent"
          className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-slate-100"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-snug">
                Reset Data Hari Ini?
              </h3>
              <p className="text-slate-600 text-xs mt-1">
                Tindakan ini akan mengosongkan rekapan lokal.
              </p>
            </div>
          </div>

          <p className="text-slate-600 text-sm mb-6 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
            Yakin ingin mereset/mengosongkan data hari ini? Pastikan Anda sudah{' '}
            <strong className="text-slate-800">Menyimpan Data</strong> terlebih dahulu agar data tidak hilang permanen.
          </p>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm"
            >
              Ya, Reset Data
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
