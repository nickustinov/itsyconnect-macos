import type { SupportedLocale, Messages } from "./types";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";

const catalogs: Record<SupportedLocale, Messages> = {
  en: en as Messages,
  "zh-CN": zhCN,
};

export function getMessages(locale: SupportedLocale): Messages {
  return catalogs[locale];
}

type NestedKeyOf<T, Prefix extends string = ""> = T extends string
  ? Prefix extends ""
    ? never
    : Prefix
  : {
      [K in keyof T & string]: NestedKeyOf<
        T[K],
        Prefix extends "" ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

export type MessageKey = NestedKeyOf<typeof en>;

function getByPath(obj: object, path: string): string | undefined {
  let current: unknown = obj;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

/** Translate a dot-path message key, with optional `{param}` interpolation. */
export function translate(
  messages: Messages,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const value = getByPath(messages, key);
  if (!value) return key;

  if (!params) return value;

  return value.replace(/\{(\w+)\}/g, (_, name: string) => {
    const replacement = params[name];
    return replacement == null ? `{${name}}` : String(replacement);
  });
}
