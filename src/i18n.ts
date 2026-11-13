import { useSyncExternalStore } from 'react';
import en from './locales/en.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';
import ko from './locales/ko.json';
import zhTW from './locales/zh-TW.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import ptBR from './locales/pt-BR.json';

/** UI languages only. Note content, paths, and storage keys are never translated. */
export const LANGUAGE_INFO = {
  en: { name: 'English', locale: 'en-US' },
  ja: { name: '日本語', locale: 'ja-JP' },
  'zh-CN': { name: '简体中文', locale: 'zh-CN' },
  ko: { name: '한국어', locale: 'ko-KR' },
  'zh-TW': { name: '繁體中文', locale: 'zh-TW' },
  es: { name: 'Español', locale: 'es-ES' },
  de: { name: 'Deutsch', locale: 'de-DE' },
  fr: { name: 'Français', locale: 'fr-FR' },
  'pt-BR': { name: 'Português (Brasil)', locale: 'pt-BR' },
} as const;
export type Language = keyof typeof LANGUAGE_INFO;
export const LANGUAGES = Object.keys(LANGUAGE_INFO) as Language[];
export const DEFAULT_LANGUAGE: Language = 'en';
export function parseLanguage(value: unknown): Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGE_INFO, value)
    ? value as Language : DEFAULT_LANGUAGE;
}

/** Japanese source messages are stable identities, including numbered placeholders. */
export type MessageKey = keyof typeof ja;
const messages: Record<Language, Record<MessageKey, string>> = { en, ja, 'zh-CN': zhCN, ko, 'zh-TW': zhTW, es, de, fr, 'pt-BR': ptBR };
let currentLanguage: Language = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();
export const getLanguage = () => currentLanguage;
export function setLanguage(language: Language): void {
  if (language === currentLanguage) return;
  currentLanguage = language;
  for (const listener of listeners) listener();
}
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}
export function t(key: MessageKey, ...values: unknown[]): string {
  return messages[currentLanguage][key].replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}
export const locale = () => LANGUAGE_INFO[currentLanguage].locale;

// Explicit-language access for loading screens and settings.
const namedKeys = { language: '言語', english: '英語', japanese: '日本語', loading: '読み込み中…', save: '保存', cancel: 'キャンセル' } as const;
export type TranslationKey = keyof typeof namedKeys;
export function translate(language: Language, key: TranslationKey): string {
  return messages[language][namedKeys[key]];
}
