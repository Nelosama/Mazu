import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';
import pt from './locales/pt.json';

export const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];
const STORAGE_KEY = 'lang';

export function detectLanguage(): Lang {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored as Lang;
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'es';
  return (LANGUAGES.find((l) => l.code === nav)?.code ?? 'es') as Lang;
}

export function setLanguage(lang: string, persist = true) {
  const code = (LANGUAGES.find((l) => l.code === lang.slice(0, 2))?.code ?? 'es') as Lang;
  if (persist) localStorage.setItem(STORAGE_KEY, code);
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

/** Idioma explícito elegido por la persona (tiene prioridad sobre el del negocio). */
export const hasExplicitLanguage = () =>
  typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(STORAGE_KEY));

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en }, pt: { translation: pt } },
  lng: detectLanguage(),
  // El portugués está en preparación: las claves que falten caen al inglés.
  fallbackLng: { pt: ['en'], default: ['es'] },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
