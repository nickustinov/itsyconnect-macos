"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle, WarningCircle, CircleNotch } from "@phosphor-icons/react";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import type { TFFeedbackItem } from "@/lib/asc/testflight";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";

function isWithinDays(iso: string, days: number): boolean {
  const now = Date.now();
  const date = new Date(iso);
  return (now - date.getTime()) / (1000 * 60 * 60 * 24) <= days;
}

export default function FeedbackPage() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);

  const [allFeedback, setAllFeedback] = useState<TFFeedbackItem[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/feedback`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to fetch feedback (${res.status})`);
      }
      const data = await res.json();
      setAllFeedback(data.feedback);
      setCompletedIds(new Set(data.completedIds ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch feedback");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(async () => fetchData(), [fetchData]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  const buildNumbers = useMemo(
    () => [...new Set(allFeedback.map((f) => f.buildNumber).filter(Boolean))] as string[],
    [allFeedback],
  );

  const platforms = useMemo(
    () => [...new Set(allFeedback.map((f) => f.appPlatform).filter(Boolean))] as string[],
    [allFeedback],
  );

  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [buildFilter, setBuildFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [hideCompleted, setHideCompleted] = useState(() => {
    try {
      return localStorage.getItem("feedback-hide-completed") === "true";
    } catch {
      return false;
    }
  });

  const filtered = useMemo(() => {
    let items = allFeedback;

    if (typeFilter !== "all") {
      items = items.filter((f) => f.type === typeFilter);
    }

    if (dateFilter !== "all") {
      const days = parseInt(dateFilter);
      items = items.filter((f) => isWithinDays(f.createdDate, days));
    }

    if (buildFilter !== "all") {
      items = items.filter((f) => f.buildNumber === buildFilter);
    }

    if (platformFilter !== "all") {
      items = items.filter((f) => f.appPlatform === platformFilter);
    }

    if (hideCompleted) {
      items = items.filter((f) => !completedIds.has(f.id));
    }

    return items;
  }, [allFeedback, typeFilter, dateFilter, buildFilter, platformFilter, hideCompleted, completedIds]);

  // Stats
  const stats = useMemo(() => {
    const screenshots = allFeedback.filter((f) => f.type === "screenshot").length;
    const crashes = allFeedback.filter((f) => f.type === "crash").length;
    return { total: allFeedback.length, screenshots, crashes };
  }, [allFeedback]);

  if (!app) {
    return <EmptyState title="App not found" />;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircleNotch size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchData()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardContent className="flex items-center gap-8 py-0">
          <div>
            <div className="text-4xl font-bold tabular-nums">{stats.total}</div>
            <p className="text-xs text-muted-foreground">total feedback</p>
          </div>
          <div className="h-10 border-l" />
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold tabular-nums">{stats.screenshots}</div>
              <p className="text-xs text-muted-foreground">screenshots</p>
            </div>
          </div>
          <div className="h-10 border-l" />
          <div className="flex items-center gap-2">
            <WarningCircle size={16} className="text-destructive" />
            <div>
              <div className="text-lg font-semibold tabular-nums">{stats.crashes}</div>
              <p className="text-xs text-muted-foreground">crashes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="screenshot">Screenshots</SelectItem>
            <SelectItem value="crash">Crashes</SelectItem>
          </SelectContent>
        </Select>

        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={buildFilter} onValueChange={setBuildFilter}>
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All builds</SelectItem>
            {buildNumbers.map((b) => (
              <SelectItem key={b} value={b}>
                Build {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id="hide-completed"
            checked={hideCompleted}
            onCheckedChange={(checked) => {
              setHideCompleted(checked);
              try {
                localStorage.setItem("feedback-hide-completed", String(checked));
              } catch {
                // Storage unavailable – silently skip
              }
            }}
          />
          <Label htmlFor="hide-completed" className="text-sm">
            Hide completed
          </Label>
        </div>
      </div>

      {/* Feedback list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No feedback matches the current filters.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer transition-colors hover:bg-muted/30"
              onClick={() =>
                router.push(
                  `/dashboard/apps/${appId}/testflight/feedback/${item.id}`,
                )
              }
            >
              <CardContent className="space-y-3 py-0">
                {/* Header: type badge + date */}
                <div className="flex items-center justify-between">
                  <Badge
                    variant={item.type === "crash" ? "destructive" : "secondary"}
                    className="gap-1.5 text-xs font-normal"
                  >
                    {item.type === "screenshot" ? (
                      <Camera size={12} />
                    ) : (
                      <WarningCircle size={12} />
                    )}
                    {item.type === "screenshot" ? "Screenshot" : "Crash"}
                  </Badge>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {completedIds.has(item.id) && (
                      <CheckCircle size={14} weight="fill" className="text-green-600" />
                    )}
                    {formatDate(item.createdDate)}
                  </span>
                </div>

                {/* Comment + screenshot thumbnail */}
                <div className="flex gap-3">
                  <p className="flex-1 text-sm line-clamp-2">{item.comment}</p>
                  {item.screenshots.length > 0 && (
                    <img
                      src={item.screenshots[0].url}
                      alt="Screenshot thumbnail"
                      className="h-14 w-14 shrink-0 rounded border object-cover"
                    />
                  )}
                </div>

                {/* Footer: metadata */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {item.testerName ?? item.email ?? "Anonymous"}
                    {item.deviceModel ? ` · ${item.deviceModel}` : ""}
                  </span>
                  {item.buildNumber && (
                    <span className="text-xs text-muted-foreground">
                      Build {item.buildNumber}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
