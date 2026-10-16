import { BRAND } from '@sharpit/app/lib/brand/brand-tokens';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sharpit-theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Must match `html` / `--background` so overscroll + theme-color paint the same canvas. */
export const THEME_LIGHT_COLOR = BRAND.canvas;
export const THEME_DARK_COLOR = BRAND.canvasDark;

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) {
      return stored;
    }
  } catch {
    // Ignore quota / private mode errors — fall through to cookie.
  }
  // Match THEME_INIT_SCRIPT: cookie is the fallback when localStorage is empty.
  return readThemePreferenceFromDocumentCookie() ?? 'system';
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return getSystemTheme();
  }
  return preference;
}

/** SSR-safe resolve when system preference is unknown (no window). */
export function resolveThemeForPreference(
  preference: ThemePreference,
  systemFallback: ResolvedTheme = 'light',
): ResolvedTheme {
  if (preference === 'system') {
    return systemFallback;
  }
  return preference;
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? THEME_DARK_COLOR : THEME_LIGHT_COLOR);
  }
}

function readThemePreferenceFromCookieString(
  cookieHeader: string | null | undefined,
): ThemePreference | null {
  if (!cookieHeader) {
    return null;
  }
  const match = cookieHeader.match(new RegExp(`(?:^|; )${THEME_STORAGE_KEY}=([^;]*)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isThemePreference(value) ? value : null;
}

export function readThemePreferenceFromDocumentCookie(): ThemePreference | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return readThemePreferenceFromCookieString(document.cookie);
}

export function syncThemeCookie(preference: ThemePreference): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${THEME_STORAGE_KEY}=${encodeURIComponent(preference)};path=/;max-age=${THEME_COOKIE_MAX_AGE};SameSite=Lax`;
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore quota / private mode errors.
  }
  syncThemeCookie(preference);
}

/** Inline script executed before paint to avoid theme FOUC. */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var p=localStorage.getItem(k);if(!(p==='light'||p==='dark'||p==='system')){var c=document.cookie.match(new RegExp('(?:^|; )'+k+'=([^;]*)'));p=c?decodeURIComponent(c[1]):null;}var pref=p==='light'||p==='dark'||p==='system'?p:'system';var dark=pref==='dark'||(pref==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',dark);r.style.colorScheme=dark?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',dark?'${THEME_DARK_COLOR}':'${THEME_LIGHT_COLOR}');document.cookie=k+'='+encodeURIComponent(pref)+';path=/;max-age=${THEME_COOKIE_MAX_AGE};SameSite=Lax';}catch(e){}})();`;
