'use client';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { CircleCheckIcon, CircleXIcon, InfoIcon, LoaderIcon, XIcon } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';

/**
 * Manager global : permet de déclencher des toasts depuis n'importe où, y
 * compris en dehors d'un composant React (et même si le composant à l'origine
 * de l'appel est démonté, par ex. après avoir quitté la page).
 */
export const toastManager = ToastPrimitive.createToastManager();

type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  timeout?: number;
  /**
   * One button, for undoing what the toast just announced.
   *
   * A destructive or hard-to-reverse action is far cheaper to offer back than to
   * confirm up front: a confirm dialog taxes every correct action to protect
   * against the rare wrong one, while an undo taxes nothing and costs a click
   * only when it was actually needed.
   */
  actionProps?: React.ComponentPropsWithoutRef<'button'>;
};

export const toast = {
  add: toastManager.add,
  close: toastManager.close,
  update: toastManager.update,
  promise: toastManager.promise,
  success: (title: React.ReactNode, options?: ToastInput) =>
    toastManager.add({ type: 'success', title, ...options }),
  error: (title: React.ReactNode, options?: ToastInput) =>
    toastManager.add({ type: 'error', title, ...options }),
  info: (title: React.ReactNode, options?: ToastInput) =>
    toastManager.add({ type: 'info', title, ...options }),
  loading: (title: React.ReactNode, options?: ToastInput) =>
    toastManager.add({ type: 'loading', title, timeout: 0, ...options }),
};

/**
 * Top-center, clear of the floating tab bar. Thin capsule — status chrome,
 * not a second sheet. `pointer-events-none` keeps the band inert; each Root
 * re-enables its own pointer events.
 */
export const toastViewportClass =
  'pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top,0px))] z-[100] mx-auto flex w-[min(18rem,calc(100vw-2rem))] flex-col outline-none sm:w-[min(20rem,calc(100vw-2.5rem))]';

/**
 * Enter/exit from above; stack grows downward. Swipe up to dismiss matches
 * the edge the toast arrived from (Base UI custom-position top pattern).
 */
export const toastRootClass =
  'group/toast toast-motion pointer-events-auto absolute inset-x-0 top-0 z-[calc(1000-var(--toast-index))] w-full origin-top select-none [--gap:0.5rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.08)))] [--shrink:calc(1-var(--scale))] [--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] data-ending-style:opacity-0 data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-limited:opacity-0 data-starting-style:[transform:translateY(-120%)] data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-140%))] data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-140%))] data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+140%))] data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+140%))] data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-140%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-140%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+140%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+140%))_translateY(var(--offset-y))] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-120%)]';

export const toastCloseClass =
  'text-muted-foreground/80 hover:bg-muted hover:text-foreground focus-visible:outline-ring flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:-outline-offset-1';

function ToastIcon({ type }: { type: string | undefined }) {
  const iconClass = 'size-3.5 shrink-0';
  switch (type) {
    case 'success':
      return <CircleCheckIcon className={cn(iconClass, 'text-primary')} aria-hidden />;
    case 'error':
      return <CircleXIcon className={cn(iconClass, 'text-destructive')} aria-hidden />;
    case 'loading':
      return (
        <LoaderIcon
          className={cn(iconClass, 'text-muted-foreground animate-spin motion-reduce:animate-none')}
          aria-hidden
        />
      );
    case 'info':
      return <InfoIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    default:
      return null;
  }
}

/**
 * Motion (transform / opacity) lives on Root. Height lives on the inner shell
 * without a transition — stacking still snaps to `--toast-height` on expand,
 * compositor-only animation stays off the layout path.
 */
function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((item) => (
    <ToastPrimitive.Root key={item.id} className={toastRootClass} swipeDirection="up" toast={item}>
      <span
        className="absolute top-full left-0 w-full"
        style={{ height: 'calc(var(--gap) + 1px)' }}
        aria-hidden
      />
      <div className="bg-popover/92 text-popover-foreground ring-foreground/8 dark:bg-popover/88 h-(--height) overflow-hidden rounded-lg border-0 shadow-none ring-1 backdrop-blur-md group-data-expanded/toast:h-[var(--toast-height)]">
        <ToastPrimitive.Content className="flex h-full items-center gap-2 overflow-hidden px-2.5 py-2 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-behind:opacity-0 data-expanded:opacity-100 motion-reduce:transition-none">
          <ToastIcon type={item.type} />
          <div className="flex min-w-0 flex-1 flex-col gap-0">
            {item.title && (
              <ToastPrimitive.Title className="text-[0.8125rem] leading-snug font-medium wrap-break-word" />
            )}
            {item.description && (
              <ToastPrimitive.Description className="text-muted-foreground text-[0.8125rem] leading-snug wrap-break-word" />
            )}
          </div>
          {item.actionProps ? (
            <ToastPrimitive.Action
              className={cn(
                'border-analysis-border/60 text-foreground hover:border-primary/40 shrink-0',
                'inline-flex min-h-7 items-center rounded-full border px-2.5 text-[0.8125rem] font-medium',
                'focus-visible:ring-primary/35 transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
              )}
            />
          ) : null}
          <ToastPrimitive.Close aria-label="Fermer" className={toastCloseClass}>
            <XIcon className="size-3.5" aria-hidden />
          </ToastPrimitive.Close>
        </ToastPrimitive.Content>
      </div>
    </ToastPrimitive.Root>
  ));
}

export function Toaster() {
  return (
    <ToastPrimitive.Provider limit={3} timeout={4000} toastManager={toastManager}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className={toastViewportClass}>
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
