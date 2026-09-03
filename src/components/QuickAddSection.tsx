import React, { useState } from 'react';
import { Zap, Box, Truck, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { EXPEDITION_KEYS, EXPEDITIONS } from '../data/constants';
import { ExpeditionCode, DeliveryMethod } from '../types';

interface QuickAddSectionProps {
  onAddPackage: (
    expedition: ExpeditionCode,
    amount: number,
    method: DeliveryMethod
  ) => void;
  onSubtractPackage?: (
    expedition: ExpeditionCode,
    amount: number,
    method: DeliveryMethod
  ) => void;
}

export const QuickAddSection: React.FC<QuickAddSectionProps> = ({
  onAddPackage,
}) => {
  const [quantities, setQuantities] = useState<Record<ExpeditionCode, number>>({
    JNE: 1,
    JNT: 1,
    SPX: 1,
    IDX: 1,
  });

  const [methods, setMethods] = useState<Record<ExpeditionCode, DeliveryMethod>>({
    JNE: 'pickup',
    JNT: 'pickup',
    SPX: 'pickup',
    IDX: 'pickup',
  });

  const handleInputChange = (expedition: ExpeditionCode, value: string) => {
    const parsed = parseInt(value, 10);
    setQuantities((prev) => ({
      ...prev,
      [expedition]: isNaN(parsed) || parsed < 1 ? 1 : parsed,
    }));
  };

  const handleMethodToggle = (
    expedition: ExpeditionCode,
    newMethod: DeliveryMethod
  ) => {
    setMethods((prev) => ({
      ...prev,
      [expedition]: newMethod,
    }));
  };

  const handleAdd = (expedition: ExpeditionCode, amountOverride?: number) => {
    const amount = amountOverride ?? quantities[expedition] ?? 1;
    const method = methods[expedition] || 'pickup';
    onAddPackage(expedition, amount, method);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    expedition: ExpeditionCode
  ) => {
    if (e.key === 'Enter') {
      handleAdd(expedition);
    }
  };

  return (
    <section className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center">
          <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 fill-amber-500 mr-2 shrink-0" />
          <span>Input Cepat Paket</span>
        </h2>
        <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
          Opsi Pickup & Drop Off tersedia
        </span>
      </div>

      {/* Grid 2 Columns on Mobile (grid-cols-2), 4 Columns on Large Screen (lg:grid-cols-4) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {EXPEDITION_KEYS.map((key) => {
          const config = EXPEDITIONS[key];
          const qty = quantities[key];
          const currentMethod = methods[key];

          return (
            <div
              key={key}
              id={`quick-box-${key}`}
              className={`${config.bgLight} border ${config.borderLight} rounded-2xl p-3 sm:p-4 flex flex-col justify-between gap-2.5 sm:gap-3 shadow-xs hover:shadow transition-shadow`}
            >
              {/* Card Header: Expedition Name & Icon */}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-1.5 truncate">
                  <span className={`font-bold text-sm sm:text-base ${config.textColor}`}>
                    {config.name}
                  </span>
                  <span className="text-[10px] sm:text-xs text-slate-400 font-medium truncate hidden sm:inline">
                    {key === 'JNT' ? 'Express' : key === 'IDX' ? 'Xpress' : ''}
                  </span>
                </div>
                <Box className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${config.textColor} opacity-60 shrink-0`} />
              </div>

              {/* Opsi Pilihan: Pickup atau Drop Off */}
              <div className="bg-white/80 p-0.5 sm:p-1 rounded-xl border border-slate-200/80 shadow-2xs">
                <div className="grid grid-cols-2 gap-1 text-[11px] sm:text-xs font-semibold">
                  <button
                    type="button"
                    id={`btn-method-pickup-${key}`}
                    onClick={() => handleMethodToggle(key, 'pickup')}
                    className={`py-1 sm:py-1.5 px-1 rounded-lg transition-all flex items-center justify-center gap-1 text-center select-none ${
                      currentMethod === 'pickup'
                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`}
                    title="Pilih mode Penjemputan / Pickup"
                  >
                    <Truck className="w-3 h-3 shrink-0" />
                    <span className="truncate">Pickup</span>
                  </button>

                  <button
                    type="button"
                    id={`btn-method-dropoff-${key}`}
                    onClick={() => handleMethodToggle(key, 'drop off')}
                    className={`py-1 sm:py-1.5 px-1 rounded-lg transition-all flex items-center justify-center gap-1 text-center select-none ${
                      currentMethod === 'drop off'
                        ? 'bg-amber-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`}
                    title="Pilih mode Antar ke Gerai / Drop Off"
                  >
                    <Store className="w-3 h-3 shrink-0" />
                    <span className="truncate">Drop Off</span>
                  </button>
                </div>
              </div>

              {/* Numeric Input & Add Button */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Input Pcs */}
                <div className="relative flex-1 min-w-0">
                  <input
                    type="number"
                    id={`input-${key}`}
                    value={qty}
                    min={1}
                    inputMode="numeric"
                    onChange={(e) => handleInputChange(key, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, key)}
                    className="w-full pl-2.5 pr-7 sm:pl-3 sm:pr-8 py-1.5 sm:py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-black text-slate-800 text-center text-sm sm:text-base shadow-inner"
                    placeholder="1"
                  />
                  <span className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs font-bold text-slate-400 pointer-events-none select-none">
                    Pcs
                  </span>
                </div>

                {/* Add Button */}
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  type="button"
                  id={`btn-add-${key}`}
                  onClick={() => handleAdd(key)}
                  className={`${config.btnBg} ${config.btnHover} text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm shadow-xs transition-colors flex items-center justify-center shrink-0 tracking-wide`}
                  title={`Tambah ${qty} paket ${config.name} (${currentMethod})`}
                >
                  Add
                </motion.button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
