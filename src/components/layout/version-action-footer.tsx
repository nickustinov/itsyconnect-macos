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

/** Brief pause to let ASC propagate state changes before re-fetching. */
const ASC_PROPAGATION_DELAY = 3000;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FOOTER_PAGES = new Set(["store-listing"]);

const SUBMIT_STATES = new Set(["PREPARE_FOR_SUBMISSION"]);
const RESUBMIT_STATES = new Set(["REJECTED", "METADATA_REJECTED", "DEVELOPER_REJECTED"]);
const CANCEL_STATES = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW"]);

function getPageSegment(pathname: string): string {
  const parts = pathname.split("/");
  return parts[parts.length - 1] ?? "";
}

function ChecklistIcon({ status, localesWithIssues }: { status: FieldStatus; localesWithIssues?: string[] }) {
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
          <p className="mb-2">Missing in {n} locale{n > 1 ? "s" : ""}:</p>
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
    { label: "Build", status: hasBuild ? "ok" : "missing" },
    { label: "Screenshots", status: screenshotStatus },
    { label: "Name", status: ad?.name.status ?? "missing", localesWithIssues: ad?.name.localesWithIssues },
    { label: "Description", status: sl?.description.status ?? "missing", localesWithIssues: sl?.description.localesWithIssues },
    ...(!isFirstVersion ? [{ label: "What's new", status: sl?.whatsNew.status ?? "missing", localesWithIssues: sl?.whatsNew.localesWithIssues }] : []),
    { label: "Keywords", status: sl?.keywords.status ?? "missing", localesWithIssues: sl?.keywords.localesWithIssues },
    { label: "Support", status: sl?.supportUrl.status ?? "missing", localesWithIssues: sl?.supportUrl.localesWithIssues },
    { label: "Privacy", status: ad?.privacyPolicyUrl.status ?? "missing", localesWithIssues: ad?.privacyPolicyUrl.localesWithIssues },
    { label: "Copyright", status: hasCopyright ? "ok" : "missing" },
    { label: "Contact", status: hasContact ? "ok" : "missing" },
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
  const { appId } = useParams<{ appId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { versions, refresh } = useVersions();
  const { isDirty, onSave, isSaving, hasValidationErrors } = useFormDirty();
  const { showAscError } = useErrorReport();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  if (!appId || !FOOTER_PAGES.has(pageSegment) || !version) return null;

  const isFirstVersion = !versions.some((v) => v.attributes.appStoreState === "READY_FOR_SALE");
  const state = version.attributes.appVersionState;

  const isSubmit = SUBMIT_STATES.has(state);
  const isResubmit = RESUBMIT_STATES.has(state);

  if (isSubmit || isResubmit) {
    return (
      <SubmitFooter
        appId={appId}
        version={version}
        isFirstVersion={isFirstVersion}
        isResubmit={isResubmit}
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
        {loading && <LoadingOverlay label="Cancelling submission…" />}
        <Footer>
          <Button
            variant="destructive"
            disabled={loading}
            onClick={() => setConfirmOpen(true)}
          >
            Cancel submission
          </Button>
        </Footer>
        <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel submission?</AlertDialogTitle>
              <AlertDialogDescription>
                Version {version.attributes.versionString} will be removed from App Review.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep in review</AlertDialogCancel>
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
                    toast.success("Submission cancelled");
                    await delay(ASC_PROPAGATION_DELAY);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to cancel submission");
                  }
                  setLoading(false);
                  await refresh();
                }}
              >
                Cancel submission
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (state === "PENDING_DEVELOPER_RELEASE") {
    return (
      <>
        {loading && <LoadingOverlay label="Releasing version…" />}
        <Footer>
          <Button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await apiFetch(
                  `/api/apps/${appId}/versions/${version.id}/release-now`,
                  { method: "POST" },
                );
                toast.success("Version released");
                await delay(ASC_PROPAGATION_DELAY);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to release version");
              }
              setLoading(false);
              await refresh();
            }}
          >
            Release now
          </Button>
        </Footer>
      </>
    );
  }

  return null;
}

function SubmitFooter({
  appId,
  version,
  isFirstVersion,
  isResubmit,
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
  isResubmit: boolean;
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
  const checklistReady = useChecklistReady(version, isFirstVersion);
  const canSubmit = checklistReady && !hasValidationErrors && !isSaving;

  const label = isResubmit ? "Resubmit for review" : "Submit for review";
  const confirmTitle = isResubmit ? "Resubmit for review?" : "Submit for review?";

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
      toast.success("Submitted for review");
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
        toast.error(err instanceof Error ? err.message : "Failed to submit for review");
      }
    }
    setLoading(false);
    await refresh();
  }

  return (
    <>
      {loading && <LoadingOverlay label="Submitting for review…" />}
      <Footer left={<SubmissionChecklist version={version} isFirstVersion={isFirstVersion} />}>
        <Button disabled={!canSubmit || loading} onClick={() => setConfirmOpen(true)}>
          {label}
        </Button>
      </Footer>
      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Version {version.attributes.versionString} will be submitted to App Review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>
              Submit
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

function Footer({ left, children }: { left?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-t bg-sidebar px-6 py-3">
      <div className="min-w-0 flex-1">{left}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
