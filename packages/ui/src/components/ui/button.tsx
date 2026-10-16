import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@sharpit/app/lib/utils';

/** Pointer press only — keyboard Space/Enter must not scale. */
export const buttonTapScale = 'button-press';

const pointerHover = '[@media(hover:hover)_and_(pointer:fine)]';

const buttonVariants = cva(
  "button-hit button-motion group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:[stroke-width:1.5] [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Ink filled CTA — ink on light, near-white on dark (ADR-085) */
        default: `bg-foreground text-background ${pointerHover}:hover:bg-foreground/90`,
        outline: `border-foreground/55 bg-card text-foreground ${pointerHover}:hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-card dark:${pointerHover}:hover:bg-foreground/10`,
        /** Neutral chip — « +15 s » */
        secondary: `bg-chip-surface text-foreground ${pointerHover}:hover:bg-[color-mix(in_oklch,var(--chip-surface),var(--foreground)_5%)] aria-expanded:bg-chip-surface aria-expanded:text-foreground`,
        ghost: `${pointerHover}:hover:bg-muted ${pointerHover}:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:${pointerHover}:hover:bg-muted/50`,
        destructive: `bg-destructive text-destructive-foreground ${pointerHover}:hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40`,
        /** Lime — a positive live action (« Pause », « Valider ») */
        accent: `bg-highlight text-highlight-foreground font-semibold ${pointerHover}:hover:bg-highlight/90`,
        /** Alias of accent, kept for existing call sites */
        highlight: `bg-highlight text-highlight-foreground font-semibold ${pointerHover}:hover:bg-highlight/90`,
        /** « + Ajouter » — dashed outline, muted label */
        dashed: `border-dashed border-muted-foreground/40 text-muted-foreground ${pointerHover}:hover:bg-muted`,
        link: `text-primary underline-offset-4 ${pointerHover}:hover:underline`,
      },
      size: {
        /**
         * Visual height is instrument-dense at every viewport.
         * Coarse pointers get a 44px hit via `button-hit`, not a taller chrome.
         */
        default:
          'h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        /** The references' full-width action: 52px, 17px semibold */
        xl: 'h-13 w-full gap-2 px-5 text-[1.0625rem] font-semibold',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  static: isStatic = false,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Disable press scale when motion would distract (e.g. dense toolbars). */
    static?: boolean;
  }) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ variant, size }), !isStatic && buttonTapScale, className)}
      data-slot="button"
      {...props}
    />
  );
}

export { Button, buttonVariants };
