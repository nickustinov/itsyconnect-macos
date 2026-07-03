import type { LocalePreference, SupportedLocale } from "./types";
import {
  LOCALE_COOKIE_KEY,
  LOCALE_PREF_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
} from "./types";
import { resolveLocale } from "./resolve-locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Resolve locale from request cookies and Accept-Language (pure – testable). */
export function resolveLocaleFromRequest(opts: {
  resolvedCookie?: string | null;
  prefCookie?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale {
  const { resolvedCookie, prefCookie, acceptLanguage } = opts;

  if (resolvedCookie === "zh-CN" || resolvedCookie === "en") {
    return resolvedCookie;
  }

  if (prefCookie === "en" || prefCookie === "zh-CN") {
    return prefCookie;
  }

  return resolveLocale("system", acceptLanguage ?? "en");
}

/** Write locale cookies on the client after preference changes. */
export function writeLocaleCookies(
  preference: LocalePreference,
  locale: SupportedLocale,
): void {
  if (typeof document === "undefined") return;
  const base = `path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  document.cookie = `${LOCALE_PREF_COOKIE_KEY}=${preference};${base}`;
  document.cookie = `${LOCALE_COOKIE_KEY}=${locale};${base}`;
}

/**
 * Inline bootstrap script – runs before React hydrates.
 * Syncs localStorage → cookies so the next SSR request matches the client.
 */
export const LOCALE_BOOTSTRAP_SCRIPT = `(function(){
  try {
    var SK="${LOCALE_STORAGE_KEY}",PK="${LOCALE_PREF_COOKIE_KEY}",LK="${LOCALE_COOKIE_KEY}";
    var pref=localStorage.getItem(SK)||"system";
    if(pref!=="system"&&pref!=="en"&&pref!=="zh-CN")pref="system";
    var locale="en";
    if(pref==="en")locale="en";
    else if(pref==="zh-CN")locale="zh-CN";
    else{
      var langs=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||"en"];
      for(var i=0;i<langs.length;i++){
        var t=langs[i].toLowerCase().replace(/_/g,"-");
        if(t==="zh-cn"||t==="zh-hans"||t==="zh"||(t.indexOf("zh")===0&&t.indexOf("tw")===-1&&t.indexOf("hk")===-1&&t.indexOf("hant")===-1)){locale="zh-CN";break;}
        if(t.indexOf("en")===0){locale="en";break;}
      }
    }
    var base="path=/;max-age=${COOKIE_MAX_AGE};samesite=lax";
    document.cookie=PK+"="+pref+";"+base;
    document.cookie=LK+"="+locale+";"+base;
    document.documentElement.lang=locale==="zh-CN"?"zh-CN":"en";
  }catch(e){}
})();`;
