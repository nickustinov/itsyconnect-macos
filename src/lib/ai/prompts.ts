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

/**
 * Ask the model to shorten an over-limit result to fit a character budget,
 * preserving meaning, tone, and language. Used as a one-shot recovery pass
 * before the app reports a translation as too long.
 */
export function buildShortenPrompt(
  text: string,
  charLimit: number,
  field: string,
): string {
  const desc = fieldDesc(field);

  let prompt = `The following ${desc} is ${text.length} characters, but the hard limit is ${charLimit} characters.`;
  prompt += `\nRewrite it to be ${charLimit} characters or fewer while preserving the meaning, language, tone, and formatting. Condense or drop the least important content. Do not add new information or translate it to another language.`;

  prompt += OUTPUT_CONSTRAINT;

  prompt += `

Text to shorten:
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
  let prompt = `Here are the App Store Connect ratings for the app.`;

  if (appName) {
    prompt += ` The app is called "${appName}".`;
  }

  prompt += ` Extract three lists with at most 10 bullet points each for "Strengths", "Weaknesses" and "Potential" (growth & improvements). Only include points that are directly supported by the reviews provided – do not invent or assume anything. Do not repeat similar points inside categories.

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
    strengths: string[];
    weaknesses: string[];
    potential: string[];
  },
  totalReviewCount: number,
): string {
  let prompt = `You previously analysed ${totalReviewCount - newReviews.length} App Store reviews and produced these insights:\n\n`;

  prompt += `Strengths:\n`;
  for (const s of existingInsights.strengths) {
    prompt += `- ${s}\n`;
  }
  prompt += `\nWeaknesses:\n`;
  for (const w of existingInsights.weaknesses) {
    prompt += `- ${w}\n`;
  }
  prompt += `\nPotential:\n`;
  for (const p of existingInsights.potential) {
    prompt += `- ${p}\n`;
  }

  prompt += `\nNow ${newReviews.length} new review${newReviews.length !== 1 ? "s have" : " has"} come in. Update the three lists (strengths, weaknesses, potential) with at most 10 bullet points each.

New reviews:
`;

  for (const r of newReviews) {
    prompt += `[${r.rating}/5] ${r.title}: ${r.body}\n\n`;
  }

  return prompt;
}

// --- Analytics insights prompt ---

interface AnalyticsDataForPrompt {
  dailyDownloads: Array<{ date: string; firstTime: number; redownload: number; update: number }>;
  dailyRevenue: Array<{ date: string; proceeds: number; sales: number }>;
  dailyEngagement: Array<{ date: string; impressions: number; pageViews: number }>;
  dailySessions: Array<{ date: string; sessions: number; uniqueDevices: number; avgDuration: number }>;
  dailyInstallsDeletes: Array<{ date: string; installs: number; deletes: number }>;
  dailyDownloadsBySource: Array<{ date: string; search: number; browse: number; webReferrer: number; unavailable: number }>;
  dailyTerritoryDownloads: Array<{ date: string; code: string; downloads: number }>;
  dailyCrashes: Array<{ date: string; crashes: number; uniqueDevices: number }>;
  territories: Array<{ territory: string; code: string; downloads: number; revenue: number }>;
  discoverySources: Array<{ source: string; count: number }>;
  crashesByVersion: Array<{ version: string; platform: string; crashes: number; uniqueDevices: number }>;
}

function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}

/**
 * Summarise analytics data into a compact text block for the AI.
 * We send aggregated stats + recent daily trends, not raw per-day data,
 * to keep token usage reasonable.
 */
