"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CircleNotch, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { TFTester } from "@/lib/asc/testflight";
import { useTranslations } from "@/lib/i18n/locale-context";

export function AddTesterDialog({
  open,
  onOpenChange,
  appId,
  buildId,
  existingTesterIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  buildId: string;
  existingTesterIds: string[];
  onAdded: (tester: TFTester) => void;
}) {
  const t = useTranslations();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [appTesters, setAppTesters] = useState<TFTester[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const existingSet = useMemo(() => new Set(existingTesterIds), [existingTesterIds]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setEmail("");
    setFirstName("");
    setLastName("");
    setMode("existing");

    setLoadingTesters(true);
    fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers?scope=app`)
      .then((res) => res.ok ? res.json() : { testers: [] })
      .then((data) => setAppTesters(data.testers ?? []))
      .catch(() => setAppTesters([]))
      .finally(() => setLoadingTesters(false));
  }, [open, appId, buildId]);

  const filteredTesters = useMemo(() => {
    const available = appTesters.filter((tester) => !existingSet.has(tester.id));
    if (!search) return available;
    const q = search.toLowerCase();
    return available.filter(
      (tester) =>
        tester.firstName.toLowerCase().includes(q) ||
        tester.lastName.toLowerCase().includes(q) ||
        (tester.email?.toLowerCase().includes(q) ?? false),
    );
  }, [appTesters, existingSet, search]);

  async function addExisting(testerId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [testerId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("testflight.addTesterFailed"));
      }
      const tester = appTesters.find((item) => item.id === testerId);
      if (tester) {
        onAdded({ ...tester, state: "INVITED" });
      }
      toast.success(t("testflight.testerAddedAndInvited"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.addTesterFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function addNew() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("testflight.addTesterFailed"));
      }
      const data = await res.json();
      onAdded({
        id: data.testerId,
        firstName: firstName.trim() || t("testflight.anonymous"),
        lastName: lastName.trim(),
        email: email.trim(),
        inviteType: "EMAIL",
        state: "INVITED",
        sessions: 0,
        crashes: 0,
        feedbackCount: 0,
      });
      toast.success(t("testflight.testerInvitedToBuild"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.addTesterFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("testflight.addTester")}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-3">
          <Button
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("existing")}
          >
            {t("testflight.pickExisting")}
          </Button>
          <Button
            variant={mode === "new" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("new")}
          >
            {t("testflight.addNew")}
          </Button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-3">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("testflight.searchTesters")}
                className="pl-8"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {loadingTesters ? (
                <div className="flex items-center justify-center py-8">
                  <CircleNotch size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : filteredTesters.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {search ? t("testflight.noMatchingTesters") : t("testflight.noAvailableTesters")}
                </p>
              ) : (
                filteredTesters.map((tester) => (
                  <button
                    key={tester.id}
                    onClick={() => addExisting(tester.id)}
                    disabled={submitting}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {tester.firstName} {tester.lastName}
                      </p>
                      {tester.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {tester.email}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("appReview.email")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("testflight.emailPlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t("appReview.firstName")}</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t("common.optional")}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t("appReview.lastName")}</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t("common.optional")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={addNew}
                disabled={submitting || !email.trim()}
              >
                {submitting && <CircleNotch size={14} className="mr-1.5 animate-spin" />}
                {t("testflight.addTester")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
