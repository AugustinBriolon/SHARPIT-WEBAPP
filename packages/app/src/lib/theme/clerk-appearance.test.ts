import { describe, expect, it } from 'vitest';

import { BRAND } from '@sharpit/app/lib/brand/brand-tokens';
import { authAppearance, clerkAppearance } from '@sharpit/app/lib/theme/clerk-appearance';

describe('clerkAppearance theme bridge', () => {
  it('binds app-wide color tokens to semantic CSS variables', () => {
    const { variables } = clerkAppearance;

    expect(variables.colorPrimary).toBe('var(--primary)');
    expect(variables.colorPrimaryForeground).toBe('var(--primary-foreground)');
    expect(variables.colorBackground).toBe('var(--card)');
    expect(variables.colorForeground).toBe('var(--card-foreground)');
    expect(variables.colorMutedForeground).toBe('var(--muted-foreground)');
    expect(variables.colorInput).toBe('var(--card)');
    expect(variables.colorBorder).toBe('var(--border)');
    expect(variables.borderRadius).toBe(BRAND.radius);
  });

  it('does not hard-code Forest Depths as Clerk primary (illegible on dark)', () => {
    const values = Object.values(clerkAppearance.variables);
    expect(values).not.toContain(BRAND.forestDepths);
    expect(values.some((v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v))).toBe(false);
  });
});

describe('authAppearance lecture-critique override', () => {
  it('scopes stricter text/input tokens to --auth-* (not global muted)', () => {
    const { variables } = authAppearance;

    expect(variables.colorForeground).toBe('var(--auth-foreground)');
    expect(variables.colorText).toBe('var(--auth-foreground)');
    expect(variables.colorMutedForeground).toBe('var(--auth-muted)');
    expect(variables.colorTextSecondary).toBe('var(--auth-muted)');
    expect(variables.colorInput).toBe('var(--auth-input-bg)');
    expect(variables.colorInputText).toBe('var(--auth-foreground)');
    expect(variables.colorInputForeground).toBe('var(--auth-foreground)');
    expect(variables.colorBorder).toBe('var(--auth-input-border)');
    expect(variables.colorMuted).toBe('var(--card)');
    expect(variables.colorMutedForeground).not.toBe('var(--muted-foreground)');
  });

  it('keeps auth chrome branding in AuthShell (hides Clerk header/logo)', () => {
    expect(authAppearance.elements.headerTitle).toBe('hidden');
    expect(authAppearance.elements.headerSubtitle).toBe('hidden');
    expect(authAppearance.elements.logoBox).toBe('hidden');
  });

  it('uses auth-surface utilities for inputs, panels, and ink CTA', () => {
    expect(authAppearance.elements.cardBox).toContain('bg-transparent');
    expect(authAppearance.elements.input).toContain('bg-auth-input!');
    expect(authAppearance.elements.input).toContain('dark:bg-[color:var(--auth-input-bg)]!');
    expect(authAppearance.elements.formFieldInput).toContain('bg-auth-input!');
    expect(authAppearance.elements.formFieldInput).toContain('border-auth-input');
    expect(authAppearance.elements.formFieldInput).toContain('placeholder:text-auth-placeholder!');
    expect(authAppearance.elements.formFieldHintText).toBe('text-auth-muted');
    expect(authAppearance.elements.formButtonPrimary).toContain('bg-foreground!');
    expect(authAppearance.elements.formButtonPrimary).toContain('text-background!');
    expect(authAppearance.elements.formFieldErrorText).toBe('text-destructive!');
  });
});
