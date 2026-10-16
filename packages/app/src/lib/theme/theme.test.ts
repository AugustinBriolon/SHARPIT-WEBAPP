import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '@sharpit/app/lib/brand/brand-tokens';
import {
  THEME_DARK_COLOR,
  THEME_LIGHT_COLOR,
  THEME_STORAGE_KEY,
  readStoredThemePreference,
} from '@sharpit/app/lib/theme/theme';

/**
 * Minimal window + document.cookie shim — matches how THEME_INIT_SCRIPT and
 * readStoredThemePreference read preference without pulling in jsdom.
 */
function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
}

let cookieJar = '';

beforeEach(() => {
  cookieJar = '';
  vi.stubGlobal('window', { localStorage: createStorageMock() });
  vi.stubGlobal('document', {
    get cookie() {
      return cookieJar;
    },
    set cookie(value: string) {
      const [pair] = value.split(';');
      const [rawKey, ...rest] = pair.split('=');
      const key = rawKey.trim();
      const encoded = rest.join('=');
      if (value.includes('max-age=0')) {
        cookieJar = cookieJar
          .split('; ')
          .filter((part) => part && !part.startsWith(`${key}=`))
          .join('; ');
        return;
      }
      const next = `${key}=${encoded}`;
      const others = cookieJar.split('; ').filter((part) => part && !part.startsWith(`${key}=`));
      cookieJar = [...others, next].filter(Boolean).join('; ');
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme-color canvas tokens', () => {
  it('matches brand page canvases (Craft HTML background)', () => {
    expect(THEME_LIGHT_COLOR).toBe(BRAND.canvas);
    expect(THEME_DARK_COLOR).toBe(BRAND.canvasDark);
  });
});

describe('readStoredThemePreference', () => {
  it('prefers localStorage over the cookie', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.cookie = `${THEME_STORAGE_KEY}=light;path=/`;
    expect(readStoredThemePreference()).toBe('dark');
  });

  it('falls back to the cookie when localStorage is empty (parity with THEME_INIT_SCRIPT)', () => {
    document.cookie = `${THEME_STORAGE_KEY}=system;path=/`;
    expect(readStoredThemePreference()).toBe('system');
  });

  it('defaults to system when neither store has a valid preference', () => {
    expect(readStoredThemePreference()).toBe('system');
  });
});
