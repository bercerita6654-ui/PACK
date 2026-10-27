import React from 'react';
import { motion } from 'motion/react';

export type AgentExpression =
  | 'cool'
  | 'thumbs_up'
  | 'duck_waiting'
  | 'panic_sweat'
  | 'eating_popcorn'
  | 'chilling_beanbag'
  | 'ice_cube'
  | 'holding_heart'
  | 'shy_smile';

interface CuteAgentAvatarProps {
  expression: AgentExpression;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  bubbleText?: string;
  className?: string;
  glowColor?: 'amber' | 'emerald' | 'rose' | 'indigo' | 'cyan';
  animate?: boolean;
}

const AGENT_IMAGES: Record<AgentExpression, string> = {
  cool: '/assets/agent/cool_sunglasses.png',
  thumbs_up: '/assets/agent/thumbs_up.png',
  duck_waiting: '/assets/agent/duck_waiting.png',
  panic_sweat: '/assets/agent/panic_sweat.png',
  eating_popcorn: '/assets/agent/eating_popcorn.png',
  chilling_beanbag: '/assets/agent/chilling_beanbag.png',
  ice_cube: '/assets/agent/ice_cube.png',
  holding_heart: '/assets/agent/holding_heart.png',
  shy_smile: '/assets/agent/shy_smile.png',
};

const SIZE_CLASSES = {
  xs: 'w-8 h-8',
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20 sm:w-24 sm:h-24',
};

const GLOW_CLASSES = {
  amber: 'drop-shadow-[0_4px_12px_rgba(245,158,11,0.45)] ring-amber-400/30',
  emerald: 'drop-shadow-[0_4px_12px_rgba(16,185,129,0.5)] ring-emerald-400/30',
  rose: 'drop-shadow-[0_4px_12px_rgba(244,63,94,0.55)] ring-rose-400/30',
  indigo: 'drop-shadow-[0_4px_12px_rgba(99,102,241,0.45)] ring-indigo-400/30',
  cyan: 'drop-shadow-[0_4px_12px_rgba(6,182,212,0.45)] ring-cyan-400/30',
};

export const CuteAgentAvatar: React.FC<CuteAgentAvatarProps> = ({
  expression,
  size = 'md',
  bubbleText,
  className = '',
  glowColor,
  animate = true,
}) => {
  const imgSrc = AGENT_IMAGES[expression] || AGENT_IMAGES.cool;

  // Custom motion animation based on expression
  const getAnimationVariants = () => {
    if (!animate) return {};
    switch (expression) {
      case 'panic_sweat':
        return {
          animate: {
            x: [0, -2, 2, -1, 1, 0],
            y: [0, -1, 1, -2, 0],
            rotate: [0, -2, 2, -1, 1, 0],
            transition: {
              duration: 1.2,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          },
        };
      case 'cool':
        return {
          animate: {
            y: [0, -4, 0],
            rotate: [0, 1.5, -1.5, 0],
            transition: {
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          },
        };
      case 'thumbs_up':
      case 'holding_heart':
        return {
          animate: {
            scale: [1, 1.05, 1],
            y: [0, -3, 0],
            transition: {
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          },
        };
      case 'duck_waiting':
      case 'eating_popcorn':
      case 'chilling_beanbag':
      default:
        return {
          animate: {
            y: [0, -3, 0],
            transition: {
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          },
        };
    }
  };

  const anim = getAnimationVariants();

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* Speech bubble if provided */}
      {bubbleText && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-black bg-white/95 text-slate-900 shadow-md border border-slate-200/80 pointer-events-none z-20 flex items-center gap-1"
        >
          <span>{bubbleText}</span>
          <span className="w-1.5 h-1.5 bg-white absolute -bottom-0.5 left-1/2 -translate-x-1/2 rotate-45 border-r border-b border-slate-200/80" />
        </motion.div>
      )}

      {/* Animated cute agent avatar */}
      <motion.div
        {...anim}
        className={`relative ${SIZE_CLASSES[size]} flex items-center justify-center shrink-0 cursor-pointer`}
      >
        <img
          src={imgSrc}
          alt={`Agent Lucu - ${expression}`}
          className={`w-full h-full object-contain filter ${
            glowColor ? GLOW_CLASSES[glowColor] : 'drop-shadow-md'
          } hover:scale-110 transition-transform duration-200`}
          loading="lazy"
        />
      </motion.div>
    </div>
  );
};
