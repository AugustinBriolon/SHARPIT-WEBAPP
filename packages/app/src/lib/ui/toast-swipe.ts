/**
 * iOS-banner-style swipe dismiss for top toasts.
 *
 * Up follows the finger; down is rubber-banded. Dismiss past ~40% of height
 * or on a fast upward flick; otherwise spring back. Reduced motion → fade only
 * (no finger-follow).
 */

/** Fraction of toast height that must be dragged upward to dismiss. */
export const TOAST_DISMISS_HEIGHT_RATIO = 0.4;

/**
 * Upward velocity (px/ms, negative Y) that dismisses even below the distance threshold.
 * ~0.5 px/ms ≈ 500 px/s — a short flick.
 */
export const TOAST_FLICK_VELOCITY_Y = -0.5;

/** Opposite-direction damping — pull down while dismiss is up. */
export const TOAST_RUBBER_BAND_FACTOR = 0.45;

export type ToastSwipeEndInput = {
  /** Finger delta Y (negative = up). Raw, before damping. */
  deltaY: number;
  /** Velocity Y in px/ms (negative = up). */
  velocityY: number;
  /** Toast height in px. */
  height: number;
  reduceMotion: boolean;
};

export type ToastSwipeEndResult = 'dismiss' | 'spring-back' | 'fade-dismiss';

/** Rubber-band when the athlete pulls down (positive Y) against an up-dismiss toast. */
export function applyToastSwipeOffset(deltaY: number): number {
  if (deltaY <= 0) {
    return deltaY;
  }
  return deltaY * TOAST_RUBBER_BAND_FACTOR;
}

export function toastDismissDistancePx(height: number): number {
  return Math.max(1, height * TOAST_DISMISS_HEIGHT_RATIO);
}

/**
 * Decide dismiss vs spring-back after pointer up.
 * Reduced motion never finger-follows; a completed upward intent fades out.
 */
export function resolveToastSwipeEnd(input: ToastSwipeEndInput): ToastSwipeEndResult {
  const { deltaY, velocityY, height, reduceMotion } = input;

  if (reduceMotion) {
    // No drag follow — only an explicit upward intent (or close button elsewhere) fades.
    if (deltaY < -8 || velocityY <= TOAST_FLICK_VELOCITY_Y) {
      return 'fade-dismiss';
    }
    return 'spring-back';
  }

  const distanceOk = deltaY <= -toastDismissDistancePx(height);
  const flickOk = velocityY <= TOAST_FLICK_VELOCITY_Y;
  if (distanceOk || flickOk) {
    return 'dismiss';
  }
  return 'spring-back';
}

export type ToastSwipeVisual = {
  y: number;
  opacity: number;
};

/** Live transform while dragging (or reduced-motion fade progress). */
export function toastSwipeVisual(
  deltaY: number,
  height: number,
  reduceMotion: boolean,
): ToastSwipeVisual {
  if (reduceMotion) {
    const progress = Math.min(1, Math.max(0, -deltaY / toastDismissDistancePx(height)));
    return { y: 0, opacity: 1 - progress * 0.85 };
  }
  const y = applyToastSwipeOffset(deltaY);
  const up = Math.min(1, Math.max(0, -deltaY / Math.max(height, 1)));
  return { y, opacity: 1 - up * 0.15 };
}
