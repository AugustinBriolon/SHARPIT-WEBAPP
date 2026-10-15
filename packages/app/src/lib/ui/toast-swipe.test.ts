import { describe, expect, it } from 'vitest';

import {
  TOAST_DISMISS_HEIGHT_RATIO,
  TOAST_FLICK_VELOCITY_Y,
  applyToastSwipeOffset,
  resolveToastSwipeEnd,
  toastDismissDistancePx,
  toastSwipeVisual,
} from './toast-swipe';

describe('toast swipe dismiss thresholds', () => {
  const height = 64;

  it('uses ~40% of height as the distance dismiss threshold', () => {
    expect(TOAST_DISMISS_HEIGHT_RATIO).toBe(0.4);
    expect(toastDismissDistancePx(height)).toBeCloseTo(25.6);
  });

  it('dismisses when dragged upward past 40% of height', () => {
    expect(
      resolveToastSwipeEnd({
        deltaY: -toastDismissDistancePx(height) - 1,
        velocityY: 0,
        height,
        reduceMotion: false,
      }),
    ).toBe('dismiss');
  });

  it('springs back when release is below distance and velocity thresholds', () => {
    expect(
      resolveToastSwipeEnd({
        deltaY: -10,
        velocityY: -0.1,
        height,
        reduceMotion: false,
      }),
    ).toBe('spring-back');
  });

  it('dismisses on a fast upward flick even below 40% distance', () => {
    expect(
      resolveToastSwipeEnd({
        deltaY: -8,
        velocityY: TOAST_FLICK_VELOCITY_Y,
        height,
        reduceMotion: false,
      }),
    ).toBe('dismiss');
  });

  it('rubber-bands downward drag and follows upward 1:1', () => {
    expect(applyToastSwipeOffset(-20)).toBe(-20);
    expect(applyToastSwipeOffset(20)).toBeLessThan(20);
    expect(applyToastSwipeOffset(20)).toBeGreaterThan(0);
  });

  it('prefers-reduced-motion: fade dismiss, no finger-follow offset', () => {
    expect(
      resolveToastSwipeEnd({
        deltaY: -20,
        velocityY: 0,
        height,
        reduceMotion: true,
      }),
    ).toBe('fade-dismiss');

    const visual = toastSwipeVisual(-30, height, true);
    expect(visual.y).toBe(0);
    expect(visual.opacity).toBeLessThan(1);
  });
});