function summariseAnalytics(data: AnalyticsDataForPrompt): string {
  const lines: string[] = [];
  const days = data.dailyDownloads.length;

  if (days === 0) return "No data available.";

  const firstDate = data.dailyDownloads[0].date;
  const lastDate = data.dailyDownloads[days - 1].date;
  lines.push(`Period: ${firstDate} to ${lastDate} (${days} days)`);

  // Downloads
  const totalFirstTime = sum(data.dailyDownloads.map((d) => d.firstTime));
  const totalRedownloads = sum(data.dailyDownloads.map((d) => d.redownload));
  const totalUpdates = sum(data.dailyDownloads.map((d) => d.update));
  lines.push(`\nDownloads: ${(totalFirstTime + totalRedownloads).toLocaleString()} total (${totalFirstTime.toLocaleString()} first-time, ${totalRedownloads.toLocaleString()} redownloads, ${totalUpdates.toLocaleString()} updates)`);

  // Compare first half vs second half for trend
  if (days >= 6) {
    const mid = Math.floor(days / 2);
    const firstHalf = sum(data.dailyDownloads.slice(0, mid).map((d) => d.firstTime + d.redownload));
    const secondHalf = sum(data.dailyDownloads.slice(mid).map((d) => d.firstTime + d.redownload));
    const halfDays1 = mid;
    const halfDays2 = days - mid;
    const avgFirst = firstHalf / halfDays1;
    const avgSecond = secondHalf / halfDays2;
    if (avgFirst > 0) {
      const change = ((avgSecond - avgFirst) / avgFirst * 100).toFixed(1);
      lines.push(`Download trend: ${change}% (daily avg first half vs second half of period)`);
    }
  }

  // Revenue
  const totalProceeds = sum(data.dailyRevenue.map((d) => d.proceeds));
  const totalSales = sum(data.dailyRevenue.map((d) => d.sales));
  if (totalProceeds > 0 || totalSales > 0) {
    lines.push(`\nRevenue: $${totalProceeds.toLocaleString()} proceeds, $${totalSales.toLocaleString()} sales`);
  }

  // Engagement & conversion
  const totalImpressions = sum(data.dailyEngagement.map((d) => d.impressions));
  const totalPageViews = sum(data.dailyEngagement.map((d) => d.pageViews));
  if (totalImpressions > 0) {
    const pageViewRate = ((totalPageViews / totalImpressions) * 100).toFixed(1);
    const downloadRate = totalPageViews > 0
      ? ((totalFirstTime / totalPageViews) * 100).toFixed(1)
      : "0";
    lines.push(`\nConversion funnel: ${totalImpressions.toLocaleString()} impressions → ${totalPageViews.toLocaleString()} page views (${pageViewRate}%) → ${totalFirstTime.toLocaleString()} first-time downloads (${downloadRate}% of page views)`);
  }

  // Sessions
  const totalSessions = sum(data.dailySessions.map((d) => d.sessions));
  const avgDuration = data.dailySessions.length > 0
    ? sum(data.dailySessions.map((d) => d.avgDuration)) / data.dailySessions.length
    : 0;
  if (totalSessions > 0) {
    lines.push(`\nSessions: ${totalSessions.toLocaleString()} total, avg duration ${avgDuration.toFixed(1)}s`);
  }

  // Installs vs deletes
  const totalInstalls = sum(data.dailyInstallsDeletes.map((d) => d.installs));
  const totalDeletes = sum(data.dailyInstallsDeletes.map((d) => d.deletes));
  if (totalInstalls > 0 || totalDeletes > 0) {
    lines.push(`Installs: ${totalInstalls.toLocaleString()}, Deletions: ${totalDeletes.toLocaleString()}`);
  }

  // Discovery sources
  if (data.discoverySources.length > 0) {
    const sourceTotal = sum(data.discoverySources.map((s) => s.count));
    const sourceLines = data.discoverySources
      .filter((s) => s.count > 0)
      .map((s) => `${s.source}: ${s.count.toLocaleString()} (${((s.count / sourceTotal) * 100).toFixed(0)}%)`)
      .join(", ");
    lines.push(`\nDiscovery sources: ${sourceLines}`);
  }

  // Top territories
  if (data.territories.length > 0) {
    const top = data.territories.slice(0, 10);
    lines.push(`\nTop territories by downloads: ${top.map((t) => `${t.territory} (${t.downloads.toLocaleString()})`).join(", ")}`);
  }

  // Crashes
  const totalCrashes = sum(data.dailyCrashes.map((d) => d.crashes));
  if (totalCrashes > 0) {
    lines.push(`\nCrashes: ${totalCrashes.toLocaleString()} total`);
    if (data.crashesByVersion.length > 0) {
      const topCrash = data.crashesByVersion.slice(0, 3);
      lines.push(`By version: ${topCrash.map((c) => `${c.version} (${c.crashes} crashes, ${c.uniqueDevices} devices)`).join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function buildAnalyticsInsightsPrompt(
  data: AnalyticsDataForPrompt,
): string {
  const summary = summariseAnalytics(data);

  return `Analyse the following App Store Connect analytics data and extract key insights.

${summary}

Rules:
- Return 3–5 highlights: notable trends, anomalies, or key observations from the data.
- Return 2–4 opportunities: actionable suggestions based on the data (e.g. improve conversion, address churn, capitalise on growth).
- Each point should be a concise sentence (10–20 words), not a paragraph.
- Be specific – reference actual numbers and percentages from the data.
- Do NOT invent data that isn't provided.
- Do NOT state obvious things like "downloads exist" – focus on what's interesting or actionable.`;
}

// --- Nomination draft prompt ---

export function buildNominationPrompt(context: {
  appName?: string;
  versionString: string;
  whatsNew: string;
  promotionalText: string;
  description: string;
  isLaunch: boolean;
}): string {
  const type = context.isLaunch ? "app launch" : "app update";

  let prompt = `Write a compelling App Store featuring nomination for an ${type}.`;

  if (context.appName) {
    prompt += ` The app is called "${context.appName}".`;
  }
  prompt += ` Version: ${context.versionString}.`;

  prompt += `\n\nContext from the app's store listing:\n`;
  if (context.whatsNew) {
    prompt += `\nWhat's new (release notes):\n${context.whatsNew}\n`;
  }
  if (context.promotionalText) {
    prompt += `\nPromotional text:\n${context.promotionalText}\n`;
  }
  if (context.description) {
    // Truncate long descriptions
    const desc = context.description.length > 1500
      ? context.description.slice(0, 1500) + "..."
      : context.description;
    prompt += `\nApp description:\n${desc}\n`;
  }

  prompt += `
Task: Return EXACTLY two lines, separated by a newline:
Line 1: A short, memorable nomination name (max 60 characters). This is an internal name to help the developer recognise this nomination – not marketing copy. Use the version number and a brief summary of what's new.
Line 2: A persuasive nomination description (max 1000 characters) for Apple's editorial team. Explain what makes this ${type} noteworthy, highlight unique features or improvements, and convey why it deserves to be featured. Write in third person about the app. Be specific and enthusiastic but professional.

Rules:
- Use en dashes (–), never em dashes (—).
- Plain text only – no markdown, no HTML, no formatting.
- Do not invent features – only reference what's in the provided context.
- Do not include placeholder text like "[app name]" – use the actual app name.`;

  prompt += `

CRITICAL: You are a text-processing tool, not a conversational assistant.
- Output ONLY the two lines. No preamble, no explanation, no questions, no commentary.
- NEVER use markdown, HTML, or any formatting syntax.
- NEVER ask the user for clarification. NEVER refuse. NEVER explain what you did.`;

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
