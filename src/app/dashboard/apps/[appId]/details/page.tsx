"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpinnerGap } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useApps } from "@/lib/apps-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import type { AscAppInfoLocalization } from "@/lib/asc/app-info";
import { localeName, sortLocales } from "@/lib/asc/locale-names";
import { useSectionLocales } from "@/lib/section-locales-context";
import { useRegisterHeaderLocale } from "@/lib/header-locale-context";

const AGE_RATING_LABELS: Record<string, string> = {
  FOUR_PLUS: "4+",
  NINE_PLUS: "9+",
  TWELVE_PLUS: "12+",
  SEVENTEEN_PLUS: "17+",
};

interface AppInfoLocaleFields {
  name: string;
  subtitle: string;
  privacyPolicyUrl: string;
  privacyChoicesUrl: string;
}

function emptyLocaleFields(): AppInfoLocaleFields {
  return {
    name: "",
    subtitle: "",
    privacyPolicyUrl: "",
    privacyChoicesUrl: "",
  };
}

function buildLocaleData(
  localizations: AscAppInfoLocalization[],
): Record<string, AppInfoLocaleFields> {
  const data: Record<string, AppInfoLocaleFields> = {};
  for (const loc of localizations) {
    data[loc.attributes.locale] = {
      name: loc.attributes.name ?? "",
      subtitle: loc.attributes.subtitle ?? "",
      privacyPolicyUrl: loc.attributes.privacyPolicyUrl ?? "",
      privacyChoicesUrl: loc.attributes.privacyChoicesUrl ?? "",
    };
  }
  return data;
}

