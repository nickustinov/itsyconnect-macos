"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useErrorReport } from "@/lib/error-report-context";
import { useChangeBuffer, useSectionBuffer } from "@/lib/change-buffer-context";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { resolveVersion } from "@/lib/asc/version-types";
import { FIELD_LIMITS } from "@/lib/asc/locale-names";
import { CharCount } from "@/components/char-count";
import { EmptyState } from "@/components/empty-state";
import { useTabNavigation } from "@/lib/hooks/use-tab-navigation";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function AppReviewPage() {
  const t = useTranslations();
  const tabRef = useTabNavigation();
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading, updateVersion } = useVersions();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );

  const reviewDetail = selectedVersion?.reviewDetail?.attributes;
  const versionId = selectedVersion?.id ?? "";

  const { setDirty, registerSave, registerDiscard, setValidationErrors } = useFormDirty();
  const { showAscError } = useErrorReport();
  const { bufferEnabled } = useChangeBuffer();
  const { bufferedData, save: saveToBuffer, discard: discardBuffer } = useSectionBuffer(appId, "review", versionId);
  const [notes, setNotes] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [demoName, setDemoName] = useState("");
  const [demoPassword, setDemoPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Track original values for diffing saves
  const originalRef = useRef({
    notes: "",
    signInRequired: false,
    demoName: "",
    demoPassword: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });

  // Populate form when version changes (compare by ID, not object reference)
  const [syncedVersionId, setSyncedVersionId] = useState("");
  if (versionId && versionId !== syncedVersionId) {
    setSyncedVersionId(versionId);
    if (bufferEnabled) {
      const buf = bufferedData as Record<string, unknown> | null;
      setNotes((buf?.notes as string | undefined) ?? reviewDetail?.notes ?? "");
      setSignInRequired((buf?.demoAccountRequired as boolean | undefined) ?? reviewDetail?.demoAccountRequired ?? false);
      setDemoName((buf?.demoAccountName as string | undefined) ?? reviewDetail?.demoAccountName ?? "");
      setDemoPassword((buf?.demoAccountPassword as string | undefined) ?? reviewDetail?.demoAccountPassword ?? "");
      setFirstName((buf?.contactFirstName as string | undefined) ?? reviewDetail?.contactFirstName ?? "");
      setLastName((buf?.contactLastName as string | undefined) ?? reviewDetail?.contactLastName ?? "");
      setPhone((buf?.contactPhone as string | undefined) ?? reviewDetail?.contactPhone ?? "");
      setEmail((buf?.contactEmail as string | undefined) ?? reviewDetail?.contactEmail ?? "");
    } else {
      setNotes(reviewDetail?.notes ?? "");
      setSignInRequired(reviewDetail?.demoAccountRequired ?? false);
      setDemoName(reviewDetail?.demoAccountName ?? "");
      setDemoPassword(reviewDetail?.demoAccountPassword ?? "");
      setFirstName(reviewDetail?.contactFirstName ?? "");
      setLastName(reviewDetail?.contactLastName ?? "");
      setPhone(reviewDetail?.contactPhone ?? "");
      setEmail(reviewDetail?.contactEmail ?? "");
      setDirty(false);
    }
  }

  // Snapshot originals for save diffing (must be in effect, not render)
  useEffect(() => {
    originalRef.current = {
      notes: reviewDetail?.notes ?? "",
      signInRequired: reviewDetail?.demoAccountRequired ?? false,
      demoName: reviewDetail?.demoAccountName ?? "",
      demoPassword: reviewDetail?.demoAccountPassword ?? "",
      firstName: reviewDetail?.contactFirstName ?? "",
      lastName: reviewDetail?.contactLastName ?? "",
      phone: reviewDetail?.contactPhone ?? "",
      email: reviewDetail?.contactEmail ?? "",
    };
  }, [reviewDetail]);

  // Validate field limits
  useEffect(() => {
    const limit = FIELD_LIMITS.reviewNotes;
    if (notes.length > limit) {
      setValidationErrors([t("appReview.validationNotesLimit", { limit })]);
    } else {
      setValidationErrors([]);
    }
  }, [notes, setValidationErrors, t]);

  // Overlay buffered changes on initial load
  const bufferAppliedRef = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: apply buffered overlay after async load */
  useEffect(() => {
    if (!bufferEnabled) return;
    if (!bufferedData || bufferAppliedRef.current) return;
    bufferAppliedRef.current = true;
    const buf = bufferedData as Record<string, unknown>;
    if (buf.notes !== undefined) setNotes(buf.notes as string);
    if (buf.demoAccountRequired !== undefined) setSignInRequired(buf.demoAccountRequired as boolean);
    if (buf.demoAccountName !== undefined) setDemoName(buf.demoAccountName as string);
    if (buf.demoAccountPassword !== undefined) setDemoPassword(buf.demoAccountPassword as string);
    if (buf.contactFirstName !== undefined) setFirstName(buf.contactFirstName as string);
    if (buf.contactLastName !== undefined) setLastName(buf.contactLastName as string);
    if (buf.contactPhone !== undefined) setPhone(buf.contactPhone as string);
    if (buf.contactEmail !== undefined) setEmail(buf.contactEmail as string);
  }, [bufferEnabled, bufferedData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Register save handler
  useEffect(() => {
    registerSave(async () => {
      if (bufferEnabled) {
        // --- Buffer save path ---
        const orig = originalRef.current;
        const current = {
          notes,
          demoAccountRequired: signInRequired,
          demoAccountName: demoName,
          demoAccountPassword: demoPassword,
          contactFirstName: firstName,
          contactLastName: lastName,
          contactPhone: phone,
          contactEmail: email,
        };
        const origAttrs = {
          notes: orig.notes,
          demoAccountRequired: orig.signInRequired,
          demoAccountName: orig.demoName,
          demoAccountPassword: orig.demoPassword,
          contactFirstName: orig.firstName,
          contactLastName: orig.lastName,
          contactPhone: orig.phone,
          contactEmail: orig.email,
        };

        const data: Record<string, unknown> = {};
        const origData: Record<string, unknown> = {};
        for (const k of Object.keys(current) as (keyof typeof current)[]) {
          if (current[k] !== origAttrs[k as keyof typeof origAttrs]) {
            data[k] = current[k];
            origData[k] = origAttrs[k as keyof typeof origAttrs];
          }
        }
        if (Object.keys(data).length === 0) {
          bufferAppliedRef.current = true;
          discardBuffer();
          setDirty(false);
          return;
        }

        data._reviewDetailId = selectedVersion?.reviewDetail?.id ?? null;
        origData._reviewDetailId = selectedVersion?.reviewDetail?.id ?? null;

        bufferAppliedRef.current = true;
        saveToBuffer(data, origData);
        toast.success(t("common.savedLocally"));
        setDirty(false);
        return;
      }

      // --- Direct ASC save path ---
      const res = await fetch(
        `/api/apps/${appId}/versions/${selectedVersion?.id}/review`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewDetailId: selectedVersion?.reviewDetail?.id ?? null,
            attributes: {
              notes,
              demoAccountRequired: signInRequired,
              demoAccountName: demoName,
              demoAccountPassword: demoPassword,
              contactFirstName: firstName,
              contactLastName: lastName,
              contactPhone: phone,
              contactEmail: email,
            },
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        if (data.ascErrors?.length) {
          showAscError({
            message: data.error ?? t("common.saveFailed"),
            ascErrors: data.ascErrors,
            ascMethod: data.ascMethod,
            ascPath: data.ascPath,
          });
        } else {
          toast.error(data.error ?? t("common.saveFailed"));
        }
        return;
      }

      toast.success(t("appReview.toastSaved"));

      if (selectedVersion) {
        updateVersion(selectedVersion.id, (v) => ({
          ...v,
          reviewDetail: {
            id: v.reviewDetail?.id ?? "",
            attributes: {
              notes,
              demoAccountRequired: signInRequired,
              demoAccountName: demoName,
              demoAccountPassword: demoPassword,
              contactFirstName: firstName,
              contactLastName: lastName,
              contactPhone: phone,
              contactEmail: email,
            },
          },
        }));
      }
      setDirty(false);
    });
  }, [
    appId, selectedVersion, notes, signInRequired, demoName, demoPassword,
    firstName, lastName, phone, email, bufferEnabled, registerSave, setDirty, updateVersion, showAscError, saveToBuffer, discardBuffer, t,
  ]);

  // Register discard handler for the header Discard button
  useEffect(() => {
    registerDiscard(() => {
      setNotes(reviewDetail?.notes ?? "");
      setSignInRequired(reviewDetail?.demoAccountRequired ?? false);
      setDemoName(reviewDetail?.demoAccountName ?? "");
      setDemoPassword(reviewDetail?.demoAccountPassword ?? "");
      setFirstName(reviewDetail?.contactFirstName ?? "");
      setLastName(reviewDetail?.contactLastName ?? "");
      setPhone(reviewDetail?.contactPhone ?? "");
      setEmail(reviewDetail?.contactEmail ?? "");
      if (bufferEnabled) {
        bufferAppliedRef.current = true;
        discardBuffer();
      }
    });
  }, [reviewDetail, bufferEnabled, registerDiscard, discardBuffer]);

  if (!app) {
    return <EmptyState title={t("app.notFound")} />;
  }

  if (versionsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={tabRef} className="space-y-6">
      {/* Review notes */}
      <section className="space-y-2">
        <h3 className="section-title">{t("appReview.notesTitle")}</h3>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              placeholder={t("appReview.notesPlaceholder")}
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount value={notes} limit={FIELD_LIMITS.reviewNotes} />
          </div>
        </Card>
      </section>

      {/* Demo account */}
      <section className="space-y-4">
        <h3 className="section-title">{t("appReview.demoAccount")}</h3>
        <div className="flex items-center gap-3">
          <Switch
            id="sign-in-required"
            checked={signInRequired}
            onCheckedChange={(v) => { setSignInRequired(v); setDirty(true); }}
          />
          <Label htmlFor="sign-in-required" className="text-sm">
            {t("appReview.signInRequired")}
          </Label>
        </div>
        {signInRequired && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("appReview.username")}</label>
              <Input
                dir="ltr"
                placeholder={t("appReview.usernamePlaceholder")}
                className="text-sm"
                value={demoName}
                onChange={(e) => { setDemoName(e.target.value); setDirty(true); }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("appReview.password")}</label>
              <Input
                dir="ltr"
                type="password"
                placeholder={t("appReview.password")}
                className="text-sm"
                value={demoPassword}
                onChange={(e) => { setDemoPassword(e.target.value); setDirty(true); }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Contact information */}
      <section className="space-y-2 pb-8">
        <h3 className="section-title">{t("appReview.contactDetails")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("appReview.contactHint")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("appReview.firstName")}</label>
            <Input
              className="text-sm"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("appReview.lastName")}</label>
            <Input
              className="text-sm"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("appReview.phone")}</label>
            <Input
              dir="ltr"
              className="text-sm"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("appReview.email")}</label>
            <Input
              dir="ltr"
              type="email"
              className="text-sm"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setDirty(true); }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
