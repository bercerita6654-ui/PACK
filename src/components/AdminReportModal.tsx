import React, { useState, useEffect, useMemo } from 'react';
import { X, Copy, Check, UserCheck, User, FileText, AlertCircle, MessageSquare } from 'lucide-react';
import { generatePackingReportText, GeneratePackingReportParams } from '../utils/notaDelay';

export const DEFAULT_ADMIN_OPTIONS = ['Bobby', 'Winda', 'Putri', 'Mishel'] as const;
export type DefaultAdminOption = (typeof DEFAULT_ADMIN_OPTIONS)[number];

export interface AdminReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportParams: Omit<GeneratePackingReportParams, 'adminName'>;
  onSuccessCopy?: (adminName: string) => void;
}

export const AdminReportModal: React.FC<AdminReportModalProps> = ({
  isOpen,
  onClose,
  reportParams,
  onSuccessCopy,
}) => {
  const [selectedAdmin, setSelectedAdmin] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('packing_report_admin_name') || '';
    }
    return '';
  });
  const [customName, setCustomName] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync initial admin from localStorage when modal opens
  useEffect(() => {
    if (isOpen) {
      const saved = (localStorage.getItem('packing_report_admin_name') || '').trim();
      if (DEFAULT_ADMIN_OPTIONS.includes(saved as any)) {
        setSelectedAdmin(saved);
        setIsCustom(false);
      } else if (saved) {
        setSelectedAdmin('custom');
        setIsCustom(true);
        setCustomName(saved);
      } else {
        setSelectedAdmin('');
        setIsCustom(false);
      }
      setCopied(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  const activeAdminName = useMemo(() => {
    if (isCustom) return customName.trim();
    return selectedAdmin.trim();
  }, [isCustom, customName, selectedAdmin]);

  const previewReportText = useMemo(() => {
    return generatePackingReportText({
      ...reportParams,
      adminName: activeAdminName,
      notes: additionalNotes.trim(),
    });
  }, [reportParams, activeAdminName, additionalNotes]);

  if (!isOpen) return null;

  const handleSelectAdmin = (admin: string) => {
    setSelectedAdmin(admin);
    setIsCustom(false);
    setErrorMessage(null);
  };

  const handleCopyAction = async (adminToUse?: string) => {
    const admin = (adminToUse !== undefined ? adminToUse : activeAdminName).trim();
    if (!admin) {
      setErrorMessage('Syarat wajib: Harus memilih atau mengisi nama admin terlebih dahulu!');
      return;
    }

    const finalText = generatePackingReportText({
      ...reportParams,
      adminName: admin,
      notes: additionalNotes.trim(),
    });

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(finalText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = finalText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('packing_report_admin_name', admin);
      }

      setCopied(true);
      if (onSuccessCopy) {
        onSuccessCopy(admin);
      }
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 700);
    } catch {
      setErrorMessage('Gagal menyalin teks ke clipboard.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 relative">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Pilih Admin Laporan
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Wajib
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Pilih nama admin yang bertugas menangani laporan hari ini.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Admin selection grid */}
          <div>
            <label className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
              <span>Nama Pilihan Admin:</span>
              <span className="text-[11px] text-emerald-400 font-semibold">Klik untuk memilih</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {DEFAULT_ADMIN_OPTIONS.map((name) => {
                const isSelected = !isCustom && selectedAdmin === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectAdmin(name)}
                    className={`relative p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between group ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-400/40'
                        : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : 'bg-slate-700/80 text-emerald-300 group-hover:bg-slate-700'
                        }`}
                      >
                        {name[0]}
                      </div>
                      <div>
                        <div className="font-black text-sm text-white">{name}</div>
                        <div className="text-[10px] text-slate-400">Admin Bertugas</div>
                      </div>
                    </div>
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 shrink-0">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-slate-600 group-hover:border-slate-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Opsi Custom Admin Lainnya */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setIsCustom(true);
                setSelectedAdmin('custom');
                setErrorMessage(null);
              }}
              className={`text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                isCustom ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Atau isi nama admin lain jika ada perubahan</span>
            </button>
            {isCustom && (
              <div className="mt-2 flex items-center bg-slate-800 border border-emerald-500/80 rounded-xl px-3 py-2 animate-in fade-in duration-150">
                <span className="text-xs font-bold text-slate-400 mr-2 whitespace-nowrap">Nama Admin:</span>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => {
                    setCustomName(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Ketik nama admin..."
                  className="bg-transparent text-sm text-white focus:outline-none w-full font-medium"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Catatan Tambahan (Opsional) */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="input-report-additional-notes"
                className="text-xs font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Catatan Tambahan (Opsional):</span>
              </label>
              {additionalNotes && (
                <button
                  type="button"
                  onClick={() => setAdditionalNotes('')}
                  className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Hapus Catatan
                </button>
              )}
            </div>
            <textarea
              id="input-report-additional-notes"
              rows={2}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Contoh: 2 nota pending menunggu konfirmasi barang, sisa lanjut shift 2..."
              className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 resize-none transition-all outline-none font-sans"
            />
            {/* Template Catatan Cepat */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[10px] text-slate-500 font-medium">Contoh cepat:</span>
              {[
                'Menunggu pickup kurir',
                'Barang habis / restock',
                'Lanjut packing shift 2',
              ].map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => {
                    setAdditionalNotes((prev) => {
                      if (!prev.trim()) return template;
                      if (prev.includes(template)) return prev;
                      return `${prev.trim()}\n- ${template}`;
                    });
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/70 transition-colors cursor-pointer"
                >
                  + {template}
                </button>
              ))}
            </div>
          </div>

          {/* Error notice if trying to copy without admin */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-in shake duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Live Preview of formatted report */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pratinjau Hasil Laporan:</span>
              </span>
              {activeAdminName ? (
                <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  admin - {activeAdminName}
                </span>
              ) : (
                <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                  Wajib Pilih Admin
                </span>
              )}
            </div>
            <pre className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto select-all">
              {previewReportText}
            </pre>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!activeAdminName}
            onClick={() => handleCopyAction()}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
              copied
                ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                : activeAdminName
                ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Berhasil Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>
                  {activeAdminName
                    ? `Salin Report (admin - ${activeAdminName})`
                    : 'Pilih Admin Terlebih Dahulu'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
