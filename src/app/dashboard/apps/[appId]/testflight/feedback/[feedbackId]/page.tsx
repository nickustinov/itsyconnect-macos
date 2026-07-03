"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Spinner } from "@/components/ui/spinner";
import {
  BatteryHigh,
  Camera,
  CheckCircle,
  Clock,
  Copy,
  Cpu,
  Desktop,
  DeviceMobile,
  Globe,
  GlobeSimple,
  HardDrives,
  Monitor,
  Package,
  Trash,
  User,
  WarningCircle,
  WifiHigh,
  CircleNotch,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { TFFeedbackItem } from "@/lib/asc/testflight";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { apiFetch } from "@/lib/api-fetch";
import { formatDateTimeLong } from "@/lib/format";
import { useTranslations } from "@/lib/i18n/locale-context";

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  return `${gb.toFixed(1)} GB`;
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function FeedbackDetailPage() {
  const t = useTranslations();
  const { appId, feedbackId } = useParams<{
    appId: string;
    feedbackId: string;
  }>();
  const router = useRouter();

  const [item, setItem] = useState<TFFeedbackItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crashLog, setCrashLog] = useState<string | null>(null);
  const [crashLogLoading, setCrashLogLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/feedback`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("testflight.fetchFeedbackFailed"));
      }
      const data = await res.json();
      const found = (data.feedback as TFFeedbackItem[]).find(
        (f) => f.id === feedbackId,
      );
      setItem(found ?? null);
      const completedIds: string[] = data.completedIds ?? [];
      setCompleted(completedIds.includes(feedbackId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("testflight.fetchFeedbackFailed"));
    } finally {
      setLoading(false);
    }
  }, [appId, feedbackId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleLoadCrashLog() {
    setCrashLogLoading(true);
    try {
      const data = await apiFetch<{ logText: string }>(
        `/api/apps/${appId}/testflight/feedback/${feedbackId}/crash-log`,
      );
      setCrashLog(data.logText);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.loadCrashLogFailed"));
    } finally {
      setCrashLogLoading(false);
    }
  }

  async function handleToggleCompleted() {
    const next = !completed;
    setCompleted(next);
    try {
      await apiFetch(`/api/apps/${appId}/testflight/feedback/completed`, {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId }),
      });
    } catch (err) {
      setCompleted(!next);
      toast.error(err instanceof Error ? err.message : t("testflight.updateFailed"));
    }
  }

  async function handleDelete() {
    if (!item) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/apps/${appId}/testflight/feedback`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, type: item.type }),
      });
      toast.success(t("testflight.feedbackDeleted"));
      router.push(`/dashboard/apps/${appId}/testflight/feedback`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.deleteFeedbackFailed"));
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircleNotch size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchData()} />;
  }

  if (!item) {
    return <EmptyState title={t("testflight.feedbackNotFound")} />;
  }

  const feedbackTypeLabel = item.type === "screenshot"
    ? t("testflight.screenshot")
    : t("testflight.crash");

  const specs = [
    item.buildNumber && {
      icon: Package,
      label: t("testflight.build"),
      value: item.buildNumber,
    },
    item.buildBundleId && {
      icon: GlobeSimple,
      label: t("testflight.bundleId"),
      value: item.buildBundleId,
    },
    item.appPlatform && {
      icon: Desktop,
      label: t("analytics.platform"),
      value: item.appPlatform,
    },
    item.deviceModel && {
      icon: DeviceMobile,
      label: t("testflight.device"),
      value: item.deviceModel,
    },
    item.osVersion && {
      icon: Desktop,
      label: t("testflight.osVersion"),
      value: item.osVersion,
    },
    item.architecture && {
      icon: Cpu,
      label: t("testflight.architecture"),
      value: item.architecture,
    },
    item.locale && {
      icon: Globe,
      label: t("testflight.locale"),
      value: item.locale,
    },
    item.connectionType && {
      icon: WifiHigh,
      label: t("testflight.connection"),
      value: item.connectionType,
    },
    item.batteryPercentage != null && {
      icon: BatteryHigh,
      label: t("testflight.battery"),
      value: `${item.batteryPercentage}%`,
    },
    item.timeZone && {
      icon: Clock,
      label: t("testflight.timeZone"),
      value: item.timeZone,
    },
    (item.diskBytesAvailable != null && item.diskBytesTotal != null) && {
      icon: HardDrives,
      label: t("testflight.diskSpace"),
      value: t("testflight.diskSpaceValue", {
        free: formatBytes(item.diskBytesAvailable),
        total: formatBytes(item.diskBytesTotal),
      }),
    },
    (item.screenWidth != null && item.screenHeight != null) && {
      icon: Monitor,
      label: t("testflight.screen"),
      value: t("testflight.screenValue", {
        width: item.screenWidth,
        height: item.screenHeight,
      }),
    },
    item.appUptimeMs != null && {
      icon: Clock,
      label: t("testflight.appUptime"),
      value: formatUptime(item.appUptimeMs),
    },
    item.pairedAppleWatch && {
      icon: DeviceMobile,
      label: t("testflight.appleWatch"),
      value: item.pairedAppleWatch,
    },
  ].filter(Boolean) as Array<{ icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge
            variant={item.type === "crash" ? "destructive" : "secondary"}
            className="gap-1.5 text-xs font-normal"
          >
            {item.type === "screenshot" ? (
              <Camera size={12} />
            ) : (
              <WarningCircle size={12} />
            )}
            {feedbackTypeLabel}
          </Badge>
          {item.testerName && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <User size={14} />
              {item.testerName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={completed ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={handleToggleCompleted}
          >
            <CheckCircle size={14} weight={completed ? "fill" : "regular"} />
            {completed ? t("testflight.completed") : t("testflight.markAsCompleted")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash size={14} />
            {t("testflight.delete")}
          </Button>
        </div>
      </div>

      {/* Date */}
      <section className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("testflight.date")}
        </p>
        <p className="text-lg font-semibold">{formatDateTimeLong(item.createdDate)}</p>
      </section>

      {/* Comment */}
      {item.comment && (
        <Card className="bg-muted/50">
          <CardContent className="space-y-1 py-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("testflight.comment")}
            </p>
            <p className="text-sm leading-relaxed">{item.comment}</p>
          </CardContent>
        </Card>
      )}

      {/* Screenshots */}
      {item.screenshots.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="space-y-3 py-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("testflight.screenshots")}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {item.screenshots.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="overflow-hidden rounded-lg border transition-opacity hover:opacity-80"
                >
                  <img
                    src={s.url}
                    alt={t("testflight.screenshotIndex", { index: i + 1 })}
                    className="h-auto w-full object-contain"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Crash log */}
      {item.hasCrashLog && (
        <Card className="bg-muted/50">
          <CardContent className="space-y-3 py-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("testflight.crashLog")}
            </p>
            {crashLog == null ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadCrashLog}
                disabled={crashLogLoading}
              >
                {crashLogLoading && <Spinner className="mr-1.5" />}
                {t("testflight.viewCrashLog")}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(crashLog);
                      toast.success(t("testflight.crashLogCopied"));
                    }}
                  >
                    <Copy size={12} />
                    {t("common.copy")}
                  </Button>
                </div>
                <pre className="max-h-96 overflow-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed">
                  {crashLog}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Specs */}
      {specs.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="space-y-0 py-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              {t("testflight.specs")}
            </p>
            <div className="divide-y divide-dotted">
              {specs.map((spec) => (
                <div
                  key={spec.label}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <spec.icon
                      size={16}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="text-sm font-medium">{spec.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email */}
      {item.email && (
        <Card className="bg-muted/50">
          <CardContent className="space-y-2 py-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("appReview.email")}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(item.email!);
                  toast.success(t("testflight.emailCopied"));
                }}
              >
                <Copy size={12} />
                {t("common.copy")}
              </Button>
            </div>
            <p className="text-sm text-blue-600">{item.email}</p>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("testflight.deleteFeedbackTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("testflight.deleteFeedbackDescription", { type: feedbackTypeLabel })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Spinner className="mr-1.5" />}
              {t("testflight.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
