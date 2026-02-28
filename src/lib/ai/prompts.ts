import { localeName } from "@/lib/asc/locale-names";

export interface FieldContext {
  field: string;
  appName?: string;
  charLimit?: number;
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  description: "app description",
  whatsNew: "release notes (what's new)",
  promotionalText: "promotional text",
  keywords: "App Store keywords (comma-separated)",
  name: "app name",
  subtitle: "app subtitle",
};

function fieldDesc(field: string): string {
  return FIELD_DESCRIPTIONS[field] ?? field;
}

/**
 * Hard constraint appended to every prompt to prevent conversational responses.
 * Models sometimes refuse or ask follow-up questions instead of producing output.
 */
const OUTPUT_CONSTRAINT = `

CRITICAL: You are a text-processing tool, not a conversational assistant.
- Output ONLY the final result text. No preamble, no explanation, no questions, no commentary.
- NEVER use markdown, HTML, or any formatting syntax. No **bold**, *italic*, #headings, bullet markers (use plain "- " or "• " only if the original does). The output is plain text for App Store Connect which does not render any markup.
- If the input is incomplete or looks like a placeholder, still produce a reasonable result.
- NEVER ask the user for clarification. NEVER refuse. NEVER explain what you did.
- Your entire response must be usable as-is in the App Store field.`;

export function buildTranslatePrompt(
  text: string,
  fromLocale: string,
  toLocale: string,
  context: FieldContext,
): string {
  const fromName = localeName(fromLocale);
  const toName = localeName(toLocale);
  const desc = fieldDesc(context.field);

  let prompt = `Translate the following ${desc} from ${fromName} (${fromLocale}) to ${toName} (${toLocale}).`;

  if (context.appName) {
    prompt += `\nThe app is called "${context.appName}".`;
  }
  if (context.charLimit) {
    prompt += `\nHARD LIMIT: The output MUST be ${context.charLimit} characters or fewer. This is a system constraint – longer output will be rejected. Count characters carefully. If needed, shorten the text to fit.`;
  }

  prompt += `

Rules:
- Preserve the original tone, formatting, and line breaks.
- Keep brand names, technical terms, and proper nouns untranslated unless they have an established localised form.
- For keywords: translate each keyword individually, keep them comma-separated, and optimise for local App Store search terms.`;

  prompt += OUTPUT_CONSTRAINT;

  prompt += `

Text to translate:
${text}`;

  return prompt;
}

// --- Keyword-specific prompts ---

export function buildGenerateKeywordsPrompt(
  locale: string,
  context: FieldContext & { description?: string },
): string {
  const locName = localeName(locale);

  let prompt = `Generate a high-impact set of App Store keywords for ${locName} (${locale}).`;

  if (context.appName) {
    prompt += `\nThe app is called "${context.appName}".`;
  }
  if (context.description) {
    prompt += `\n\nApp description for context:\n${context.description}`;
  }

  const kwLimit = context.charLimit ?? 100;

  prompt += `

Rules:
- Return comma-separated keywords with NO spaces after commas (e.g. "weather,forecast,rain,temperature").
- Use single words where possible – Apple's algorithm combines them automatically.
- Do NOT include words that would appear in the app name or subtitle – Apple auto-indexes those.
- Do NOT include stop words ("app", "the", "best", "free", etc.).
- Do NOT include plurals – Apple handles pluralisation automatically.
- Focus on terms that real users in ${locName}-speaking markets would search for.
- HARD LIMIT: The output MUST be ${kwLimit} characters or fewer. This is a system constraint – longer output will be rejected. Maximise the budget but never exceed it.`;

  prompt += OUTPUT_CONSTRAINT;

  return prompt;
}

export function buildOptimizeKeywordsPrompt(
  keywords: string,
  locale: string,
  context: FieldContext & { description?: string },
): string {
  const locName = localeName(locale);

  let prompt = `Optimise the following App Store keywords for ${locName} (${locale}).`;

  if (context.appName) {
    prompt += `\nThe app is called "${context.appName}".`;
  }
  if (context.description) {
    prompt += `\n\nApp description for context:\n${context.description}`;
  }

  prompt += `

Current keywords:
${keywords}

Tasks:
- Remove any words already present in the app name (they are auto-indexed).
- Remove stop words ("app", "the", "best", "free", etc.) – Apple ignores them.
- Remove plural forms – Apple handles pluralisation automatically.
- Remove spaces after commas to save characters.
- Replace low-impact or generic terms with more specific, high-search-volume alternatives.
- Keep terms comma-separated with NO spaces after commas.
- HARD LIMIT: The output MUST be ${context.charLimit ?? 100} characters or fewer. This is a system constraint – longer output will be rejected. Maximise the budget but never exceed it.`;

  prompt += OUTPUT_CONSTRAINT;

  return prompt;
}

export function buildFillKeywordGapsPrompt(
  currentKeywords: string,
  locale: string,
  otherLocaleKeywords: Record<string, string>,
  context: FieldContext,
): string {
  const locName = localeName(locale);

  let prompt = `Analyse App Store keywords across locales and fill gaps for ${locName} (${locale}).`;

  if (context.appName) {
    prompt += `\nThe app is called "${context.appName}".`;
  }

  prompt += `

Current keywords for ${locName}:
${currentKeywords || "(empty)"}

Keywords in other locales:`;

  for (const [loc, kw] of Object.entries(otherLocaleKeywords)) {
    prompt += `\n- ${localeName(loc)} (${loc}): ${kw}`;
  }

  prompt += `

Tasks:
- Identify concepts covered in other locales but missing from the ${locName} keywords.
- Add equivalent ${locName}-language terms for those missing concepts.
- Do NOT simply translate – find terms that users in ${locName}-speaking markets actually search for.
- Do NOT duplicate words already present in the current keywords or app name.
- Keep terms comma-separated with NO spaces after commas.
- HARD LIMIT: The output MUST be ${context.charLimit ?? 100} characters or fewer. This is a system constraint – longer output will be rejected. Maximise the budget but never exceed it.`;

  prompt += OUTPUT_CONSTRAINT;

  return prompt;
}

export function buildImprovePrompt(
  text: string,
  locale: string,
  context: FieldContext,
): string {
  const locName = localeName(locale);
  const desc = fieldDesc(context.field);

  let prompt = `Improve the following ${desc} written in ${locName} (${locale}).`;

  if (context.appName) {
    prompt += `\nThe app is called "${context.appName}".`;
  }
  if (context.charLimit) {
    prompt += `\nHARD LIMIT: The output MUST be ${context.charLimit} characters or fewer. This is a system constraint – longer output will be rejected. Count characters carefully. If needed, shorten the text to fit.`;
  }

  prompt += `

Goals:
- Improve clarity, readability, and persuasiveness.
- Strengthen call-to-action language where appropriate.
- Optimise for App Store search discoverability (keyword density).
- Preserve the original meaning, tone, and formatting.
- Preserve the original length and structure – do not drastically expand or shorten the text.`;

  prompt += OUTPUT_CONSTRAINT;

  prompt += `

Original text:
${text}`;

  return prompt;
}
