import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Sparkles,
  CheckCircle2,
  Volume2,
  X,
  PartyPopper,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { soundFX } from '../utils/audio';
import { CuteAgentAvatar } from './CuteAgentAvatar';

export interface Celebration100ModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalPacked: number;
  timeframeLabel?: string;
}

export const Celebration100Modal: React.FC<Celebration100ModalProps> = ({
  isOpen,
  onClose,
  totalPacked,
  timeframeLabel = 'Hari Ini',
}) => {
  // Fire high-energy grand confetti burst
  const triggerConfetti = useCallback(() => {
    try {
      const count = 350;
      const defaults = {
        origin: { y: 0.65 },
        zIndex: 9999,
      };

      const fire = (particleRatio: number, opts: confetti.Options) => {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        });
      };

      // Blast 1: Big center explosion with large colorful flakes
      fire(0.25, {
        spread: 35,
        startVelocity: 65,
        scalar: 1.4,
        colors: ['#10B981', '#34D399', '#F59E0B', '#3B82F6', '#EC4899', '#A855F7'],
      });
      fire(0.25, {
        spread: 75,
        scalar: 1.3,
        colors: ['#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F43F5E'],
      });
      fire(0.25, {
        spread: 110,
        decay: 0.91,
        scalar: 1.5,
      });
      fire(0.15, {
        spread: 130,
        startVelocity: 35,
        decay: 0.92,
        scalar: 1.8,
      });
      fire(0.1, {
        spread: 140,
        startVelocity: 55,
        scalar: 1.3,
      });

      // Left & Right Cannons after 180ms
      setTimeout(() => {
        confetti({
          particleCount: 90,
          angle: 60,
          spread: 65,
          scalar: 1.4,
          origin: { x: 0, y: 0.65 },
          zIndex: 9999,
          colors: ['#10B981', '#34D399', '#FBBF24', '#F43F5E', '#3B82F6'],
        });
        confetti({
          particleCount: 90,
          angle: 120,
          spread: 65,
          scalar: 1.4,
          origin: { x: 1, y: 0.65 },
          zIndex: 9999,
          colors: ['#3B82F6', '#60A5FA', '#10B981', '#F59E0B', '#EC4899'],
        });
      }, 180);

      // Third surprise fireworks shower after 500ms
      setTimeout(() => {
        confetti({
          particleCount: 70,
          spread: 100,
          scalar: 1.6,
          origin: { y: 0.35 },
          zIndex: 9999,
          shapes: ['circle'],
          colors: ['#FBBF24', '#34D399', '#60A5FA', '#F43F5E'],
        });
      }, 500);
    } catch {
      // Ignore confetti issues
    }
  }, []);

  // When modal opens: play fanfare + "Yeah Berhasil" voice & blast confetti
  useEffect(() => {
    if (isOpen) {
      soundFX.playCelebration100();
      triggerConfetti();

      // Second wave of confetti after 1.8 seconds for extra excitement
      const timer = setTimeout(() => {
        triggerConfetti();
      }, 1800);

      return () => clearTimeout(timer);
    }
  }, [isOpen, triggerConfetti]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="modal-celebration-100"
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-lg flex items-center justify-center z-[100] p-3 sm:p-6 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.75, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.75, y: 30 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 rounded-3xl sm:rounded-[2.5rem] border-2 border-emerald-400 shadow-[0_0_90px_rgba(16,185,129,0.55),0_25px_60px_rgba(0,0,0,0.8)] max-w-xl sm:max-w-2xl w-full p-6 sm:p-10 relative overflow-hidden text-center text-white my-auto"
        >
          {/* Animated Atmospheric Background Glows */}
          <div className="absolute -top-32 -left-32 w-80 h-80 bg-emerald-500/30 rounded-full blur-3xl pointer-events-none animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-amber-500/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2.5 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer z-30 border border-transparent hover:border-slate-700/80 active:scale-90"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Top Celebration Badge with animated trophy */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-emerald-500/35 via-amber-500/25 to-teal-500/35 border-2 border-emerald-400/80 shadow-[0_0_28px_rgba(16,185,129,0.5)] text-emerald-300 text-xs sm:text-sm font-black uppercase tracking-wider mb-5">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 animate-bounce" />
            <span>Target Tercapai 100%!</span>
            <PartyPopper className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-300 animate-bounce" />
          </div>

          {/* BIG Cute Agent Mascot Center Stage with Radiant Rays & Floating Badges */}
          <div className="my-2 sm:my-4 flex justify-center items-center relative py-4 sm:py-6">
            {/* Giant Rotating Radial Light Burst behind Mascot */}
            <div className="absolute w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full bg-gradient-to-r from-emerald-500/20 via-teal-400/20 to-amber-400/20 blur-2xl animate-spin [animation-duration:18s] pointer-events-none" />
            
            {/* Concentric Pulsing Gold & Emerald Rings */}
            <div className="absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border-2 border-emerald-400/30 animate-ping opacity-30 pointer-events-none" />
            <div className="absolute w-60 h-60 sm:w-76 sm:h-76 rounded-full border border-amber-400/25 animate-pulse opacity-40 pointer-events-none" />

            {/* Left Floating Badge */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0, y: [0, -6, 0] }}
              transition={{ delay: 0.3, y: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' } }}
              className="hidden sm:flex absolute left-4 md:left-8 top-1/2 -translate-y-1/2 flex-col items-center gap-1 px-3 py-2 rounded-2xl bg-slate-900/90 border border-emerald-400/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-20 backdrop-blur-sm"
            >
              <div className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-black uppercase text-emerald-300 tracking-wider">Semua Beres</span>
              <span className="text-xs font-mono font-bold text-white">100%</span>
            </motion.div>

            {/* Right Floating Badge */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0, y: [0, 6, 0] }}
              transition={{ delay: 0.4, y: { repeat: Infinity, duration: 2.8, ease: 'easeInOut' } }}
              className="hidden sm:flex absolute right-4 md:right-8 top-1/2 -translate-y-1/2 flex-col items-center gap-1 px-3 py-2 rounded-2xl bg-slate-900/90 border border-amber-400/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-20 backdrop-blur-sm"
            >
              <div className="p-1.5 rounded-full bg-amber-500/20 text-amber-300">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-black uppercase text-amber-300 tracking-wider">Super Cepat</span>
              <span className="text-xs font-mono font-bold text-white">Juara!</span>
            </motion.div>

            {/* Grand Cute Agent Avatar - 3XL Size for Massive Eye-Catching Impact */}
            <div className="relative z-10">
              <CuteAgentAvatar
                expression="cool_sunglasses"
                size="3xl"
                glowColor="emerald"
                animation="bounce"
                bubbleText="YEAAAH! BERHASIL 100%! 🎉😎"
              />
            </div>
          </div>

          {/* Grand Headline Typography */}
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight mt-2 bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-200 bg-clip-text text-transparent drop-shadow-[0_4px_20px_rgba(52,211,153,0.6)]">
            YEAAAH, BERHASIL!
          </h2>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Sparkles className="w-5 h-5 text-amber-300 animate-spin [animation-duration:3s]" />
            <span className="text-base sm:text-xl font-black text-emerald-300 tracking-wide">
              100% Selesai Di-Packing
            </span>
            <Sparkles className="w-5 h-5 text-amber-300 animate-spin [animation-duration:3s]" />
          </div>

          <p className="text-xs sm:text-base text-slate-300 mt-3 leading-relaxed max-w-md mx-auto">
            Luar biasa! Seluruh pesanan <strong className="text-white">{timeframeLabel}</strong> telah selesai di-packing dengan sempurna tanpa ada antrean yang tertinggal.
          </p>

          {/* Large Highlighted Stats Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-6 bg-slate-900/95 border-2 border-emerald-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
            <div className="text-center border-r border-slate-700/80 pr-2">
              <span className="text-[11px] sm:text-xs font-black text-slate-400 uppercase tracking-wider block">
                Total Selesai Packing
              </span>
              <span className="text-2xl sm:text-4xl font-black font-mono text-emerald-300 mt-1 block drop-shadow-[0_2px_10px_rgba(52,211,153,0.4)]">
                {totalPacked} Nota
              </span>
              <span className="inline-block mt-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                ✓ Sempurna
              </span>
            </div>
            <div className="text-center pl-2">
              <span className="text-[11px] sm:text-xs font-black text-slate-400 uppercase tracking-wider block">
                Sisa Pending
              </span>
              <span className="text-2xl sm:text-4xl font-black font-mono text-amber-300 mt-1 block drop-shadow-[0_2px_10px_rgba(245,158,11,0.4)]">
                0 Nota
              </span>
              <span className="inline-block mt-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                Beres Semua!
              </span>
            </div>
          </div>

          {/* Action Buttons - Larger, tactile, and prominent */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center">
            {/* Re-play voice & confetti button */}
            <button
              type="button"
              onClick={() => {
                soundFX.playCelebration100();
                triggerConfetti();
              }}
              className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700/90 border border-emerald-500/50 text-emerald-300 text-xs sm:text-sm font-black flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg hover:shadow-[0_0_20px_rgba(16,185,129,0.35)] active:scale-95"
            >
              <Volume2 className="w-5 h-5 text-emerald-400 animate-pulse" />
              <span>Putar Suara & Konfeti</span>
            </button>

            {/* Close / Continue Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-[0_4px_25px_rgba(16,185,129,0.5)] cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-5 h-5 text-slate-950 stroke-[3]" />
              <span>Mantap, Lanjutkan Kerja!</span>
              <ArrowRight className="w-4 h-4 text-slate-950" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
