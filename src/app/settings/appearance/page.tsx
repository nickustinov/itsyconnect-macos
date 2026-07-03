"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Monitor, Moon, Sun } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";
import type { LocalePreference } from "@/lib/i18n/types";

const THEME_OPTIONS = [
  { value: "system", labelKey: "settings.appearance.themeSystem" as const, icon: Monitor },
  { value: "light", labelKey: "settings.appearance.themeLight" as const, icon: Sun },
  { value: "dark", labelKey: "settings.appearance.themeDark" as const, icon: Moon },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "system", labelKey: "settings.appearance.languageSystem" as const, icon: Monitor },
  { value: "en", labelKey: "settings.appearance.languageEn" as const, icon: Globe },
  { value: "zh-CN", labelKey: "settings.appearance.languageZhCN" as const, icon: Globe },
] as const;

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const { preference, setPreference, hydrated: localeHydrated } = useLocale();
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);

  const languageLabels = Object.fromEntries(
    LANGUAGE_OPTIONS.map(({ value, labelKey }) => [value, t(labelKey)]),
  ) as Record<(typeof LANGUAGE_OPTIONS)[number]["value"], string>;

  const selectedLanguage = LANGUAGE_OPTIONS.find((o) => o.value === preference);
  const SelectedLanguageIcon = selectedLanguage?.icon ?? Globe;

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted guard for SSR hydration
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !localeHydrated) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="section-title">{t("settings.appearance.theme")}</h3>
        <Select value={theme} onValueChange={setTheme}>
          <SelectTrigger className="w-[200px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEME_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
              <SelectItem key={value} value={value}>
                <Icon size={14} className="mr-2 inline-block" />
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("settings.appearance.themeSystemHint")}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="section-title">{t("settings.appearance.language")}</h3>
        <Select
          value={preference}
          onValueChange={(value) => setPreference(value as LocalePreference)}
        >
          <SelectTrigger className="w-[200px] text-sm">
            <SelectValue asChild>
              <span className="flex items-center gap-2">
                <SelectedLanguageIcon size={14} />
                {selectedLanguage ? languageLabels[selectedLanguage.value] : ""}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_OPTIONS.map(({ value, icon: Icon }) => (
              <SelectItem
                key={value}
                value={value}
                textValue={languageLabels[value]}
              >
                <Icon size={14} className="mr-2 inline-block" />
                {languageLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("settings.appearance.languageSystemHint")}
        </p>
      </section>
    </div>
  );
}