export default function AppDetailsPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { appInfos, loading: infoLoading } = useAppInfo(appId);
  const appInfo = pickAppInfo(appInfos);
  const appInfoId = appInfo?.id ?? "";

  const { localizations, loading: locLoading, refresh: refreshLocalizations } =
    useAppInfoLocalizations(appId, appInfoId);

  const primaryLocale = app?.primaryLocale ?? "";

  const [localeData, setLocaleData] = useState<
    Record<string, AppInfoLocaleFields>
  >({});
  const [locales, setLocales] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState(
    () => searchParams.get("locale") ?? "",
  );

  const current = localeData[selectedLocale] ?? emptyLocaleFields();

  const changeLocale = useCallback(
    (code: string) => {
      setSelectedLocale(code);
      const next = new URLSearchParams(searchParams.toString());
      next.set("locale", code);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  const { setDirty, registerSave } = useFormDirty();
  const { reportLocales, otherSectionLocales } = useSectionLocales("details");

  // Track original locale → localization ID mapping for diffing saves
  const originalLocaleIdsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const data = buildLocaleData(localizations);
    setLocaleData(data);
    const sorted = sortLocales(Object.keys(data), primaryLocale);
    setLocales(sorted);

    // Preserve current locale if still valid, else try URL param, else first
    setSelectedLocale((prev) => {
      if (prev && sorted.includes(prev)) return prev;
      const fromUrl = searchParams.get("locale");
      if (fromUrl && sorted.includes(fromUrl)) return fromUrl;
      return sorted[0] ?? "";
    });
    setDirty(false);

    // Snapshot original locale → ID mapping for save diffing
    const ids: Record<string, string> = {};
    for (const loc of localizations) {
      ids[loc.attributes.locale] = loc.id;
    }
    originalLocaleIdsRef.current = ids;
  }, [localizations, primaryLocale, setDirty, searchParams]);

  // Report locales to cross-section context
  useEffect(() => {
    reportLocales(locales);
  }, [locales, reportLocales]);

  // Register save handler for the header Save button
  useEffect(() => {
    registerSave(async () => {
      const res = await fetch(
        `/api/apps/${appId}/info/${appInfoId}/localizations`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locales: localeData,
            originalLocaleIds: originalLocaleIdsRef.current,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok && !data.errors) {
        toast.error(data.error ?? "Save failed");
        return;
      }

      if (data.errors?.length > 0) {
        toast.warning(`Saved with ${data.errors.length} error(s)`);
      } else {
        toast.success("App details saved");
      }

      await refreshLocalizations();
    });
  }, [appId, appInfoId, localeData, registerSave, refreshLocalizations]);

  const updateField = useCallback(
    (field: keyof AppInfoLocaleFields, value: string) => {
      setLocaleData((prev) => ({
        ...prev,
        [selectedLocale]: { ...prev[selectedLocale], [field]: value },
      }));
      setDirty(true);
    },
    [selectedLocale, setDirty],
  );

  function handleAddLocale(locale: string) {
    setLocaleData((prev) => {
      const next = { ...prev, [locale]: emptyLocaleFields() };
      setLocales(sortLocales(Object.keys(next), primaryLocale));
      return next;
    });
    changeLocale(locale);
    setDirty(true);
    toast.success(`Added ${localeName(locale)}`);
  }

  function handleBulkAddLocales(codes: string[]) {
    setLocaleData((prev) => {
      const next = { ...prev };
      for (const code of codes) {
        if (!next[code]) next[code] = emptyLocaleFields();
      }
      setLocales(sortLocales(Object.keys(next), primaryLocale));
      return next;
    });
    setDirty(true);
    toast.success(`Added ${codes.length} locales`);
  }

  function handleDeleteLocale(code: string) {
    const deletedData = localeData[code];
    setLocaleData((prev) => {
      const next = { ...prev };
      delete next[code];
      const sorted = sortLocales(Object.keys(next), primaryLocale);
      setLocales(sorted);
      if (selectedLocale === code) {
        changeLocale(sorted[0] ?? "");
      }
      return next;
    });
    setDirty(true);
    toast(`Removed ${localeName(code)}`, {
      action: {
        label: "Undo",
        onClick: () => {
          setLocaleData((prev) => {
            const next = { ...prev, [code]: deletedData ?? emptyLocaleFields() };
            setLocales(sortLocales(Object.keys(next), primaryLocale));
            return next;
          });
          setDirty(true);
        },
      },
    });
  }

  // Register locale picker in the header bar
  useRegisterHeaderLocale({
    locales,
    selectedLocale,
    primaryLocale,
    onLocaleChange: changeLocale,
    onLocaleAdd: handleAddLocale,
    onLocalesAdd: handleBulkAddLocales,
    onLocaleDelete: handleDeleteLocale,
    section: "details",
    otherSectionLocales,
  });

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  if (infoLoading || locLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ageRating = appInfo?.attributes.appStoreAgeRating;
  const primaryCategoryId = appInfo?.primaryCategory?.id ?? "";
  const secondaryCategoryId = appInfo?.secondaryCategory?.id ?? "";

  return (
    <div className="space-y-8">
      {/* Identifiers (read-only) */}
      <section className="space-y-2">
        <h3 className="section-title">Identifiers</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Bundle ID" value={app.bundleId} mono />
          <ReadOnlyField label="SKU" value={app.sku} mono />
        </div>
      </section>

      {/* Base language */}
      <section className="space-y-2">
        <h3 className="section-title">Base language</h3>
        <Select defaultValue={app.primaryLocale}>
          <SelectTrigger className="w-[280px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {localizations.map((loc) => (
              <SelectItem
                key={loc.attributes.locale}
                value={loc.attributes.locale}
              >
                {localeName(loc.attributes.locale)}
                <span className="ml-1.5 text-muted-foreground">
                  {loc.attributes.locale}
                </span>
              </SelectItem>
            ))}
            {localizations.length === 0 && (
              <SelectItem value={app.primaryLocale}>
                {localeName(app.primaryLocale)}
                <span className="ml-1.5 text-muted-foreground">
                  {app.primaryLocale}
                </span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </section>

      {locales.length > 0 && (
        <>
          {/* Name & subtitle */}
          <section className="space-y-2">
            <h3 className="section-title">Name &amp; subtitle</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Name</label>
                <Input
                  value={current.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Subtitle
                </label>
                <Input
                  value={current.subtitle}
                  onChange={(e) => updateField("subtitle", e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </section>

          {/* URLs */}
          <section className="space-y-2">
            <h3 className="section-title">URLs</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Privacy policy URL
                </label>
                <Input
                  dir="ltr"
                  value={current.privacyPolicyUrl}
                  onChange={(e) =>
                    updateField("privacyPolicyUrl", e.target.value)
                  }
                  placeholder="https://..."
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Privacy choices URL
                </label>
                <Input
                  dir="ltr"
                  value={current.privacyChoicesUrl}
                  onChange={(e) =>
                    updateField("privacyChoicesUrl", e.target.value)
                  }
                  placeholder="https://..."
                  className="text-sm"
                />
              </div>
            </div>
          </section>
        </>
      )}

      {/* Categories */}
      <section className="space-y-2">
        <h3 className="section-title">Categories</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Primary category
            </label>
            <ReadOnlyField label="" value={primaryCategoryId || "Not set"} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Secondary category
            </label>
            <ReadOnlyField label="" value={secondaryCategoryId || "None"} />
          </div>
        </div>
      </section>

      {/* Age rating */}
      <section className="space-y-2">
        <h3 className="section-title">Age rating</h3>
        <div className="flex gap-4">
          <Card className="w-32">
            <CardContent className="flex flex-col items-center justify-center py-4">
              <span className="text-2xl font-bold">
                {ageRating
                  ? (AGE_RATING_LABELS[ageRating] ?? ageRating)
                  : "–"}
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Content rights */}
      <section className="space-y-2 pb-8">
        <h3 className="section-title">Content rights</h3>
        <RadioGroup defaultValue="none">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="none" id="cr-none" />
            <Label htmlFor="cr-none" className="text-sm font-normal">
              Does not use third-party content
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="has-rights" id="cr-has-rights" />
            <Label htmlFor="cr-has-rights" className="text-sm font-normal">
              Contains third-party content and I have the necessary rights
            </Label>
          </div>
        </RadioGroup>
      </section>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
