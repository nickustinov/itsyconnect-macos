"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { CheckCircle, Circle, WarningCircle } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import { useVersions } from "@/lib/versions-context";
import { useSubmissionChecklist, type FieldStatus } from "@/lib/submission-checklist-context";
import { computeAppDetailsFlags } from "@/lib/submission-checklist-utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { localeName } from "@/lib/asc/locale-names";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useErrorReport } from "@/lib/error-report-context";
import type { AscErrorReportData } from "@/components/error-report-dialog";
import { resolveVersion, type AscVersion } from "@/lib/asc/version-types";
import { useApps } from "@/lib/apps-context";
import { ActionFooter } from "@/components/layout/action-footer";
import { useTranslations } from "@/lib/i18n/locale-context";

/** Brief pause to let ASC propagate state changes before re-fetching. */
const ASC_PROPAGATION_DELAY = 3000;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FOOTER_PAGES = new Set(["store-listing"]);

const SUBMIT_STATES = new Set(["PREPARE_FOR_SUBMISSION"]);
const CANCEL_STATES = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW"]);
const REJECTED_STATES = new Set(["REJECTED", "METADATA_REJECTED", "DEVELOPER_REJECTED"]);

function getPageSegment(pathname: string): string {
  const parts = pathname.split("/");
  return parts[parts.length - 1] ?? "";
}

function ChecklistIcon({ status, localesWithIssues }: { status: FieldStatus; localesWithIssues?: string[] }) {
  const t = useTranslations();

  if (status === "ok") {
    return <CheckCircle size={14} weight="fill" className="text-green-500/70" />;
  }
  if (status === "warn" && localesWithIssues?.length) {
    const n = localesWithIssues.length;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <WarningCircle size={14} weight="fill" className="text-amber-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="mb-2">
            {n === 1
              ? t("versionAction.missingInLocales", { count: n })
              : t("versionAction.missingInLocalesPlural", { count: n })}
          </p>
          {localesWithIssues.map((l) => (
            <p key={l}>{localeName(l)}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    );
  }
  return <Circle size={14} />;
}

function SubmissionChecklist({ version, isFirstVersion }: { version: AscVersion; isFirstVersion: boolean }) {
  const t = useTranslations();
  const { flags } = useSubmissionChecklist();
  const sl = flags.storeListing;
  const ad = flags.appDetails;

  const hasBuild = version.build !== null;
  const hasCopyright = !!(version.attributes.copyright?.trim());
  const rd = version.reviewDetail?.attributes;
  const hasContact = !!(rd?.contactEmail && rd?.contactFirstName && rd?.contactLastName && rd?.contactPhone);

  const screenshotStatus: FieldStatus =
    flags.hasScreenshots === null ? "missing" : flags.hasScreenshots ? "ok" : "missing";

  const items: { label: string; status: FieldStatus; localesWithIssues?: string[] }[] = [
    { label: t("storeListing.build.title"), status: hasBuild ? "ok" : "missing" },
    { label: t("nav.items.screenshots"), status: screenshotStatus },
    { label: t("appDetails.name"), status: ad?.name.status ?? "missing", localesWithIssues: ad?.name.localesWithIssues },
    { label: t("storeListing.fields.description"), status: sl?.description.status ?? "missing", localesWithIssues: sl?.description.localesWithIssues },
    ...(!isFirstVersion ? [{ label: t("storeListing.fields.whatsNew"), status: sl?.whatsNew.status ?? "missing", localesWithIssues: sl?.whatsNew.localesWithIssues }] : []),
    { label: t("storeListing.fields.keywords"), status: sl?.keywords.status ?? "missing", localesWithIssues: sl?.keywords.localesWithIssues },
    { label: t("versionAction.support"), status: sl?.supportUrl.status ?? "missing", localesWithIssues: sl?.supportUrl.localesWithIssues },
    { label: t("versionAction.privacy"), status: ad?.privacyPolicyUrl.status ?? "missing", localesWithIssues: ad?.privacyPolicyUrl.localesWithIssues },
    { label: t("storeListing.copyright"), status: hasCopyright ? "ok" : "missing" },
    { label: t("versionAction.contact"), status: hasContact ? "ok" : "missing" },
  ];

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((item) => (
          <span
            key={item.label}
            className={`flex items-center gap-1 text-xs ${item.status === "ok" ? "text-muted-foreground" : "text-muted-foreground/60"}`}
          >
            <ChecklistIcon status={item.status} localesWithIssues={item.localesWithIssues} />
            {item.label}
          </span>
        ))}
      </div>
    </TooltipProvider>
  );
}

