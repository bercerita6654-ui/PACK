import React, { useState } from 'react';
import { PieChart as PieIcon, Box } from 'lucide-react';
import { EXPEDITION_KEYS, EXPEDITIONS } from '../data/constants';
import { AppState, ExpeditionCode } from '../types';

interface ExpeditionChartProps {
  counts: AppState['counts'];
}

export const ExpeditionChart: React.FC<ExpeditionChartProps> = ({ counts }) => {
  const [hoveredKey, setHoveredKey] = useState<ExpeditionCode | null>(null);

  const total = EXPEDITION_KEYS.reduce((acc, k) => acc + (counts[k] || 0), 0);

  // Calculate SVG Donut segments
  // Radius: 70, Circumference: 2 * PI * 70 = ~439.82
  const radius = 70;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;
  const segments = EXPEDITION_KEYS.map((key) => {
    const value = counts[key] || 0;
    const percent = total > 0 ? value / total : 0;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -cumulativePercent * circumference;
    cumulativePercent += percent;

    return {
      key,
      value,
      percent,
      strokeDasharray,
      strokeDashoffset,
      color: EXPEDITIONS[key].colorHex,
      name: EXPEDITIONS[key].name,
    };
  });

  return (
    <div
      id="chart-container"
      className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800 flex items-center text-base">
          <PieIcon className="w-4 h-4 mr-2 text-slate-400" />
          <span>Persentase Ekspedisi</span>
        </h3>
        <span className="text-xs text-slate-400">Hari ini</span>
      </div>

      <div className="relative flex-1 flex items-center justify-center min-h-[220px]">
        {total === 0 ? (
          <div
            id="emptyChartState"
            className="flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="w-28 h-28 rounded-full border-8 border-slate-100 flex items-center justify-center mb-3">
              <Box className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-400">
              Data belum tersedia
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Input paket untuk melihat proporsi
            </p>
          </div>
        ) : (
          <div className="relative flex items-center justify-center w-full max-w-[240px]">
            <svg
              className="w-full h-full transform -rotate-90"
              viewBox="0 0 200 200"
            >
              {/* Background ring */}
              <circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="24"
              />

              {/* Segments */}
              {segments.map((seg) => {
                if (seg.percent <= 0) return null;
                const isHovered = hoveredKey === seg.key;

                return (
                  <circle
                    key={seg.key}
                    cx="100"
                    cy="100"
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={isHovered ? 28 : 24}
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredKey(seg.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  />
                );
              })}
            </svg>

            {/* Donut Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {hoveredKey ? (
                <>
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: EXPEDITIONS[hoveredKey].colorHex }}
                  >
                    {EXPEDITIONS[hoveredKey].name}
                  </span>
                  <span className="text-2xl font-black text-slate-800">
                    {counts[hoveredKey]}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {Math.round(((counts[hoveredKey] || 0) / total) * 100)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-slate-400 uppercase">
                    Total
                  </span>
                  <span className="text-2xl font-black text-slate-800">
                    {total}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    Paket
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend & Breakdown */}
      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
        {EXPEDITION_KEYS.map((key) => {
          const config = EXPEDITIONS[key];
          const val = counts[key] || 0;
          const pct = total > 0 ? Math.round((val / total) * 100) : 0;
          const isHovered = hoveredKey === key;

          return (
            <div
              key={key}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
              className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                isHovered ? 'bg-slate-100/90 ring-1 ring-slate-300' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: config.colorHex }}
                />
                <span className="font-semibold text-slate-700 truncate">
                  {config.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 pl-1">
                <span className="font-bold text-slate-800">{val}</span>
                <span className="text-slate-400 font-medium">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
