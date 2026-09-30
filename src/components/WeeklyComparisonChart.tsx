import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Calendar,
  CalendarDays,
  Award,
  Zap,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { EXPEDITION_KEYS, EXPEDITIONS } from '../data/constants';
import { ExpeditionCode, PackageLog, PackedOrder } from '../types';

interface WeeklyComparisonChartProps {
  logs: PackageLog[];
  todayCounts: Record<ExpeditionCode, number>;
  currentDate?: string;
  packedOrders?: PackedOrder[];
  showToast?: (msg: string, type?: 'success' | 'warning' | 'info' | 'error') => void;
}

type ChartMode = 'stacked' | 'total';
type FilterExpedition = 'ALL' | ExpeditionCode;

export const WeeklyComparisonChart: React.FC<WeeklyComparisonChartProps> = ({
  logs,
  todayCounts,
  currentDate,
  packedOrders = [],
  showToast,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('stacked');
  const [activeExpFilter, setActiveExpFilter] = useState<FilterExpedition>('ALL');
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [viewStyle, setViewStyle] = useState<'chart' | 'table'>('chart');

  // Compute 7 days from (today - 6 days) up to today
  const daysData = useMemo(() => {
    const result = [];
    const now = new Date();

    const dayNamesShort = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const dayNamesFull = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthNamesFull = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;

      const dayNameShort = dayNamesShort[d.getDay()];
      const dayNameFull = dayNamesFull[d.getDay()];
      const dateFormattedShort = `${d.getDate()} ${monthNamesShort[d.getMonth()]}`;
      const dateFormattedFull = `${dayNameFull}, ${d.getDate()} ${monthNamesFull[d.getMonth()]} ${d.getFullYear()}`;
      const isToday = i === 0;
      const isYesterday = i === 1;

      // Filter logs matching this day
      const dayLogs = logs.filter((log) => {
        if (!log.date) return false;
        if (log.date === isoDate || log.date.startsWith(isoDate)) return true;
        if (log.dateFormatted && (log.dateFormatted.includes(`${d.getDate()} ${monthNamesShort[d.getMonth()]}`) || log.dateFormatted.includes(`${d.getDate()} ${monthNamesFull[d.getMonth()]}`))) {
          return true;
        }
        return false;
      });

      const expCounts: Record<ExpeditionCode, number> = {
        JNE: 0,
        JNT: 0,
        SPX: 0,
        IDX: 0,
      };

      let totalAmount = 0;
      let pickupAmount = 0;
      let dropoffAmount = 0;

      dayLogs.forEach((l) => {
        const amt = Number(l.amount) || 0;
        totalAmount += amt;
        if (l.expedition && expCounts[l.expedition] !== undefined) {
          expCounts[l.expedition] += amt;
        }
        if (l.method === 'drop off') {
          dropoffAmount += amt;
        } else {
          pickupAmount += amt;
        }
      });

      // Synchronize today's count with todayCounts if today's logs are empty or less
      if (isToday) {
        const todaySum = (todayCounts.JNE || 0) + (todayCounts.JNT || 0) + (todayCounts.SPX || 0) + (todayCounts.IDX || 0);
        if (todaySum > totalAmount) {
          totalAmount = todaySum;
          expCounts.JNE = todayCounts.JNE || 0;
          expCounts.JNT = todayCounts.JNT || 0;
          expCounts.SPX = todayCounts.SPX || 0;
          expCounts.IDX = todayCounts.IDX || 0;
        }
      }

      result.push({
        index: 6 - i,
        dateObj: d,
        isoDate,
        dayNameShort,
        dayNameFull,
        dateFormattedShort,
        dateFormattedFull,
        isToday,
        isYesterday,
        total: totalAmount,
        expCounts,
        pickup: pickupAmount,
        dropoff: dropoffAmount,
        logCount: dayLogs.length,
      });
    }

    return result;
  }, [logs, todayCounts]);

  // Filtered values depending on selected expedition
  const displayDays = useMemo(() => {
    return daysData.map((day) => {
      const activeVal =
        activeExpFilter === 'ALL'
          ? day.total
          : day.expCounts[activeExpFilter] || 0;
      return {
        ...day,
        displayValue: activeVal,
      };
    });
  }, [daysData, activeExpFilter]);

  // Overall Weekly Metrics
  const weeklyTotal = useMemo(() => {
    return displayDays.reduce((sum, d) => sum + d.displayValue, 0);
  }, [displayDays]);

  const dailyAverage = useMemo(() => {
    return Math.round((weeklyTotal / 7) * 10) / 10;
  }, [weeklyTotal]);

  const peakDay = useMemo(() => {
    let peak = displayDays[0];
    for (const d of displayDays) {
      if (d.displayValue > peak.displayValue) peak = d;
    }
    return peak;
  }, [displayDays]);

  const todayData = displayDays[6];
  const yesterdayData = displayDays[5];
  const diffVsYesterday = todayData.displayValue - yesterdayData.displayValue;
  const percentVsYesterday =
    yesterdayData.displayValue > 0
      ? Math.round((diffVsYesterday / yesterdayData.displayValue) * 100)
      : todayData.displayValue > 0
      ? 100
      : 0;

  // 7-day totals per expedition for legend
  const exp7DayTotals = useMemo(() => {
    const res: Record<ExpeditionCode, number> = {
      JNE: 0,
      JNT: 0,
      SPX: 0,
      IDX: 0,
    };
    daysData.forEach((d) => {
      EXPEDITION_KEYS.forEach((k) => {
        res[k] += d.expCounts[k] || 0;
      });
    });
    return res;
  }, [daysData]);

  const allExp7DaySum = useMemo(() => {
    return Object.values(exp7DayTotals).reduce((a: number, b: number) => a + b, 0);
  }, [exp7DayTotals]);

  // Active highlighted day
  const activeFocusIndex =
    selectedDayIndex !== null
      ? selectedDayIndex
      : hoveredDayIndex !== null
      ? hoveredDayIndex
      : 6; // default focus on today
  const activeFocusDay = displayDays[activeFocusIndex] || displayDays[6];

  // SVG Chart Geometry
  const chartHeight = 160;
  const svgWidth = 680;
  const svgHeight = 225;
  const paddingLeft = 45;
  const paddingRight = 20;
  const plotWidth = svgWidth - paddingLeft - paddingRight;

  const rawMax = Math.max(10, ...displayDays.map((d) => d.displayValue));
  // Round up to nice number for Y grid
  const maxScale = Math.ceil(rawMax / 10) * 10 + 5;

  const getBarX = (index: number) => {
    const slotWidth = plotWidth / 7;
    return paddingLeft + index * slotWidth + (slotWidth - 44) / 2;
  };

  const getBarHeight = (value: number) => {
    if (value <= 0) return 0;
    return (value / maxScale) * chartHeight;
  };

  const avgY = 170 - (dailyAverage / maxScale) * chartHeight;

  // Copy weekly summary to clipboard
  const handleCopyWeeklySummary = async () => {
    const firstDay = daysData[0];
    const lastDay = daysData[6];
    const expLabel =
      activeExpFilter === 'ALL'
        ? 'Semua Ekspedisi'
        : EXPEDITIONS[activeExpFilter]?.name || activeExpFilter;

    let text = `*Grafik & Rekap Mingguan Paket (${expLabel})*\n`;
    text += `Periode: ${firstDay.dateFormattedShort} - ${lastDay.dateFormattedShort} (${firstDay.dateObj.getFullYear()})\n`;
    text += `Total 7 Hari : ${weeklyTotal} paket (Rata-rata: ${dailyAverage}/hari)\n`;
    text += `Hari Puncak  : ${peakDay.dayNameFull} (${peakDay.displayValue} paket)\n\n`;
    text += `*Rincian Per Hari (Tren 7 Hari):*\n`;

    daysData.forEach((d) => {
      const tag = d.isToday ? ' (Hari Ini)' : d.isYesterday ? ' (Kemarin)' : '';
      const val = activeExpFilter === 'ALL' ? d.total : d.expCounts[activeExpFilter];
      text += `- ${d.dayNameShort}, ${d.dateFormattedShort}: ${val} paket${tag}\n`;
    });

    if (activeExpFilter === 'ALL') {
      text += `\n*Total Per Ekspedisi (7 Hari):*\n`;
      EXPEDITION_KEYS.forEach((k) => {
        const amt = exp7DayTotals[k];
        const pct = allExp7DaySum > 0 ? Math.round((amt / allExp7DaySum) * 100) : 0;
        text += `- ${EXPEDITIONS[k].name}: ${amt} paket (${pct}%)\n`;
      });
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedSummary(true);
      if (showToast) {
        showToast('Ringkasan tren mingguan berhasil disalin ke clipboard!', 'success');
      }
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      if (showToast) {
        showToast('Gagal menyalin ringkasan mingguan.', 'error');
      }
    }
  };

  return (
    <div
      id="weekly-comparison-chart-container"
      className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 relative overflow-hidden transition-all"
    >
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 -mb-10 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100 relative z-10">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0 shadow-inner border border-blue-100">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
                Tren & Perbandingan Paket Mingguan
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200/70">
                1 Minggu Terakhir
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau pergerakan jumlah paket dari hari ke hari dalam 7 hari terakhir ({daysData[0].dateFormattedShort} – {daysData[6].dateFormattedShort})
            </p>
          </div>
        </div>

        {/* Action Controls & Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle: Chart vs Table */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewStyle('chart')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewStyle === 'chart'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Grafik</span>
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('table')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewStyle === 'table'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Tabel</span>
            </button>
          </div>

          {/* Chart mode toggle (Stacked vs Total) */}
          {activeExpFilter === 'ALL' && viewStyle === 'chart' && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-bold">
              <button
                type="button"
                onClick={() => setChartMode('stacked')}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  chartMode === 'stacked'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Warna berbeda untuk setiap ekspedisi"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Ekspedisi</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMode('total')}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  chartMode === 'total'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Satu warna solid total gabungan"
              >
                <span>Total</span>
              </button>
            </div>
          )}

          {/* Copy weekly report summary */}
          <button
            type="button"
            onClick={handleCopyWeeklySummary}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              copiedSummary
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-white active:bg-slate-900'
            }`}
            title="Salin ringkasan tren mingguan ke clipboard"
          >
            {copiedSummary ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Tren</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4 Summary Stat Cards for the 7 Days */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 my-5 relative z-10">
        {/* Total 7 Hari */}
        <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
            <span>Total 7 Hari</span>
            <CalendarDays className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {weeklyTotal.toLocaleString('id-ID')}
            </span>
            <span className="text-xs font-bold text-slate-500">paket</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 font-medium">
            Akumulasi 1 minggu terakhir
          </div>
        </div>

        {/* Rata-Rata Harian */}
        <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
            <span>Rata-Rata Harian</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {dailyAverage.toLocaleString('id-ID')}
            </span>
            <span className="text-xs font-bold text-slate-500">paket/hari</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 font-medium">
            Target benchmark harian
          </div>
        </div>

        {/* Hari Puncak (Tertinggi) */}
        <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
            <span>Hari Puncak</span>
            <Award className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">
              {peakDay.dayNameShort}
            </span>
            <span className="text-sm font-bold text-slate-600">
              ({peakDay.displayValue} pkt)
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 font-medium">
            {peakDay.dateFormattedShort} (Volume terbesar)
          </div>
        </div>

        {/* Tren Hari Ini vs Kemarin */}
        <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
            <span>Hari Ini vs Kemarin</span>
            {diffVsYesterday > 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : diffVsYesterday < 0 ? (
              <TrendingDown className="w-4 h-4 text-rose-500" />
            ) : (
              <Minus className="w-4 h-4 text-slate-400" />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                diffVsYesterday > 0
                  ? 'text-emerald-600'
                  : diffVsYesterday < 0
                  ? 'text-rose-600'
                  : 'text-slate-700'
              }`}
            >
              {diffVsYesterday > 0 ? `+${diffVsYesterday}` : diffVsYesterday}
            </span>
            <span className="text-xs font-bold text-slate-500">paket</span>
            {yesterdayData.displayValue > 0 && (
              <span
                className={`text-[11px] font-black px-1.5 py-0.5 rounded-md ${
                  diffVsYesterday >= 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {diffVsYesterday >= 0 ? `+${percentVsYesterday}%` : `${percentVsYesterday}%`}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 font-medium">
            Hari ini: {todayData.displayValue} | Kemarin: {yesterdayData.displayValue}
          </div>
        </div>
      </div>

      {/* Filter Ekspedisi Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 relative z-10 pb-3 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
          <span>Filter Tampilan:</span>
        </span>
        <button
          type="button"
          onClick={() => setActiveExpFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
            activeExpFilter === 'ALL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <span>Semua Ekspedisi</span>
          <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
            {daysData.reduce((s, d) => s + d.total, 0)}
          </span>
        </button>

        {EXPEDITION_KEYS.map((key) => {
          const cfg = EXPEDITIONS[key];
          const isSelected = activeExpFilter === key;
          const totalKey = exp7DayTotals[key];

          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveExpFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? `${cfg.btnBg} text-white shadow-xs font-black ring-2 ring-offset-1 ring-blue-300`
                  : 'bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isSelected ? '#ffffff' : cfg.colorHex }}
              />
              <span>{cfg.name}</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                  isSelected ? 'bg-black/20 text-white' : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {totalKey}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Chart Area */}
      {viewStyle === 'chart' ? (
        <div className="relative z-10">
          {/* Active Highlight Info Banner */}
          <div className="mb-3 px-4 py-2.5 bg-blue-50/70 border border-blue-100 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-blue-900 flex items-center gap-1">
                <span>Fokus:</span>
                <span className="text-blue-700 underline">{activeFocusDay.dateFormattedFull}</span>
              </span>
              {activeFocusDay.isToday && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                  Hari Ini
                </span>
              )}
              {activeFocusDay.isYesterday && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white">
                  Kemarin
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-slate-700 font-semibold">
              <span>
                Total: <strong className="font-black text-slate-900 text-sm">{activeFocusDay.displayValue}</strong> paket
              </span>
              {activeExpFilter === 'ALL' && (
                <span className="hidden sm:inline text-slate-500">
                  (JNE: {activeFocusDay.expCounts.JNE} | J&T: {activeFocusDay.expCounts.JNT} | SPX: {activeFocusDay.expCounts.SPX} | IDX: {activeFocusDay.expCounts.IDX})
                </span>
              )}
            </div>
          </div>

          {/* Interactive SVG Bar Chart */}
          <div className="relative w-full overflow-x-auto select-none pt-2">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto min-w-[560px] overflow-visible"
            >
              {/* Horizontal Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const val = Math.round(maxScale * pct);
                const y = 170 - pct * chartHeight;
                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={svgWidth - paddingRight}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="9"
                      fill="#94a3b8"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Dotted Average Benchmark Line */}
              {dailyAverage > 0 && (
                <g>
                  <line
                    x1={paddingLeft}
                    y1={avgY}
                    x2={svgWidth - paddingRight}
                    y2={avgY}
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                  <rect
                    x={svgWidth - paddingRight - 82}
                    y={avgY - 9}
                    width="82"
                    height="16"
                    rx="4"
                    fill="#fef3c7"
                    stroke="#fde68a"
                  />
                  <text
                    x={svgWidth - paddingRight - 41}
                    y={avgY + 2.5}
                    textAnchor="middle"
                    fontSize="8.5"
                    fill="#92400e"
                    fontWeight="700"
                  >
                    Rata-rata: {dailyAverage}
                  </text>
                </g>
              )}

              {/* The 7 Day Bars */}
              {displayDays.map((day, idx) => {
                const barX = getBarX(idx);
                const barWidth = 44;
                const isHovered = hoveredDayIndex === idx;
                const isSelected = selectedDayIndex === idx;
                const isFocused = activeFocusIndex === idx;

                const totalVal = day.displayValue;
                const totalBarHeight = getBarHeight(totalVal);
                const barY = 170 - totalBarHeight;

                // Stacked segments
                let currentY = 170;
                const segments: { key: ExpeditionCode; height: number; y: number; color: string }[] = [];

                if (chartMode === 'stacked' && activeExpFilter === 'ALL') {
                  EXPEDITION_KEYS.forEach((key) => {
                    const val = day.expCounts[key] || 0;
                    if (val > 0) {
                      const segH = getBarHeight(val);
                      currentY -= segH;
                      segments.push({
                        key,
                        height: segH,
                        y: currentY,
                        color: EXPEDITIONS[key].colorHex,
                      });
                    }
                  });
                }

                return (
                  <g
                    key={day.isoDate}
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setHoveredDayIndex(idx)}
                    onMouseLeave={() => setHoveredDayIndex(null)}
                    onClick={() => {
                      setSelectedDayIndex(selectedDayIndex === idx ? null : idx);
                    }}
                  >
                    {/* Background hit area */}
                    <rect
                      x={barX - 10}
                      y="10"
                      width={barWidth + 20}
                      height="200"
                      fill="transparent"
                    />

                    {/* Column Hover Highlight Backdrop */}
                    {isFocused && (
                      <rect
                        x={barX - 6}
                        y="15"
                        width={barWidth + 12}
                        height="160"
                        rx="12"
                        fill="#eff6ff"
                        opacity="0.8"
                      />
                    )}

                    {/* Render Bar: Either Stacked or Solid */}
                    {totalVal === 0 ? (
                      // Empty state bar pill
                      <rect
                        x={barX}
                        y="166"
                        width={barWidth}
                        height="4"
                        rx="2"
                        fill="#e2e8f0"
                      />
                    ) : chartMode === 'stacked' && activeExpFilter === 'ALL' && segments.length > 0 ? (
                      // Stacked Bar segments
                      <g>
                        {segments.map((seg, sIdx) => {
                          const isTop = sIdx === segments.length - 1;
                          return (
                            <rect
                              key={seg.key}
                              x={barX}
                              y={seg.y}
                              width={barWidth}
                              height={seg.height}
                              rx={isTop ? 6 : 0}
                              fill={seg.color}
                              stroke={isFocused ? '#ffffff' : 'none'}
                              strokeWidth={isFocused ? '1' : '0'}
                              className="transition-all duration-300"
                            />
                          );
                        })}
                      </g>
                    ) : (
                      // Single solid bar (filtered or total)
                      <rect
                        x={barX}
                        y={barY}
                        width={barWidth}
                        height={totalBarHeight}
                        rx="6"
                        fill={
                          activeExpFilter !== 'ALL'
                            ? EXPEDITIONS[activeExpFilter]?.colorHex || '#2563eb'
                            : day.isToday
                            ? '#2563eb'
                            : '#3b82f6'
                        }
                        className="transition-all duration-300"
                      />
                    )}

                    {/* Top Value Label */}
                    <text
                      x={barX + barWidth / 2}
                      y={totalVal > 0 ? barY - 6 : 162}
                      textAnchor="middle"
                      fontSize={totalVal > 0 ? '11' : '9'}
                      fontWeight={day.isToday || isFocused ? '900' : '700'}
                      fill={totalVal > 0 ? (day.isToday ? '#1d4ed8' : '#334155') : '#94a3b8'}
                    >
                      {totalVal}
                    </text>

                    {/* Bottom Day of Week Label */}
                    <text
                      x={barX + barWidth / 2}
                      y="190"
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={day.isToday ? '900' : isFocused ? '800' : '700'}
                      fill={day.isToday ? '#1d4ed8' : isFocused ? '#0f172a' : '#64748b'}
                    >
                      {day.dayNameShort}
                    </text>

                    {/* Bottom Date Label */}
                    <text
                      x={barX + barWidth / 2}
                      y="204"
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight={day.isToday ? '800' : '600'}
                      fill={day.isToday ? '#2563eb' : '#94a3b8'}
                    >
                      {day.dateFormattedShort}
                    </text>

                    {/* Today Pill Indicator */}
                    {day.isToday && (
                      <g>
                        <rect
                          x={barX + barWidth / 2 - 20}
                          y="210"
                          width="40"
                          height="13"
                          rx="4"
                          fill="#10b981"
                        />
                        <text
                          x={barX + barWidth / 2}
                          y="220"
                          textAnchor="middle"
                          fontSize="7.5"
                          fontWeight="900"
                          fill="#ffffff"
                        >
                          HARI INI
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      ) : (
        /* Table View of 7 Days */
        <div className="overflow-x-auto relative z-10 my-2">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200/80 text-slate-600 font-bold">
                <th className="py-2.5 px-3">Hari & Tanggal</th>
                <th className="py-2.5 px-3 text-center">JNE</th>
                <th className="py-2.5 px-3 text-center">J&T</th>
                <th className="py-2.5 px-3 text-center">SPX</th>
                <th className="py-2.5 px-3 text-center">ID Express</th>
                <th className="py-2.5 px-3 text-right">Total Paket</th>
                <th className="py-2.5 px-3 text-right">Metode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {daysData.map((d) => (
                <tr
                  key={d.isoDate}
                  className={`hover:bg-blue-50/50 transition-colors ${
                    d.isToday ? 'bg-blue-50/30 font-semibold' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-medium flex items-center gap-2">
                    <span className="font-bold text-slate-800">{d.dayNameFull}</span>
                    <span className="text-slate-400">({d.dateFormattedShort})</span>
                    {d.isToday && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">
                        Hari Ini
                      </span>
                    )}
                    {d.isYesterday && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800">
                        Kemarin
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-600">
                    {d.expCounts.JNE}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-red-600">
                    {d.expCounts.JNT}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-orange-600">
                    {d.expCounts.SPX}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-red-800">
                    {d.expCounts.IDX}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono text-sm">
                    {d.total}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-500 font-medium text-[11px]">
                    P: {d.pickup} | D: {d.dropoff}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t border-slate-300">
                <td className="py-3 px-3">Total 7 Hari</td>
                <td className="py-3 px-3 text-center text-blue-700 font-mono">
                  {exp7DayTotals.JNE}
                </td>
                <td className="py-3 px-3 text-center text-red-700 font-mono">
                  {exp7DayTotals.JNT}
                </td>
                <td className="py-3 px-3 text-center text-orange-700 font-mono">
                  {exp7DayTotals.SPX}
                </td>
                <td className="py-3 px-3 text-center text-red-900 font-mono">
                  {exp7DayTotals.IDX}
                </td>
                <td className="py-3 px-3 text-right text-slate-950 font-mono text-base font-black">
                  {weeklyTotal}
                </td>
                <td className="py-3 px-3 text-right text-slate-600">
                  Rata-rata: {dailyAverage}/hari
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend & Breakdown Footer Bar */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs relative z-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-400 font-semibold text-[11px]">Legenda:</span>
          {EXPEDITION_KEYS.map((key) => {
            const cfg = EXPEDITIONS[key];
            const sum = exp7DayTotals[key];
            const pct = allExp7DaySum > 0 ? Math.round((sum / allExp7DaySum) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.colorHex }}
                />
                <span className="font-bold text-slate-700">{cfg.name}:</span>
                <span className="text-slate-500 font-mono font-medium">
                  {sum} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
          <Info className="w-3.5 h-3.5 text-blue-500" />
          <span>Klik batang grafik untuk melihat detail per hari</span>
        </div>
      </div>
    </div>
  );
};
