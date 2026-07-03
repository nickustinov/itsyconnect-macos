"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CircleNotch, UserPlus, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { TFTester } from "@/lib/asc/testflight";
import { useTranslations } from "@/lib/i18n/locale-context";
import { AddTesterDialog } from "./add-tester-dialog";

function testerStatusLabel(
  state: string | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  const labels: Record<string, string> = {
    INSTALLED: t("testflight.testerStatus.INSTALLED"),
    ACCEPTED: t("testflight.testerStatus.ACCEPTED"),
    INVITED: t("testflight.testerStatus.INVITED"),
    NOT_INVITED: t("testflight.testerStatus.NOT_INVITED"),
    REVOKED: t("testflight.testerStatus.REVOKED"),
  };
  if (state && labels[state]) return labels[state];
  return state?.toLowerCase().replace(/_/g, " ") ?? t("testflight.unknownVersion");
}

export function TestersSection({
  appId,
  buildId,
  testers,
  onRemoved,
  onTesterAdded,
}: {
  appId: string;
  buildId: string;
  testers: TFTester[];
  onRemoved: () => void;
  onTesterAdded: (tester: TFTester) => void;
}) {
  const t = useTranslations();
  const [removing, setRemoving] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function removeTester(testerId: string) {
    setRemoving(testerId);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [testerId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("testflight.removeTesterFromBuildFailed"));
      }
      toast.success(t("testflight.testerRemovedFromBuild"));
      onRemoved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.removeTesterFromBuildFailed"));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{t("testflight.individualTesters")}</h3>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <UserPlus size={14} className="mr-1.5" />
          {t("testflight.addTester")}
        </Button>
      </div>
      {testers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("testflight.noIndividualTesters")}
        </div>
      ) : (
        <div className="space-y-1">
          {testers.map((tester) => (
            <div
              key={tester.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div className="flex flex-1 items-center gap-3 min-w-0">
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
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  tester.state === "INSTALLED"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : tester.state === "ACCEPTED"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {testerStatusLabel(tester.state, t)}
                </span>
                <div className="hidden items-center gap-4 text-xs text-muted-foreground tabular-nums sm:flex">
                  <span>{t("testflight.sessionsCount", { count: tester.sessions })}</span>
                  <span>{t("testflight.crashesCount", { count: tester.crashes })}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeTester(tester.id)}
                disabled={removing === tester.id}
              >
                {removing === tester.id ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <X size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddTesterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appId={appId}
        buildId={buildId}
        existingTesterIds={testers.map((tester) => tester.id)}
        onAdded={onTesterAdded}
      />
    </section>
  );
}
