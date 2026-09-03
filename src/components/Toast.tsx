import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ToastItem } from '../types';

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-3">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';
          const isInfo = toast.type === 'info';

          let bgClass = 'bg-emerald-600 text-white shadow-emerald-900/20';
          let Icon = CheckCircle2;

          if (isError) {
            bgClass = 'bg-red-600 text-white shadow-red-900/20';
            Icon = XCircle;
          } else if (isWarning) {
            bgClass = 'bg-amber-500 text-white shadow-amber-900/20';
            Icon = AlertTriangle;
          } else if (isInfo) {
            bgClass = 'bg-indigo-600 text-white shadow-indigo-900/20';
            Icon = Info;
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-xl font-medium text-xs sm:text-sm ${bgClass}`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="w-5 h-5 shrink-0" />
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="p-1 hover:bg-black/10 rounded-lg transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