function useChecklistReady(version: AscVersion, isFirstVersion: boolean): boolean {
  const { flags } = useSubmissionChecklist();
  const sl = flags.storeListing;
  const ad = flags.appDetails;
  const hasBuild = version.build !== null;
  const hasCopyright = !!(version.attributes.copyright?.trim());
  const rd = version.reviewDetail?.attributes;
  const hasContact = !!(rd?.contactEmail && rd?.contactFirstName && rd?.contactLastName && rd?.contactPhone);
  return hasBuild
    && flags.hasScreenshots === true
    && ad?.name.status === "ok"
    && sl?.description.status === "ok"
    && (isFirstVersion || sl?.whatsNew.status === "ok")
    && sl?.keywords.status === "ok"
    && sl?.supportUrl.status === "ok"
    && ad?.privacyPolicyUrl.status === "ok"
    && hasCopyright
    && hasContact;
}

export function VersionActionFooter() {
  const t = useTranslations();
  const { appId } = useParams<{ appId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { versions, refresh } = useVersions();
  const { isDirty, onSave, isSaving, hasValidationErrors } = useFormDirty();
  const { showAscError } = useErrorReport();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** null = not checked yet, true/false = has/doesn't have unresolved submission */
  const [unresolvedResult, setUnresolvedResult] = useState<{ value: boolean | null; forAppId: string; forRejected: boolean }>({ value: null, forAppId: "", forRejected: false });
  const { apps } = useApps();

  const pageSegment = getPageSegment(pathname);

  const version = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );

  // Auto-fetch app details + screenshot checklist flags
  const { flags, reportAppDetails, reportScreenshots } = useSubmissionChecklist();
  const primaryLocale = apps.find((a) => a.id === appId)?.primaryLocale ?? "";
  const versionId = version?.id ?? "";

  useEffect(() => {
    if (flags.appDetails || !appId || !primaryLocale) return;

    let cancelled = false;

    async function fetchAndReport() {
      try {
        const infoRes = await fetch(`/api/apps/${appId}/info`);
        if (!infoRes.ok) return;
        const infoData = await infoRes.json();
        const appInfos: { id: string; attributes: { state: string } }[] = infoData.appInfos ?? [];
        const LIVE = new Set(["READY_FOR_DISTRIBUTION", "ACCEPTED"]);
        const appInfo = appInfos.find((i) => !LIVE.has(i.attributes.state)) ?? appInfos[0];
        if (!appInfo) return;

        const locRes = await fetch(`/api/apps/${appId}/info/${appInfo.id}/localizations`);
        if (!locRes.ok) return;
        const locData = await locRes.json();
        const locs: { attributes: { locale: string; name: string | null; privacyPolicyUrl: string | null } }[] =
          locData.localizations ?? [];

        if (cancelled) return;

        const localeMap: Record<string, Record<string, string>> = {};
        for (const loc of locs) {
          localeMap[loc.attributes.locale] = {
            name: loc.attributes.name ?? "",
            privacyPolicyUrl: loc.attributes.privacyPolicyUrl ?? "",
          };
        }
        reportAppDetails(computeAppDetailsFlags(localeMap, primaryLocale));
      } catch {
        // Non-critical – checklist items will show as missing
      }
    }

    fetchAndReport();
    return () => { cancelled = true; };
  }, [appId, primaryLocale, flags.appDetails, reportAppDetails]);

  // Check if primary locale has at least one screenshot
  useEffect(() => {
    if (flags.hasScreenshots !== null || !appId || !versionId || !primaryLocale) return;

    let cancelled = false;

    async function checkScreenshots() {
      try {
        // Get version localizations to find the primary locale's ID
        const locRes = await fetch(`/api/apps/${appId}/versions/${versionId}/localizations`);
        if (!locRes.ok) return;
        const locData = await locRes.json();
        const locs: { id: string; attributes: { locale: string } }[] = locData.localizations ?? [];
        const primaryLoc = locs.find((l) => l.attributes.locale === primaryLocale);
        if (!primaryLoc || cancelled) return;

        // Fetch screenshot sets for the primary locale
        const ssRes = await fetch(
          `/api/apps/${appId}/versions/${versionId}/localizations/${primaryLoc.id}/screenshots`,
        );
        if (!ssRes.ok || cancelled) return;
        const ssData = await ssRes.json();
        const sets: { screenshots: unknown[] }[] = ssData.screenshotSets ?? [];
        const has = sets.some((s) => s.screenshots.length > 0);

        if (!cancelled) reportScreenshots(has);
      } catch {
        // Non-critical
      }
    }

    checkScreenshots();
    return () => { cancelled = true; };
  }, [appId, versionId, primaryLocale, flags.hasScreenshots, reportScreenshots]);

  // Check if a rejected version still has an UNRESOLVED_ISSUES submission
  const state = version?.attributes.appVersionState ?? "";
  const isRejected = REJECTED_STATES.has(state);

  // Derive hasUnresolved: null when not applicable or result is stale
  const hasUnresolved = (!appId || !isRejected)
    ? null
    : (unresolvedResult.forAppId === appId && unresolvedResult.forRejected === isRejected)
      ? unresolvedResult.value
      : null;

  useEffect(() => {
    if (!appId || !isRejected) return;

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/api/apps/${appId}/unresolved-submission`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setUnresolvedResult({ value: data.hasUnresolved, forAppId: appId, forRejected: true });
      } catch {
        // Non-critical – default to showing cancel
        if (!cancelled) setUnresolvedResult({ value: true, forAppId: appId, forRejected: true });
      }
    }

    check();
    return () => { cancelled = true; };
  }, [appId, isRejected]);

  if (!appId || !FOOTER_PAGES.has(pageSegment) || !version) return null;

  const isFirstVersion = !versions.some((v) =>
    v.attributes.platform === version.attributes.platform
    && v.attributes.appStoreState === "READY_FOR_SALE",
  );

  if (SUBMIT_STATES.has(state)) {
    return (
      <SubmitFooter
        appId={appId}
        version={version}
        isFirstVersion={isFirstVersion}
        isDirty={isDirty}
        isSaving={isSaving}
        hasValidationErrors={hasValidationErrors}
        loading={loading}
        confirmOpen={confirmOpen}
        onSave={onSave}
        showAscError={showAscError}
        refresh={refresh}
        setLoading={setLoading}
        setConfirmOpen={setConfirmOpen}
      />
    );
  }

  if (CANCEL_STATES.has(state)) {
    return (
      <>
        {loading && <LoadingOverlay label={t("versionAction.cancellingSubmission")} />}
        <ActionFooter>
          <Button
            variant="destructive"
            disabled={loading}
            onClick={() => setConfirmOpen(true)}
          >
            {t("versionAction.cancelSubmission")}
          </Button>
        </ActionFooter>
        <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("versionAction.cancelSubmissionTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("versionAction.cancelSubmissionDescription", { version: version.attributes.versionString })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("versionAction.keepInReview")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  setConfirmOpen(false);
                  setLoading(true);
                  try {
                    await apiFetch(
                      `/api/apps/${appId}/versions/${version.id}/cancel-submission`,
                      { method: "POST" },
                    );
                    toast.success(t("versionAction.submissionCancelled"));
                    await delay(ASC_PROPAGATION_DELAY);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("versionAction.cancelSubmissionFailed"));
                  }
                  setLoading(false);
                  await refresh();
                }}
              >
                {t("versionAction.cancelSubmission")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (isRejected && hasUnresolved === true) {
    return (
      <>
        {loading && <LoadingOverlay label={t("versionAction.cancellingSubmission")} />}
        <ActionFooter>
          <Button
            variant="destructive"
            disabled={loading}
            onClick={() => setConfirmOpen(true)}
          >
            {t("versionAction.cancelSubmission")}
          </Button>
        </ActionFooter>
        <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("versionAction.cancelSubmissionTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("versionAction.cancelSubmissionRejectedDescription", { version: version.attributes.versionString })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("versionAction.keepSubmission")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  setConfirmOpen(false);
                  setLoading(true);
                  try {
                    await apiFetch(
                      `/api/apps/${appId}/versions/${version.id}/cancel-submission`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ unresolved: true }),
                      },
                    );
                    toast.success(t("versionAction.submissionCancelled"));
                    await delay(ASC_PROPAGATION_DELAY);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("versionAction.cancelSubmissionFailed"));
                  }
                  setLoading(false);
                  setUnresolvedResult({ value: false, forAppId: appId, forRejected: true });
                  await refresh();
                }}
              >
                {t("versionAction.cancelSubmission")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (isRejected && hasUnresolved === false) {
    return (
      <SubmitFooter
        appId={appId}
        version={version}
        isFirstVersion={isFirstVersion}
        isDirty={isDirty}
        isSaving={isSaving}
        hasValidationErrors={hasValidationErrors}
        loading={loading}
        confirmOpen={confirmOpen}
        onSave={onSave}
        showAscError={showAscError}
        refresh={refresh}
        setLoading={setLoading}
        setConfirmOpen={setConfirmOpen}
      />
    );
  }

  if (state === "PENDING_DEVELOPER_RELEASE") {
    return (
      <>
        {loading && <LoadingOverlay label={t("versionAction.releasingVersion")} />}
        <ActionFooter>
          <Button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await apiFetch(
                  `/api/apps/${appId}/versions/${version.id}/release-now`,
                  { method: "POST" },
                );
                toast.success(t("versionAction.versionReleased"));
                await delay(ASC_PROPAGATION_DELAY);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t("versionAction.releaseVersionFailed"));
              }
              setLoading(false);
              await refresh();
            }}
          >
            {t("versionAction.releaseNow")}
          </Button>
        </ActionFooter>
      </>
    );
  }

  return null;
}

function SubmitFooter({
  appId,
  version,
  isFirstVersion,
  isDirty,
  isSaving,
  hasValidationErrors,
  loading,
  confirmOpen,
  onSave,
  showAscError,
  refresh,
  setLoading,
  setConfirmOpen,
}: {
  appId: string;
  version: AscVersion;
  isFirstVersion: boolean;
  isDirty: boolean;
  isSaving: boolean;
  hasValidationErrors: boolean;
  loading: boolean;
  confirmOpen: boolean;
  onSave: () => void | Promise<void>;
  showAscError: (data: AscErrorReportData) => void;
  refresh: () => Promise<void>;
  setLoading: (v: boolean) => void;
  setConfirmOpen: (v: boolean) => void;
}) {
  const t = useTranslations();
  const checklistReady = useChecklistReady(version, isFirstVersion);
  const canSubmit = checklistReady && !hasValidationErrors && !isSaving;

  async function handleSubmit() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      if (isDirty) await onSave();
      await apiFetch(
        `/api/apps/${appId}/versions/${version.id}/submit-for-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: version.attributes.platform }),
        },
      );
      toast.success(t("versionAction.submittedForReview"));
      await delay(ASC_PROPAGATION_DELAY);
    } catch (err) {
      if (err instanceof ApiError && (err.ascErrors?.length || err.ascAssociatedErrors)) {
        showAscError({
          message: err.message,
          ascErrors: err.ascErrors,
          ascMethod: err.ascMethod,
          ascPath: err.ascPath,
          ascAssociatedErrors: err.ascAssociatedErrors,
        });
      } else {
        toast.error(err instanceof Error ? err.message : t("versionAction.submitForReviewFailed"));
      }
    }
    setLoading(false);
    await refresh();
  }

  return (
    <>
      {loading && <LoadingOverlay label={t("versionAction.submittingForReview")} />}
      <ActionFooter left={<SubmissionChecklist version={version} isFirstVersion={isFirstVersion} />}>
        <Button disabled={!canSubmit || loading} onClick={() => setConfirmOpen(true)}>
          {t("versionAction.submitForReview")}
        </Button>
      </ActionFooter>
      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("versionAction.submitForReviewTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("versionAction.submitForReviewDescription", { version: version.attributes.versionString })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>
              {t("versionAction.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {label}
      </div>
    </div>
  );
}

