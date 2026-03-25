"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/error-state";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-fetch";
import type { AscErrorEntry } from "@/lib/asc/errors";
import { useErrorReport } from "@/lib/error-report-context";
import type { SyncError } from "@/lib/api-helpers";
import { CharCount } from "@/components/char-count";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useApps } from "@/lib/apps-context";
import { useRegisterHeaderLocale } from "@/lib/header-locale-context";
import { useLocaleManagement } from "@/lib/hooks/use-locale-management";
import { useLocaleHandlers } from "@/lib/hooks/use-locale-handlers";
import { sortLocales } from "@/lib/asc/locale-names";
import { MagicWandButton, wandProps } from "@/components/magic-wand-button";
import type { MagicWandLocaleProps } from "@/components/magic-wand-button";
import { BulkAIDialog, type BulkField } from "@/components/bulk-ai-dialog";
import { BulkAllAIDialog } from "@/components/bulk-all-ai-dialog";
import type {
  TFBetaAppInfo,
  TFBetaAppLocalization,
  TFBetaReviewDetail,
  TFBetaLicenseAgreement,
} from "@/lib/asc/testflight";
import { useTabNavigation } from "@/lib/hooks/use-tab-navigation";

interface BetaLocaleFields {
  description: string;
  feedbackEmail: string;
  marketingUrl: string;
  privacyPolicyUrl: string;
}

function emptyLocaleFields(): BetaLocaleFields {
  return {
    description: "",
    feedbackEmail: "",
    marketingUrl: "",
    privacyPolicyUrl: "",
  };
}

function buildLocaleData(
  localizations: TFBetaAppLocalization[],
): Record<string, BetaLocaleFields> {
  const data: Record<string, BetaLocaleFields> = {};
  for (const loc of localizations) {
    data[loc.locale] = {
      description: loc.description ?? "",
      feedbackEmail: loc.feedbackEmail ?? "",
      marketingUrl: loc.marketingUrl ?? "",
      privacyPolicyUrl: loc.privacyPolicyUrl ?? "",
    };
  }
  return data;
}

function buildLocaleIds(
  localizations: TFBetaAppLocalization[],
): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const loc of localizations) {
    ids[loc.locale] = loc.id;
  }
  return ids;
}

