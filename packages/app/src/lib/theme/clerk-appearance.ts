import { shadcn } from '@clerk/themes';

import { BRAND } from '@sharpit/app/lib/brand/brand-tokens';

/**
 * App-wide Clerk bridge (UserButton, etc.).
 * Semantic CSS vars only — follows `.dark` without hard-coded Forest primary.
 * Auth pages use {@link authAppearance} for stricter « lecture critique » contrast.
 */
const clerkColorVariables = {
  colorPrimary: 'var(--primary)',
  colorPrimaryForeground: 'var(--primary-foreground)',
  colorBackground: 'var(--card)',
  colorForeground: 'var(--card-foreground)',
  colorMuted: 'var(--muted)',
  colorMutedForeground: 'var(--muted-foreground)',
  /** Solid fill — white card plate, not canvas Snow White. */
  colorInput: 'var(--card)',
  colorInputForeground: 'var(--card-foreground)',
  colorNeutral: 'var(--foreground)',
  colorBorder: 'var(--border)',
  colorRing: 'var(--ring)',
  colorDanger: 'var(--destructive)',
} as const;

const sharedElements = {
  rootBox: 'mx-auto w-full max-w-[420px]',
  cardBox: 'shadow-none border border-foreground/15 rounded-none bg-transparent',
  card: 'rounded-none border-0 bg-transparent shadow-none gap-4',
  header: 'gap-1',
  headerTitle: 'font-heading text-lg font-semibold tracking-tight text-foreground',
  headerSubtitle: 'text-sm text-muted-foreground',
  socialButtonsBlockButton:
    'rounded-lg border border-border bg-card text-foreground shadow-none hover:bg-muted/60',
  socialButtonsBlockButtonText: 'font-medium text-foreground',
  formButtonPrimary: 'rounded-lg bg-foreground text-background shadow-none hover:bg-foreground/90',
  formFieldInput:
    'rounded-lg border border-input bg-card text-foreground shadow-none focus:ring-2 focus:ring-ring/30',
  formFieldLabel: 'font-medium text-foreground',
  footerActionLink: 'text-primary hover:text-primary/80 font-medium',
  identityPreviewEditButton: 'text-primary',
  dividerLine: 'bg-border',
  dividerText: 'text-muted-foreground text-xs uppercase tracking-wider',
  navbar: 'hidden',
  footer: 'bg-transparent',
  footerActionText: 'text-muted-foreground',
  formFieldAction: 'text-primary',
  otpCodeFieldInput: 'rounded-lg border border-input bg-card text-foreground',
  alertText: 'text-foreground',
  formResendCodeLink: 'text-primary',
  userButtonPopoverCard: 'rounded-xl border border-border bg-card shadow-none',
  userButtonPopoverActionButton: 'hover:bg-muted/60',
  userButtonPopoverActionButtonText: 'text-foreground',
  userPreviewMainIdentifier: 'font-medium text-foreground',
  userPreviewSecondaryIdentifier: 'text-muted-foreground',
  userButtonPopoverFooter: 'hidden',
} as const;

export const clerkAppearance = {
  theme: shadcn,
  variables: {
    ...clerkColorVariables,
    borderRadius: BRAND.radius,
    fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
    fontSize: '0.875rem',
  },
  elements: sharedElements,
};

/**
 * Sign-in / sign-up only — « lecture critique » contrast (WCAG AA).
 * Requires an ancestor with `.auth-surface` (AuthShell) so --auth-* vars resolve.
 * Does not retune global theme tokens.
 */
const authColorVariables = {
  ...clerkColorVariables,
  colorForeground: 'var(--auth-foreground)',
  /** @deprecated alias — Clerk still reads this in some builds */
  colorText: 'var(--auth-foreground)',
  colorMutedForeground: 'var(--auth-muted)',
  /** @deprecated alias */
  colorTextSecondary: 'var(--auth-muted)',
  colorInput: 'var(--auth-input-bg)',
  colorInputForeground: 'var(--auth-foreground)',
  /** @deprecated alias */
  colorInputText: 'var(--auth-foreground)',
  colorBorder: 'var(--auth-input-border)',
  /** Keep muted wash off the page canvas — use card, not near-bg muted */
  colorMuted: 'var(--card)',
  colorNeutral: 'var(--auth-foreground)',
} as const;

const authElements = {
  ...sharedElements,
  headerTitle: 'hidden',
  headerSubtitle: 'hidden',
  logoBox: 'hidden',
  footer: 'bg-transparent pt-2',
  cardBox: 'shadow-none border-0 rounded-none bg-transparent',
  socialButtonsBlockButton:
    'rounded-lg border border-auth-input bg-auth-input text-foreground! shadow-none hover:bg-muted/60',
  socialButtonsBlockButtonText: 'font-medium text-foreground!',
  /**
   * Ink CTA — Snow fill + Forest text on dark (≥ 4.5:1). Forces over Clerk
   * solid primary paint (Lime would also pass; ink matches Seed filled CTA).
   */
  formButtonPrimary:
    'rounded-lg bg-foreground! text-background! shadow-none hover:bg-foreground/90!',
  /** Beat shadcn theme `input: dark:bg-input/30` so auth fill stays distinct */
  input:
    'bg-auth-input! border-auth-input! text-foreground! placeholder:text-auth-placeholder! dark:bg-[color:var(--auth-input-bg)]! dark:border-[color:var(--auth-input-border)]! dark:text-[color:var(--auth-foreground)]! dark:placeholder:text-[color:var(--auth-placeholder)]!',
  formFieldInput:
    'rounded-lg border border-auth-input bg-auth-input! text-foreground! placeholder:text-auth-placeholder! shadow-none focus:ring-2 focus:ring-ring/40 dark:bg-[color:var(--auth-input-bg)]! dark:border-[color:var(--auth-input-border)]! dark:text-[color:var(--auth-foreground)]! dark:placeholder:text-[color:var(--auth-placeholder)]!',
  formFieldLabel: 'font-medium text-foreground!',
  formFieldHintText: 'text-auth-muted',
  formFieldErrorText: 'text-destructive!',
  formFieldSuccessText: 'text-foreground',
  formFieldInputShowPasswordButton: 'text-auth-muted hover:text-foreground',
  footerActionLink: 'text-primary! hover:text-primary/80 font-medium',
  identityPreviewEditButton: 'text-primary!',
  identityPreviewText: 'text-foreground!',
  dividerLine: 'bg-auth-divider',
  dividerText: 'text-auth-muted text-xs uppercase tracking-wider',
  footerActionText: 'text-auth-muted',
  formFieldAction: 'text-primary!',
  otpCodeFieldInput: 'rounded-lg border border-auth-input bg-auth-input text-foreground!',
  alertText: 'text-foreground!',
  alertText__danger: 'text-destructive!',
  formResendCodeLink: 'text-primary!',
  alternativeMethodsBlockButton:
    'rounded-lg border border-auth-input bg-auth-input text-foreground! shadow-none hover:bg-muted/60',
  alternativeMethodsBlockButtonText: 'font-medium text-foreground!',
} as const;

export const authAppearance = {
  theme: shadcn,
  variables: {
    ...authColorVariables,
    borderRadius: BRAND.radius,
    fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
    fontSize: '0.875rem',
  },
  elements: authElements,
};
