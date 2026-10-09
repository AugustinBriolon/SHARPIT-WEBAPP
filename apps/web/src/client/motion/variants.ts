import { motionTokens, springs } from '@/client/motion/tokens';

/** Shared fade — FadePresence / one-shot FadeIn. */
export const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

export const fadeTransition = {
  duration: motionTokens.duration.fast,
  ease: motionTokens.easing.smooth,
} as const;

/** Grid 0fr→1fr expand — MotionExpand (§9.3). */
export const collapseVariants = {
  collapsed: { opacity: 0, gridTemplateRows: '0fr' },
  expanded: { opacity: 1, gridTemplateRows: '1fr' },
} as const;

/** Dialog / morph surfaces — critically damped, no bounce. */
export const dialogTransition = springs.gentle;
