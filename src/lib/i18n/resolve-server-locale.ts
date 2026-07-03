import { cookies, headers } from "next/headers";
import { resolveLocaleFromRequest } from "./locale-cookies";
import { LOCALE_COOKIE_KEY, LOCALE_PREF_COOKIE_KEY, type SupportedLocale } from "./types";

/** Resolve the locale for SSR from cookies and Accept-Language. */
export async function resolveServerLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  return resolveLocaleFromRequest({
    resolvedCookie: cookieStore.get(LOCALE_COOKIE_KEY)?.value,
    prefCookie: cookieStore.get(LOCALE_PREF_COOKIE_KEY)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}
