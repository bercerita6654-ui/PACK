import React, { useState } from 'react';
import {
  Clock,
  RotateCcw,
  CloudUpload,
  Server,
  X,
  Plus,
  Minus,
  Inbox,
  Filter,
  Loader2,
  Truck,
  Store,
} from 'lucide-react';
import { EXPEDITION_KEYS, EXPEDITIONS } from '../data/constants';
import { ExpeditionCode, PackageLog } from '../types';

interface LogTableProps {
  logs: PackageLog[];
  isSyncing: boolean;
  onRemoveLog: (id: string) => void;
  onPromptReset: () => void;
  onSyncGoogleSheet: () => void;
  onOpenHistory: () => void;
}

export const LogTable: React.FC<LogTableProps> = ({
  logs,
  isSyncing,
  onRemoveLog,
  onPromptReset,
  onSyncGoogleSheet,
  onOpenHistory,
}) => {
  const [filterExpedition, setFilterExpedition] = useState<string>('ALL');

  const filteredLogs = logs.filter((log) => {
    if (filterExpedition === 'ALL') return true;
    return log.expedition === filterExpedition;
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
      {/* Header bar with actions */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap gap-3 justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 shadow-2xs">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Riwayat Input</h3>
            <span className="text-xs text-slate-500">
              {logs.length} catatan hari ini
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-prompt-reset"
            onClick={onPromptReset}
            className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-2xs flex items-center gap-1.5"
            title="Kosongkan data hari ini"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Harian</span>
          </button>

          <button
            id="btn-sync"
            disabled={isSyncing}
            onClick={onSyncGoogleSheet}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 disabled:cursor-not-allowed text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
            title="Kirim total data paket hari ini ke Google Sheet"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <CloudUpload className="w-3.5 h-3.5" />
                <span>Simpan Data</span>
              </>
            )}
          </button>

          <button
            id="btn-open-server"
            onClick={onOpenHistory}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
            title="Lihat riwayat data tersimpan di Google Sheet"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Lihat Data Tersimpan</span>
          </button>
        </div>
      </div>

      {/* Filter tab bar */}
      {logs.length > 0 && (
        <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-500 font-medium shrink-0">Filter:</span>
          <button
            onClick={() => setFilterExpedition('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              filterExpedition === 'ALL'
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Semua ({logs.length})
          </button>
          {EXPEDITION_KEYS.map((key) => {
            const count = logs.filter((l) => l.expedition === key).length;
            if (count === 0) return null;
            const exp = EXPEDITIONS[key];
            const isSelected = filterExpedition === key;

            return (
              <button
                key={key}
                onClick={() => setFilterExpedition(key)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                  isSelected
                    ? 'text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                style={
                  isSelected
                    ? { backgroundColor: exp.colorHex }
                    : { color: exp.colorHex }
                }
              >
                <span>{exp.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Table & Body */}
      <div className="overflow-y-auto flex-1 max-h-[380px]">
        {filteredLogs.length === 0 ? (
          <div
            id="emptyLogState"
            className="flex flex-col items-center justify-center p-12 text-slate-400 text-center"
          >
            <div className="p-3 bg-slate-50 rounded-full mb-3 text-slate-300">
              <Inbox className="w-10 h-10" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {logs.length === 0
                ? 'Belum ada paket yang diinput hari ini.'
                : 'Tidak ada catatan untuk filter ini.'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {logs.length === 0
                ? 'Gunakan form Input Cepat di atas untuk mencatat pengiriman.'
                : 'Pilih filter ekspedisi lain untuk melihat log.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/90 backdrop-blur-xs sticky top-0 shadow-2xs z-10">
              <tr>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Waktu
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Ekspedisi
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Metode
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  Jumlah
                </th>
                <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 text-center">
                  Batal
                </th>
              </tr>
            </thead>
            <tbody id="logTableBody" className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const expInfo = EXPEDITIONS[log.expedition];
                const method = log.method || 'pickup';
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="p-3 text-sm text-slate-500 font-medium">
                      {log.timestamp}
                    </td>
                    <td className="p-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold"
                        style={{
                          backgroundColor: `${expInfo.colorHex}15`,
                          color: expInfo.colorHex,
                          border: `1px solid ${expInfo.colorHex}30`,
                        }}
                      >
                        {expInfo.name}
                      </span>
                    </td>
                    <td className="p-3">
                      {method === 'drop off' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Store className="w-3 h-3 text-amber-600" />
                          <span>Drop Off</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Truck className="w-3 h-3 text-indigo-600" />
                          <span>Pickup</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-sm font-bold">
                      {log.amount < 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-600">
                          <Minus className="w-3 h-3 stroke-[3]" />
                          {Math.abs(log.amount)} Pcs
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Plus className="w-3 h-3 stroke-[3]" />
                          {log.amount} Pcs
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onRemoveLog(log.id)}
                        className="text-slate-400 hover:text-red-600 bg-slate-100 hover:bg-red-50 p-1.5 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="Batalkan / Hapus catatan ini"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
