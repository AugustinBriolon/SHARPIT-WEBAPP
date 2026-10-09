'use client';

import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '@/client/motion/tokens';
import { collapseVariants } from '@/client/motion/variants';

/**
 * Expand / collapse via grid 0fr→1fr + opacity — DESIGN_LANGUAGE §9.3 / §9.9.
 */
export function MotionExpand({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      animate={open ? 'expanded' : 'collapsed'}
      className={className}
      initial={false}
      style={{ display: 'grid' }}
      variants={collapseVariants}
      transition={
        reduce
          ? { duration: 0 }
          : {
              duration: motionTokens.duration.normal,
              ease: motionTokens.easing.smooth,
              opacity: {
                duration: open ? motionTokens.duration.fast : motionTokens.duration.instant,
              },
            }
      }
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </motion.div>
  );
}
