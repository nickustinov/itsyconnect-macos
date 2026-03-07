/**
 * Shared utilities for App Store keyword analysis.
 * Used by magic wand, fix-all dialog, add-locale dialog, and keyword tips.
 */

/** Split text into lowercase words (min 2 chars), splitting on whitespace and common separators. */
export function splitMetaWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const w of text.toLowerCase().split(/[\s\-–/&,]+/)) {
    const trimmed = w.trim();
    if (trimmed.length > 1) words.add(trimmed);
  }
  return words;
}

/**
 * Build a forbidden words list for keyword generation/fixing.
 * Includes: app name words, subtitle words, and all other locales' keywords.
 */
export function buildForbiddenKeywords(opts: {
  appName?: string;
  subtitle?: string;
  /** Other locales' keywords as comma-separated strings. */
  otherLocaleKeywords?: Record<string, string> | string[];
}): string[] {
  const forbidden = new Set<string>();

  if (opts.appName) {
    for (const w of splitMetaWords(opts.appName)) {
      forbidden.add(w);
    }
  }
  if (opts.subtitle) {
    for (const w of splitMetaWords(opts.subtitle)) {
      forbidden.add(w);
    }
  }

  if (opts.otherLocaleKeywords) {
    const values = Array.isArray(opts.otherLocaleKeywords)
      ? opts.otherLocaleKeywords
      : Object.values(opts.otherLocaleKeywords);
    for (const raw of values) {
      for (const w of raw.split(",")) {
        const trimmed = w.trim().toLowerCase();
        if (trimmed) forbidden.add(trimmed);
      }
    }
  }

  return [...forbidden];
}
