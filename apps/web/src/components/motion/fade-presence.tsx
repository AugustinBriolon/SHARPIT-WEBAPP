'use client';

import { type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { fadeTransition, fadeVariants } from '@/client/motion/variants';

/**
 * Conditional mount + exit — DESIGN_LANGUAGE §9.9.
 * Reduced motion: instant swap (no animation).
 */
export function FadePresence({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="fade-presence"
          animate="animate"
          className={className}
          exit={reduce ? undefined : 'exit'}
          initial={reduce ? false : 'initial'}
          transition={reduce ? { duration: 0 } : fadeTransition}
          variants={fadeVariants}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
