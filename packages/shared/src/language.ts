export type SupportedLanguageCode = 'en' | 'ur' | 'hi' | 'fi' | 'mixed' | 'unknown';
export type TextDirection = 'ltr' | 'rtl';

export interface SupportedLanguage {
  code: SupportedLanguageCode;
  label: string;
  nativeLabel: string;
  direction: TextDirection;
}

export const supportedLanguages: SupportedLanguage[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', direction: 'ltr' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', direction: 'rtl' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', direction: 'ltr' },
  { code: 'fi', label: 'Finnish', nativeLabel: 'Suomi', direction: 'ltr' },
  { code: 'mixed', label: 'Mixed', nativeLabel: 'Mixed', direction: 'ltr' },
  { code: 'unknown', label: 'Unknown', nativeLabel: 'Unknown', direction: 'ltr' },
];

const rtlPattern = /[\u0600-\u06ff]/;
const devanagariPattern = /[\u0900-\u097f]/;
const finnishHints = /\b(ja|että|mutta|kokous|päätös|tehtävä|huomenna|kiitos|asiakas|tiimi)\b/i;
const romanUrduHindiHints = /\b(kal|hai|haan|nahi|theek|meeting|yaar|karna|karo|mat|bhai)\b/i;

export function getLanguage(code: SupportedLanguageCode): SupportedLanguage {
  return supportedLanguages.find((language) => language.code === code) ?? supportedLanguages[5];
}

export function detectDirection(text: string): TextDirection {
  return rtlPattern.test(text) ? 'rtl' : 'ltr';
}

export function detectLanguage(text: string): SupportedLanguageCode {
  const trimmed = text.trim();

  if (!trimmed) {
    return 'unknown';
  }

  const hasRtl = rtlPattern.test(trimmed);
  const hasDevanagari = devanagariPattern.test(trimmed);
  const hasAsciiWords = /[a-z]/i.test(trimmed);

  if ((hasRtl || hasDevanagari) && hasAsciiWords) {
    return 'mixed';
  }

  if (hasRtl) {
    return 'ur';
  }

  if (hasDevanagari) {
    return 'hi';
  }

  if (finnishHints.test(trimmed)) {
    return 'fi';
  }

  if (romanUrduHindiHints.test(trimmed)) {
    return 'mixed';
  }

  return 'en';
}