export default function TestFlightInfoPage() {
  const tabRef = useTabNavigation();
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const primaryLocale = app?.primaryLocale ?? "";

  const { setDirty, registerSave, registerDiscard } = useFormDirty();
  const { showAscError, showSyncErrors } = useErrorReport();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Multi-locale state
  const [localeData, setLocaleData] = useState<Record<string, BetaLocaleFields>>({});
  const originalLocaleIdsRef = useRef<Record<string, string>>({});

  // Keep a ref to the fetched localizations for discard
  const fetchedLocalizationsRef = useRef<TFBetaAppLocalization[]>([]);

  const {
    locales, setLocales,
    selectedLocale, setSelectedLocale,
    changeLocale,
    otherSectionLocales,
  } = useLocaleManagement({ section: "testflight-info", primaryLocale });

  // Non-localizable state
  const [review, setReview] = useState<TFBetaReviewDetail | null>(null);
  const [licenseText, setLicenseText] = useState("");
  const [licenseAgreement, setLicenseAgreement] = useState<TFBetaLicenseAgreement | null>(null);

  // Original snapshots for non-locale discard
  const originalReviewRef = useRef<TFBetaReviewDetail | null>(null);
  const originalLicenseTextRef = useRef("");

  const current = localeData[selectedLocale] ?? emptyLocaleFields();

  const wand: MagicWandLocaleProps = {
    locale: selectedLocale,
    baseLocale: locales[0] ?? "",
    localeData,
    appName: app?.name,
  };

  const bulkFields: BulkField[] = [
    { key: "description", label: "Description", charLimit: 4000 },
  ];

  const [bulkMode, setBulkMode] = useState<"translate" | "copy" | null>(null);
  const [bulkAllMode, setBulkAllMode] = useState<{ mode: "translate" | "copy"; field?: string } | null>(null);

  function handleBulkApply(updates: Record<string, Record<string, string>>) {
    setLocaleData((prev) => {
      const next = { ...prev };
      for (const [locale, fields] of Object.entries(updates)) {
        next[locale] = { ...next[locale], ...fields } as BetaLocaleFields;
      }
      return next;
    });
    setDirty(true);
  }

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const res = await fetch(`/api/apps/${appId}/testflight/info${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to fetch info (${res.status})`);
      }
      const data = await res.json();
      const fetchedInfo: TFBetaAppInfo = data.info;

      // Build locale data – seed primary locale if no localizations exist
      const ld = buildLocaleData(fetchedInfo.localizations);
      if (Object.keys(ld).length === 0 && primaryLocale) {
        ld[primaryLocale] = emptyLocaleFields();
      }
      setLocaleData(ld);
      fetchedLocalizationsRef.current = fetchedInfo.localizations;

      const sorted = sortLocales(Object.keys(ld), primaryLocale);
      setLocales(sorted);

      // Preserve current locale if still valid, else try URL param, else first
      setSelectedLocale((prev) => {
        if (prev && sorted.includes(prev)) return prev;
        const fromUrl = searchParamsRef.current.get("locale");
        if (fromUrl && sorted.includes(fromUrl)) return fromUrl;
        return sorted[0] ?? "";
      });

      // Snapshot original locale → ID mapping for save diffing
      originalLocaleIdsRef.current = buildLocaleIds(fetchedInfo.localizations);

      // Non-localizable state
      const rev = fetchedInfo.reviewDetail ? { ...fetchedInfo.reviewDetail } : null;
      const licText = fetchedInfo.licenseAgreement?.agreementText ?? "";

      setReview(rev);
      setLicenseAgreement(fetchedInfo.licenseAgreement);
      setLicenseText(licText);

      originalReviewRef.current = rev ? { ...rev } : null;
      originalLicenseTextRef.current = licText;

      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch info");
    } finally {
      setLoading(false);
    }
  }, [appId, primaryLocale, setDirty, setLocales, setSelectedLocale]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => fetchData(true), [fetchData]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  const updateField = useCallback(
    (field: keyof BetaLocaleFields, value: string) => {
      setLocaleData((prev) => ({
        ...prev,
        [selectedLocale]: { ...(prev[selectedLocale] ?? emptyLocaleFields()), [field]: value },
      }));
      setDirty(true);
    },
    [selectedLocale, setDirty],
  );

  function updateReviewField(field: keyof TFBetaReviewDetail, value: string | boolean) {
    setReview((prev) => prev ? { ...prev, [field]: value } : prev);
    setDirty(true);
  }

  function updateLicenseText(value: string) {
    setLicenseText(value);
    setDirty(true);
  }

  const { handleAddLocale, handleBulkAddLocales, handleDeleteLocale } = useLocaleHandlers({
    localeData,
    setLocaleData,
    setLocales,
    selectedLocale,
    changeLocale,
    primaryLocale,
    setDirty,
    emptyFields: emptyLocaleFields,
    undoOnDelete: false,
  });

  // Register locale picker in the header bar
  useRegisterHeaderLocale({
    locales,
    selectedLocale,
    primaryLocale,
    onLocaleChange: changeLocale,
    onLocaleAdd: handleAddLocale,
    onLocalesAdd: handleBulkAddLocales,
    onLocaleDelete: handleDeleteLocale,
    onBulkTranslate: () => setBulkMode("translate"),
    onBulkCopy: () => setBulkMode("copy"),
    onBulkTranslateAll: () => setBulkAllMode({ mode: "translate" }),
    onBulkCopyAll: () => setBulkAllMode({ mode: "copy" }),
    section: "testflight-info",
    otherSectionLocales,
  });

  // Register save handler for the header Save button
  useEffect(() => {
    registerSave(async () => {
      const promises: Promise<void>[] = [];

      // Save localizations via PUT (batch create/update/delete)
      let locCreatedIds: Record<string, string> = {};
      const syncErrors: SyncError[] = [];
      promises.push(
        fetch(`/api/apps/${appId}/testflight/info`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locales: localeData,
            originalLocaleIds: originalLocaleIdsRef.current,
          }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok && !data.errors) throw new Error(data.error ?? "Save failed");
          if (data.errors?.length > 0) {
            syncErrors.push(...(data.errors as SyncError[]));
          }
          locCreatedIds = data.createdIds ?? {};
        }),
      );

      if (review) {
        promises.push(
          fetch(`/api/apps/${appId}/testflight/info`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "updateReviewDetail",
              detailId: review.id,
              fields: {
                contactFirstName: review.contactFirstName ?? "",
                contactLastName: review.contactLastName ?? "",
                contactPhone: review.contactPhone ?? "",
                contactEmail: review.contactEmail ?? "",
                demoAccountRequired: review.demoAccountRequired,
                demoAccountName: review.demoAccountName ?? "",
                demoAccountPassword: review.demoAccountPassword ?? "",
                notes: review.notes ?? "",
              },
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
              throw new ApiError(
                (data.error as string) ?? "Failed to save review details",
                {
                  ascErrors: data.ascErrors as AscErrorEntry[] | undefined,
                  ascMethod: data.ascMethod as string | undefined,
                  ascPath: data.ascPath as string | undefined,
                },
              );
            }
          }),
        );
      }

      if (licenseAgreement) {
        promises.push(
          fetch(`/api/apps/${appId}/testflight/info`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "updateLicense",
              agreementId: licenseAgreement.id,
              agreementText: licenseText,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
              throw new ApiError(
                (data.error as string) ?? "Failed to save license agreement",
                {
                  ascErrors: data.ascErrors as AscErrorEntry[] | undefined,
                  ascMethod: data.ascMethod as string | undefined,
                  ascPath: data.ascPath as string | undefined,
                },
              );
            }
          }),
        );
      }

      try {
        await Promise.all(promises);
      } catch (err) {
        if (err instanceof ApiError && err.ascErrors?.length) {
          showAscError({
            message: err.message,
            ascErrors: err.ascErrors,
            ascMethod: err.ascMethod,
            ascPath: err.ascPath,
          });
        } else {
          toast.error(err instanceof Error ? err.message : "Save failed");
        }
        return;
      }

      if (syncErrors.length > 0) {
        showSyncErrors(syncErrors);
        return;
      }

      toast.success("Beta app info saved");

      // Update original snapshot with real IDs from created locales
      const ids: Record<string, string> = { ...originalLocaleIdsRef.current };
      for (const [locale, id] of Object.entries(locCreatedIds)) {
        ids[locale] = id;
      }
      for (const locale of Object.keys(ids)) {
        if (!localeData[locale]) delete ids[locale];
      }
      originalLocaleIdsRef.current = ids;

      originalReviewRef.current = review ? { ...review } : null;
      originalLicenseTextRef.current = licenseText;

      setDirty(false);
    });
  }, [appId, localeData, review, licenseAgreement, licenseText, registerSave, setDirty, showAscError, showSyncErrors]);

  // Register discard handler for the header Discard button
  useEffect(() => {
    registerDiscard(() => {
      setLocaleData(buildLocaleData(fetchedLocalizationsRef.current));
      const sorted = sortLocales(
        fetchedLocalizationsRef.current.map((l) => l.locale),
        primaryLocale,
      );
      setLocales(sorted);
      // Switch back to a valid locale if the current one was removed
      if (!sorted.includes(selectedLocale)) {
        changeLocale(sorted[0] ?? "");
      }
      setReview(originalReviewRef.current ? { ...originalReviewRef.current } : null);
      setLicenseText(originalLicenseTextRef.current);
    });
  }, [primaryLocale, selectedLocale, setLocales, changeLocale, registerDiscard]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchData()} />;
  }

  const localeTag = selectedLocale && selectedLocale !== primaryLocale
    ? <span className="ml-1.5 inline-flex translate-y-[-1px] rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-normal text-muted-foreground">{selectedLocale}</span>
    : null;

  return (
    <div ref={tabRef} className="space-y-8">
      {/* Beta app information */}
      <section className="space-y-4">
        <h3 className="section-title">Beta app information</h3>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <label className="text-sm text-muted-foreground">Description{localeTag}</label>
            <MagicWandButton
              value={current.description}
              onChange={(v) => updateField("description", v)}
              {...wandProps(wand, "description")}
              charLimit={4000}
              onTranslateAll={() => setBulkAllMode({ mode: "translate", field: "description" })}
            />
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="px-5 py-4">
              <Textarea
                value={current.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Describe what testers should try..."
                className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
              />
            </CardContent>
            <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
              <CharCount value={current.description} limit={4000} />
            </div>
          </Card>
        </div>

        {/* URLs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Feedback email{localeTag}</label>
            <Input
              value={current.feedbackEmail}
              onChange={(e) => updateField("feedbackEmail", e.target.value)}
              placeholder="beta@example.com"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Marketing URL{localeTag}</label>
            <Input
              dir="ltr"
              value={current.marketingUrl}
              onChange={(e) => updateField("marketingUrl", e.target.value)}
              placeholder="https://example.com"
              className="text-sm"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm text-muted-foreground">Privacy policy URL{localeTag}</label>
            <Input
              dir="ltr"
              value={current.privacyPolicyUrl}
              onChange={(e) => updateField("privacyPolicyUrl", e.target.value)}
              placeholder="https://example.com/privacy"
              className="text-sm"
            />
          </div>
        </div>
      </section>

      <BulkAIDialog
        open={bulkMode !== null}
        onOpenChange={(open) => { if (!open) setBulkMode(null); }}
        mode={bulkMode ?? "copy"}
        targetLocale={selectedLocale}
        primaryLocale={primaryLocale}
        localeData={localeData}
        fields={bulkFields}
        appName={app?.name}
        onApply={handleBulkApply}
      />
      <BulkAllAIDialog
        open={bulkAllMode !== null}
        onOpenChange={(open) => { if (!open) setBulkAllMode(null); }}
        mode={bulkAllMode?.mode ?? "copy"}
        primaryLocale={primaryLocale}
        locales={locales}
        localeData={localeData}
        fields={bulkAllMode?.field ? bulkFields.filter((f) => f.key === bulkAllMode.field) : bulkFields}
        appName={app?.name}
        onApply={handleBulkApply}
      />

      {/* Beta app review information */}
      <section className="space-y-4">
        <h3 className="section-title">Beta app review information</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Contact fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">First name</label>
              <Input
                value={review?.contactFirstName ?? ""}
                onChange={(e) => updateReviewField("contactFirstName", e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Last name</label>
              <Input
                value={review?.contactLastName ?? ""}
                onChange={(e) => updateReviewField("contactLastName", e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Phone</label>
              <Input
                value={review?.contactPhone ?? ""}
                onChange={(e) => updateReviewField("contactPhone", e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Email</label>
              <Input
                value={review?.contactEmail ?? ""}
                onChange={(e) => updateReviewField("contactEmail", e.target.value)}
                type="email"
                className="text-sm"
              />
            </div>
          </div>

          {/* Review notes */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Review notes</label>
            <Card className="gap-0 py-0">
              <CardContent className="px-5 py-4">
                <Textarea
                  value={review?.notes ?? ""}
                  onChange={(e) => updateReviewField("notes", e.target.value)}
                  placeholder="Notes for the App Review team..."
                  className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
                />
              </CardContent>
              <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
                <CharCount value={review?.notes ?? ""} limit={4000} />
              </div>
            </Card>
          </div>
        </div>

        {/* Sign-in required */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="sign-in-required"
              checked={review?.demoAccountRequired ?? false}
              onCheckedChange={(v) => updateReviewField("demoAccountRequired", v)}
            />
            <Label htmlFor="sign-in-required" className="text-sm">
              Sign-in required
            </Label>
          </div>
          {review?.demoAccountRequired && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Demo username</label>
                <Input
                  value={review.demoAccountName ?? ""}
                  onChange={(e) => updateReviewField("demoAccountName", e.target.value)}
                  placeholder="demo@example.com"
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Demo password</label>
                <Input
                  value={review.demoAccountPassword ?? ""}
                  onChange={(e) => updateReviewField("demoAccountPassword", e.target.value)}
                  type="password"
                  placeholder="Password"
                  className="text-sm"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* License agreement */}
      <section className="space-y-2 pb-8">
        <h3 className="section-title">License agreement</h3>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={licenseText}
              onChange={(e) => updateLicenseText(e.target.value)}
              placeholder="Enter your license agreement text..."
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
