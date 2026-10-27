import React from 'react';
import { motion } from 'motion/react';

export type AgentExpression =
  | 'cool'
  | 'cool_sunglasses'
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
  customImageUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  bubbleText?: string;
  className?: string;
  glowColor?: 'amber' | 'emerald' | 'rose' | 'indigo' | 'cyan';
  animate?: boolean;
  animation?: 'bounce' | 'wiggle' | 'jitter' | 'float' | 'pulse';
}

const AGENT_IMAGES: Record<AgentExpression, string> = {
  cool: '/assets/agent/cool_sunglasses.png',
  cool_sunglasses: '/assets/agent/cool_sunglasses.png',
  thumbs_up: '/assets/agent/thumbs_up.png',
  duck_waiting: '/assets/agent/duck_waiting.png',
  panic_sweat: '/assets/agent/panic_sweat.png',
  eating_popcorn: '/assets/agent/eating_popcorn.png',
  chilling_beanbag: '/assets/agent/chilling_beanbag.png',
  ice_cube: '/assets/agent/ice_cube.png',
  holding_heart: '/assets/agent/holding_heart.png',
  shy_smile: '/assets/agent/shy_smile.png',
};

const SIZE_CLASSES: Record<NonNullable<CuteAgentAvatarProps['size']>, string> = {
  xs: 'w-9 h-9',
  sm: 'w-12 h-12 sm:w-14 sm:h-14',
  md: 'w-15 h-15 sm:w-16 sm:h-16',
  lg: 'w-18 h-18 sm:w-22 sm:h-22',
  xl: 'w-24 h-24 sm:w-28 sm:h-28',
  '2xl': 'w-36 h-36 sm:w-44 sm:h-44',
  '3xl': 'w-48 h-48 sm:w-60 sm:h-60 md:w-68 md:h-68',
  '4xl': 'w-60 h-60 sm:w-76 sm:h-76 md:w-88 md:h-88',
};

const GLOW_CLASSES = {
  amber: 'drop-shadow-[0_4px_16px_rgba(245,158,11,0.5)] ring-amber-400/30',
  emerald: 'drop-shadow-[0_4px_20px_rgba(16,185,129,0.55)] ring-emerald-400/30',
  rose: 'drop-shadow-[0_4px_16px_rgba(244,63,94,0.55)] ring-rose-400/30',
  indigo: 'drop-shadow-[0_4px_16px_rgba(99,102,241,0.5)] ring-indigo-400/30',
  cyan: 'drop-shadow-[0_4px_16px_rgba(6,182,212,0.5)] ring-cyan-400/30',
};

export const CuteAgentAvatar: React.FC<CuteAgentAvatarProps> = ({
  expression,
  customImageUrl,
  size = 'md',
  bubbleText,
  className = '',
  glowColor,
  animate = true,
  animation,
}) => {
  const imgSrc = customImageUrl || AGENT_IMAGES[expression] || AGENT_IMAGES.cool;

  // Custom motion animation based on explicit prop or expression
  const getAnimationVariants = () => {
    if (!animate) return {};

    if (animation === 'bounce') {
      return {
        animate: {
          y: [0, -10, 0],
          scale: [1, 1.05, 1],
          transition: {
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        },
      };
    }
    if (animation === 'jitter') {
      return {
        animate: {
          x: [0, -3, 3, -2, 2, 0],
          y: [0, -2, 2, -1, 1, 0],
          rotate: [0, -3, 3, -1, 1, 0],
          transition: {
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        },
      };
    }
    if (animation === 'float') {
      return {
        animate: {
          y: [0, -8, 0],
          rotate: [0, 2, -2, 0],
          transition: {
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        },
      };
    }
    if (animation === 'pulse') {
      return {
        animate: {
          scale: [1, 1.08, 1],
          transition: {
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        },
      };
    }

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
      case 'cool_sunglasses':
        return {
          animate: {
            y: [0, -6, 0],
            rotate: [0, 2, -2, 0],
            scale: [1, 1.03, 1],
            transition: {
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          },
        };
      case 'thumbs_up':
      case 'holding_heart':
        return {
          animate: {
            scale: [1, 1.06, 1],
            y: [0, -5, 0],
            transition: {
              duration: 1.8,
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
  const isLarge = size === '2xl' || size === '3xl' || size === '4xl';

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* Speech bubble if provided */}
      {bubbleText && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-black bg-white/95 text-slate-900 shadow-xl border border-slate-200/90 pointer-events-none z-20 flex items-center gap-1.5 ${
            isLarge
              ? '-top-9 sm:-top-11 px-3 sm:px-4 py-1 sm:py-1.5 rounded-2xl text-xs sm:text-sm drop-shadow-md'
              : '-top-7 px-2 py-0.5 rounded-full text-[10px] shadow-md'
          }`}
        >
          <span>{bubbleText}</span>
          <span
            className={`bg-white absolute left-1/2 -translate-x-1/2 rotate-45 border-r border-b border-slate-200/90 ${
              isLarge ? 'w-2 h-2 -bottom-1' : 'w-1.5 h-1.5 -bottom-0.5'
            }`}
          />
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
          } hover:scale-105 transition-transform duration-200`}
          loading="lazy"
        />
      </motion.div>
    </div>
  );
};
