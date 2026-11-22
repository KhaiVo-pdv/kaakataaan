// Translations. Spanish is the source language: every text is written in Spanish in the code,
// and t() looks it up in the chosen language's dictionary (js/i18n/<lang>.js), falling back to
// the Spanish. Texts with variable parts use {placeholders}: t('Turno de {name}', { name }).
// The engine stores its messages (history, errors) as { t, p } so every client shows them in
// its own language, online included.
import en from './i18n/en.js';
import vi from './i18n/vi.js';

// The menu offers English and Vietnamese only; the game opens in English unless the player picked one.
export const LANGS = [
  { id: 'en', name: 'English' },
  { id: 'vi', name: 'Tiếng Việt' },
];
// 'es' is the source text itself (no dictionary). It is not in the menu: only automated browser
// tests (navigator.webdriver) may still ask for it, because they look buttons up by their Spanish text.
const DICTS = { vi, en, es: {} };
const KEY = 'katanittes.lang';
const automated = () => !!(globalThis.navigator && globalThis.navigator.webdriver);

// the saved choice (English or Vietnamese), else English (Spanish when there is no browser: tests)
function detect() {
  if (!globalThis.document) return 'es';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'vi' || saved === 'en' || (saved === 'es' && automated())) return saved;
  } catch {}
  return 'en';
}

export let lang = detect();
if (globalThis.document) document.documentElement.lang = lang;

export function setLang(id) {
  if (!LANGS.some(l => l.id === id)) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  lang = id;
}

// values are put in as they are (player names stay untouched); a value that is itself an engine
// message ({ t, p }) is translated
export function t(s, p) {
  if (s == null) return '';
  let out = DICTS[lang][s] || s;
  if (p) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in p ? (p[k] && p[k].t ? tx(p[k]) : p[k]) : m));
  return out;
}

// marks a text kept in a module-level constant so the extractor finds it; translate it with t() when shown
export const tk = s => s;

// a message from the engine: a plain Spanish string or { t: template, p: values }. Its text values
// are engine words (an event or card name) and get translated too.
export function tx(m) {
  if (!m || typeof m !== 'object') return t(m);
  const p = {};
  for (const k in m.p || {}) p[k] = typeof m.p[k] === 'string' ? t(m.p[k]) : m.p[k];
  return t(m.t, p);
}
