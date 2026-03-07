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
- Keep brand names, technical terms, and proper nouns untranslated unless they have an established localised form.`;

  if (context.field === "keywords") {
    prompt += `\n- Translate each keyword individually, keep them comma-separated, and optimise for local App Store search terms.`;
  }

  prompt += OUTPUT_CONSTRAINT;

  prompt += `

Text to translate:
${text}`;

  return prompt;
}

// --- Keyword-specific prompts ---

export function buildFixKeywordsPrompt(
  cleanedKeywords: string,
  locale: string,
  forbiddenWords: string[],
  context: FieldContext & { description?: string; subtitle?: string },
): string {
  const locName = localeName(locale);
  const kwLimit = context.charLimit ?? 100;
  const currentLen = cleanedKeywords.length;

  let prompt = `App Store keywords for ${locName} (${locale}).`;
  if (context.appName) prompt += ` App: "${context.appName}".`;
  if (context.subtitle) prompt += ` Subtitle: "${context.subtitle}".`;

  if (context.description) {
    // Truncate description to keep prompt focused
    const desc = context.description.length > 500
      ? context.description.slice(0, 500) + "..."
      : context.description;
    prompt += `\n\nApp description for context:\n${desc}`;
  }

  if (cleanedKeywords) {
    prompt += `\n\nKeep these: ${cleanedKeywords}`;
  }

  prompt += `\n\nForbidden (already indexed elsewhere): ${forbiddenWords.join(", ") || "none"}`;

  // Estimate how many more keywords can fit (avg keyword length + comma)
  const currentKeywords = cleanedKeywords ? cleanedKeywords.split(",").filter(Boolean) : [];
  const avgLen = currentKeywords.length > 0
    ? Math.ceil(currentKeywords.reduce((sum, kw) => sum + kw.length, 0) / currentKeywords.length)
    : 3;
  const freeChars = kwLimit - currentLen;
  const moreCount = Math.max(1, Math.floor(freeChars / (avgLen + 1)));

  prompt += `

Task: produce a single comma-separated keyword string in ${locName} that is close to ${kwLimit} characters (currently ${currentLen}). Add at least ${moreCount} more keywords.
Rules: no spaces (Apple indexes words individually so "clipboard history" wastes a character vs "clipboard,history"), no stop words, no plurals, no forbidden words.
1 CJK character = 1 character, not 3.
Target length: ${Math.floor(kwLimit * 0.9)}–${kwLimit} characters.

Respond with ONLY the keyword string. No other text, no reasoning, no explanation.`;

  return prompt;
}

// --- Review reply / appeal prompts ---

export function buildReplyPrompt(
  reviewTitle: string,
  reviewBody: string,
  rating: number,
  appName?: string,
): string {
  let prompt = `Write a professional developer response to the following App Store review (${rating}-star rating).`;

  if (appName) {
    prompt += `\nThe app is called "${appName}".`;
  }

  prompt += `

Rules:
- Be polite but succinct – 2 to 3 short sentences maximum.
- Do not invent support e-mail details or anything you don't know for sure.
- Use en dashes (–), never em dashes (—).
- Plain text only – no markdown, no HTML, no formatting syntax.`;

  prompt += OUTPUT_CONSTRAINT;

  prompt += `

Review title: ${reviewTitle}
Review body: ${reviewBody}`;

  return prompt;
}

export function buildAppealPrompt(
  reviewTitle: string,
  reviewBody: string,
  rating: number,
  appName?: string,
): string {
  let prompt = `Write an appeal text to submit to Apple for the following App Store review (${rating}-star rating) that may violate App Store Review Guidelines.`;

  if (appName) {
    prompt += `\nThe app is called "${appName}".`;
  }

  prompt += `

Rules:
- Be factual and professional – this is addressed to the App Store review team.
- Explain why the review may violate Apple's App Store Review Guidelines (e.g. spam, offensive content, irrelevant, competitor sabotage, factually incorrect claims).
- Reference specific guideline sections where applicable.
- Do NOT be aggressive or accusatory – present evidence calmly.
- Keep the appeal concise and focused.
- Use en dashes (–), never em dashes (—).
- Plain text only – no markdown, no HTML, no formatting syntax.`;

  prompt += OUTPUT_CONSTRAINT;

  prompt += `

Review title: ${reviewTitle}
Review body: ${reviewBody}`;

  return prompt;
}

// --- Review insights prompt ---

export function buildInsightsPrompt(
  reviews: Array<{ rating: number; title: string; body: string }>,
  appName?: string,
): string {
  let prompt = `Analyse the following ${reviews.length} App Store customer reviews and extract the key strengths and weaknesses.`;

  if (appName) {
    prompt += `\nThe app is called "${appName}".`;
  }

  prompt += `

Rules:
- Return 3–7 strengths (things users love) and 3–7 weaknesses (things users dislike or want improved).
- Each point should be a short phrase (3–8 words), not a full sentence.
- Order by frequency – most commonly mentioned first.
- The "mentions" count is how many reviews mention that theme.
- Only include a point if at least 2 reviews mention it, unless there are fewer than 10 reviews total.
- Do NOT invent issues that aren't in the reviews.
- Do NOT include generic filler like "some users want more features".

Reviews:
`;

  for (const r of reviews) {
    prompt += `[${r.rating}/5] ${r.title}: ${r.body}\n\n`;
  }

  return prompt;
}

export function buildIncrementalInsightsPrompt(
  newReviews: Array<{ rating: number; title: string; body: string }>,
  existingInsights: {
    strengths: Array<{ point: string; mentions: number }>;
    weaknesses: Array<{ point: string; mentions: number }>;
  },
  totalReviewCount: number,
): string {
  let prompt = `You previously analysed ${totalReviewCount - newReviews.length} App Store reviews and produced these insights:\n\n`;

  prompt += `Strengths:\n`;
  for (const s of existingInsights.strengths) {
    prompt += `- ${s.point} (${s.mentions} mentions)\n`;
  }
  prompt += `\nWeaknesses:\n`;
  for (const w of existingInsights.weaknesses) {
    prompt += `- ${w.point} (${w.mentions} mentions)\n`;
  }

  prompt += `\nNow ${newReviews.length} new review${newReviews.length !== 1 ? "s have" : " has"} come in. Update the insights based on these new reviews.

Rules:
- Merge new themes into the existing list or increment mention counts for existing themes.
- Add new points only if the new reviews introduce a genuinely new theme.
- Remove points that no longer apply given the full picture.
- Keep 3–7 strengths and 3–7 weaknesses, ordered by frequency.
- Each point should be a short phrase (3–8 words).
- The "mentions" count reflects total mentions across ALL ${totalReviewCount} reviews (existing + new).
- Do NOT invent issues that aren't in the reviews.

New reviews:
`;

  for (const r of newReviews) {
    prompt += `[${r.rating}/5] ${r.title}: ${r.body}\n\n`;
  }

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
