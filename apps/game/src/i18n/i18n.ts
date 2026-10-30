import { DEFAULT_LOCALE, isLocale, type Locale } from '@lsg/shared';
import en from './locales/en.json';

/**
 * Minimal i18n layer. All player-facing text lives in locale JSON files.
 * - Keys are dot paths into the JSON tree: t('menu.play').
 * - Parameters use {name} placeholders: t('hud.wave', { n: 3 }).
 * - Plurals: a key whose value is an object with Intl.PluralRules categories
 *   ({ "one": "...", "other": "..." }) is selected by the `count` parameter.
 * English is bundled and acts as the fallback; other locales load lazily.
 */
type Messages = { [key: string]: string | Messages };

const loaders: Record<Locale, () => Promise<Messages>> = {
  en: async () => en as Messages,
  de: async () => (await import('./locales/de.json')).default as Messages,
};

const STORAGE_KEY = 'lsg.locale';

let currentLocale: Locale = DEFAULT_LOCALE;
let messages: Messages = en as Messages;
const fallback: Messages = en as Messages;
const listeners = new Set<() => void>();

function lookup(tree: Messages, key: string): string | Messages | undefined {
  let node: string | Messages | undefined = tree;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

function interpolate(template: string, params: Record<string, string | number> | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

export function t(key: string, params?: Record<string, string | number>): string {
  let value = lookup(messages, key) ?? lookup(fallback, key);
  if (value !== undefined && typeof value !== 'string') {
    const count = typeof params?.count === 'number' ? params.count : 0;
    const category = new Intl.PluralRules(currentLocale).select(count);
    const variant = value[category] ?? value.other;
    value = typeof variant === 'string' ? variant : undefined;
  }
  if (typeof value !== 'string') {
    if (import.meta.env?.DEV) console.warn(`Missing translation: ${key}`);
    return key;
  }
  return interpolate(value, params);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale, options).format(value);
}

/** Compact large numbers for in-world labels: 12.5K, 3.2M. */
export function formatCompact(value: number): string {
  if (Math.abs(value) < 10000) return formatNumber(Math.round(value));
  return new Intl.NumberFormat(currentLocale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function getLocale(): Locale {
  return currentLocale;
}

export async function setLocale(locale: Locale): Promise<void> {
  messages = await loaders[locale]();
  currentLocale = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this session only.
  }
  for (const listener of listeners) listener();
}

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Picks the stored locale, else the browser language, else English. */
export async function initLocale(): Promise<void> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable; fall through to browser language.
  }
  const browser = navigator.language.slice(0, 2).toLowerCase();
  const locale = isLocale(stored) ? stored : isLocale(browser) ? browser : DEFAULT_LOCALE;
  await setLocale(locale);
}
