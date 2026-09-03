import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Check,
  X,
  FolderOpen,
  LogOut,
  AlertCircle,
  Loader2,
  HardDrive,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import {
  listSpreadsheets,
  createRekapSpreadsheet,
  DriveSpreadsheetItem,
} from '../services/googleWorkspace';
import { ActiveSpreadsheet } from '../types';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  activeSpreadsheet: ActiveSpreadsheet | null;
  onSelectSpreadsheet: (sheet: ActiveSpreadsheet) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  user,
  accessToken,
  onSignIn,
  onSignOut,
  activeSpreadsheet,
  onSelectSpreadsheet,
  showToast,
}) => {
  const [spreadsheets, setSpreadsheets] = useState<DriveSpreadsheetItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customSheetInput, setCustomSheetInput] = useState<string>('');

  // Load spreadsheets from Drive when modal opens and token is available
  useEffect(() => {
    if (isOpen && accessToken) {
      handleLoadDriveFiles();
    }
  }, [isOpen, accessToken]);

  const handleLoadDriveFiles = async () => {
    if (!accessToken) return;
    setIsLoadingList(true);
    try {
      const files = await listSpreadsheets(accessToken);
      setSpreadsheets(files);
    } catch (err: any) {
      console.error('Error fetching drive spreadsheets:', err);
      showToast(err.message || 'Gagal mengambil daftar spreadsheet dari Google Drive', 'error');
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleCreateNewSpreadsheet = async () => {
    if (!accessToken) {
      showToast('Silakan login dengan Google terlebih dahulu.', 'warning');
      return;
    }
    setIsCreatingNew(true);
    try {
      const result = await createRekapSpreadsheet(
        accessToken,
        `Rekap Kiriman & Packing Paket - ${new Date().toLocaleDateString('id-ID', {
          month: 'short',
          year: 'numeric',
        })}`
      );
      const newSheet: ActiveSpreadsheet = {
        id: result.id,
        name: `Rekap Kiriman & Packing Paket`,
        url: result.url,
      };
      onSelectSpreadsheet(newSheet);
      showToast('Spreadsheet baru berhasil dibuat di Google Drive Anda!', 'success');
      handleLoadDriveFiles();
    } catch (err: any) {
      console.error('Error creating spreadsheet:', err);
      showToast(err.message || 'Gagal membuat spreadsheet baru di Google Drive', 'error');
    } finally {
      setIsCreatingNew(false);
    }
  };

  const handleApplyCustomInput = () => {
    const raw = customSheetInput.trim();
    if (!raw) return;

    let sheetId = raw;
    // Extract ID from URL if full URL is pasted
    const match = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      sheetId = match[1];
    }

    const selected: ActiveSpreadsheet = {
      id: sheetId,
      name: `Spreadsheet (${sheetId.substring(0, 8)}...)`,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    };

    onSelectSpreadsheet(selected);
    setCustomSheetInput('');
    showToast('Spreadsheet berhasil dipilih.', 'success');
  };

  if (!isOpen) return null;

  const filteredSheets = spreadsheets.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AnimatePresence>
      <div
        id="googleDriveModal"
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl p-5 sm:p-6 max-w-xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Google Drive & Sheets
                </h3>
                <p className="text-xs text-slate-500">
                  Hubungkan akun Google untuk simpan rekap kiriman & paket packing langsung ke Google Spreadsheet
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* User Profile / Login status */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              {user ? (
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google User'}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full border border-slate-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
                      {(user.displayName || user.email || 'G').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-sm">
                        {user.displayName || 'Pengguna Google'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        Terhubung
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">{user.email}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    Belum Terhubung ke Akun Google
                  </div>
                  <p className="text-xs text-slate-500">
                    Masuk dengan Google untuk membaca & menulis spreadsheet di Google Drive Anda.
                  </p>
                </div>
              )}

              {user ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-semibold transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar Akun</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs transition-all shadow-xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>

            {/* Active Connected Spreadsheet Card */}
            <div className="p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Spreadsheet Aktif Saat Ini
                </span>
                {activeSpreadsheet?.url && (
                  <a
                    href={activeSpreadsheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 underline"
                  >
                    Buka di Google Sheets <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {activeSpreadsheet ? (
                <div className="bg-white p-3 rounded-lg border border-emerald-200 flex items-center justify-between">
                  <div className="truncate mr-2">
                    <div className="font-bold text-slate-800 text-sm truncate">
                      {activeSpreadsheet.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      ID: {activeSpreadsheet.id}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold shrink-0 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Terpilih
                  </span>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic bg-white p-3 rounded-lg border border-slate-200">
                  Belum ada spreadsheet terpilih. Buat baru atau pilih dari Google Drive di bawah.
                </div>
              )}
            </div>

            {/* Action Bar: Create New Sheet */}
            {user && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateNewSpreadsheet}
                  disabled={isCreatingNew}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
                >
                  {isCreatingNew ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Membuat Spreadsheet di Drive...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Buat Spreadsheet Rekap & Packing di Google Drive</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* List files from Google Drive */}
            {user && (
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-slate-600" />
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Daftar Spreadsheet di Google Drive Anda
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLoadDriveFiles}
                    disabled={isLoadingList}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
                    <span>Muat Ulang</span>
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama spreadsheet di Drive..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* List Container */}
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                  {isLoadingList ? (
                    <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>Mencari spreadsheet di Google Drive...</span>
                    </div>
                  ) : filteredSheets.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400">
                      {searchQuery
                        ? 'Tidak ada spreadsheet yang cocok dengan pencarian.'
                        : 'Tidak ada spreadsheet ditemukan di Google Drive.'}
                    </div>
                  ) : (
                    filteredSheets.map((sheet) => {
                      const isSelected = activeSpreadsheet?.id === sheet.id;
                      return (
                        <div
                          key={sheet.id}
                          className={`pt-1.5 flex items-center justify-between p-2 rounded-lg transition-colors text-xs ${
                            isSelected
                              ? 'bg-emerald-50 border border-emerald-200'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <span className="font-semibold text-slate-800 block truncate">
                              {sheet.name}
                            </span>
                            {sheet.modifiedTime && (
                              <span className="text-[10px] text-slate-400">
                                Diubah:{' '}
                                {new Date(sheet.modifiedTime).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {sheet.webViewLink && (
                              <a
                                href={sheet.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-slate-400 hover:text-slate-600"
                                title="Buka di tab baru"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                onSelectSpreadsheet({
                                  id: sheet.id,
                                  name: sheet.name,
                                  url:
                                    sheet.webViewLink ||
                                    `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`,
                                })
                              }
                              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700'
                              }`}
                            >
                              {isSelected ? 'Aktif' : 'Pilih'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Manual ID / URL Input Option */}
            <div className="border-t border-slate-100 pt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Atau masukkan Spreadsheet ID / Link Google Sheet secara manual:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSheetInput}
                  onChange={(e) => setCustomSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/... atau Spreadsheet ID"
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomInput}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              Tutup
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
