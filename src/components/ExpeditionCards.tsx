import React from 'react';
import { Truck } from 'lucide-react';
import { EXPEDITION_KEYS, EXPEDITIONS } from '../data/constants';
import { AppState } from '../types';

interface ExpeditionCardsProps {
  counts: AppState['counts'];
}

export const ExpeditionCards: React.FC<ExpeditionCardsProps> = ({ counts }) => {
  const total = EXPEDITION_KEYS.reduce((sum, k) => sum + (counts[k] || 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {EXPEDITION_KEYS.map((key) => {
        const config = EXPEDITIONS[key];
        const count = counts[key] || 0;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <div
            key={key}
            id={`card-${key}`}
            className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-b-4 ${config.borderColor} flex flex-col justify-between relative overflow-hidden group transition-transform duration-200 hover:-translate-y-0.5`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`font-bold text-base ${config.textColor}`}>
                  {config.name}
                </span>
                {total > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {percentage}%
                  </span>
                )}
              </div>
              <div
                id={`count-${key}`}
                className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight"
              >
                {count.toLocaleString('id-ID')}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Paket tersortir</span>
              <span className="font-medium text-slate-500">{config.fullName}</span>
            </div>

            {/* Background decorative truck icon matching original design */}
            <div
              className={`absolute -right-3 -bottom-3 opacity-5 group-hover:opacity-15 transition-opacity pointer-events-none ${config.textColor}`}
            >
              <Truck className="w-20 h-20" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
