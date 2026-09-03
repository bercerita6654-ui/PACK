import React, { useState } from 'react';
import { Settings, X, RotateCcw, Check, ExternalLink, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DEFAULT_GOOGLE_SHEET_WEB_APP_URL,
  DEFAULT_GOOGLE_SHEET_CSV_URL,
} from '../data/constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  webAppUrl: string;
  csvUrl: string;
  onSaveUrls: (webAppUrl: string, csvUrl: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  webAppUrl,
  csvUrl,
  onSaveUrls,
}) => {
  const [currentWebAppUrl, setCurrentWebAppUrl] = useState<string>(webAppUrl);
  const [currentCsvUrl, setCurrentCsvUrl] = useState<string>(csvUrl);
  const [showScriptHelper, setShowScriptHelper] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveUrls(currentWebAppUrl.trim(), currentCsvUrl.trim());
    onClose();
  };

  const handleResetDefaults = () => {
    setCurrentWebAppUrl(DEFAULT_GOOGLE_SHEET_WEB_APP_URL);
    setCurrentCsvUrl(DEFAULT_GOOGLE_SHEET_CSV_URL);
  };

  return (
    <AnimatePresence>
      <div
        id="settingsModal"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Pengaturan Google Sheets
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 text-xs sm:text-sm">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Google Sheet Web App URL (POST)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                URL deployment Google Apps Script untuk menyimpan rekapan paket harian.
              </p>
              <input
                type="text"
                value={currentWebAppUrl}
                onChange={(e) => setCurrentWebAppUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Google Sheet Published CSV URL (GET)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Link CSV dari menu Publikasikan ke Web (Publish to Web) Google Spreadsheet.
              </p>
              <input
                type="text"
                value={currentCsvUrl}
                onChange={(e) => setCurrentCsvUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* Helper Accordion */}
            <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-3">
              <button
                type="button"
                onClick={() => setShowScriptHelper(!showScriptHelper)}
                className="flex items-center justify-between w-full text-left font-semibold text-indigo-700 text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Format Data yang Dikirim (Apps Script Payload)
                </span>
                <span>{showScriptHelper ? '▲ Sembunyikan' : '▼ Lihat Contoh'}</span>
              </button>

              {showScriptHelper && (
                <div className="mt-2.5 pt-2 border-t border-indigo-100 text-[11px] text-slate-600 space-y-2">
                  <p>
                    Saat menekan <strong>Simpan ke Sheet</strong>, sistem mengirim JSON POST:
                  </p>
                  <pre className="p-2 bg-slate-900 text-emerald-400 rounded-lg overflow-x-auto font-mono text-[10px]">
{`{
  "date": "Rabu, 2 September 2026",
  "JNE": 15,
  "JNT": 24,
  "SPX": 10,
  "IDX": 8,
  "total": 57
}`}
                  </pre>
                  <p>
                    Pastikan Apps Script di-deploy dengan hak akses <em>Who has access: Anyone (Siapa saja)</em>.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-2 justify-between items-center">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Kembalikan ke Default</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
