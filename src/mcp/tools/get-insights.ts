import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listCustomerReviews } from "@/lib/asc/reviews";
import { buildAnalyticsData, type AnalyticsData } from "@/lib/asc/analytics";
import { discoverySourceName, sumDiscoverySources, sumTerritories } from "@/lib/asc/analytics-summary";
import { listFeedback } from "@/lib/asc/testflight/feedback";
import { listBuilds } from "@/lib/asc/testflight/builds";
import { listDiagnosticSignatures } from "@/lib/asc/testflight/diagnostics";
import { resolveApp, isError } from "@/mcp/resolve";

type Topic = "overview" | "reviews" | "analytics" | "stability";
type Period = "week" | "month" | "quarter";

function periodDays(period: Period): number {
  switch (period) {
    case "week": return 7;
    case "month": return 30;
    case "quarter": return 90;
  }
}

function filterByPeriod<T extends { date: string }>(rows: T[], days: number): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows.filter((r) => r.date >= cutoffStr);
}

function sumField<T>(rows: T[], fn: (r: T) => number): number {
  return rows.reduce((s, r) => s + fn(r), 0);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

// ── Topic: reviews ─────────────────────────────────────────────

async function buildReviews(appId: string, days: number): Promise<string> {
  const reviews = await listCustomerReviews(appId, "-createdDate");

  if (reviews.length === 0) return "No customer reviews.";

  // Rating distribution
  const dist = [0, 0, 0, 0, 0];
  for (const r of reviews) dist[r.attributes.rating - 1]++;
  const avg = reviews.reduce((s, r) => s + r.attributes.rating, 0) / reviews.length;

  const lines: string[] = [
    `## Reviews (${reviews.length} total)`,
    "",
    `Average rating: ${avg.toFixed(1)}/5`,
    `Distribution: ${dist.map((c, i) => `${i + 1}★ ${c}`).join(", ")}`,
  ];

  // Unanswered count
  const unanswered = reviews.filter((r) => !r.response).length;
  if (unanswered > 0) lines.push(`Unanswered: ${unanswered}`);

  // Recent reviews within period
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();
  const recent = reviews.filter((r) => r.attributes.createdDate >= cutoffStr).slice(0, 15);

  if (recent.length > 0) {
    lines.push("", `### Recent (last ${days} days)`);
    for (const r of recent) {
      const a = r.attributes;
      const responded = r.response ? " [responded]" : "";
      lines.push(`- ${a.rating}★ "${a.title}" – ${a.body.slice(0, 120)}${a.body.length > 120 ? "..." : ""} (${a.territory}, ${a.createdDate.slice(0, 10)})${responded}`);
    }
  }

  return lines.join("\n");
}

// ── Topic: analytics ───────────────────────────────────────────

async function buildAnalytics(appId: string, days: number): Promise<string> {
  let data: AnalyticsData;
  try {
    data = await buildAnalyticsData(appId);
  } catch {
    return "Analytics data not available. Reports may still be provisioning.";
  }

  if (data.dailyDownloads.length === 0) {
    return "No analytics data available yet. Reports may still be provisioning.";
  }

  const dl = filterByPeriod(data.dailyDownloads, days);
  const rev = filterByPeriod(data.dailyRevenue, days);
  const sess = filterByPeriod(data.dailySessions, days);
  const eng = filterByPeriod(data.dailyEngagement, days);
  const crashes = filterByPeriod(data.dailyCrashes, days);

  const totalDownloads = sumField(dl, (r) => r.firstTime + r.redownload);
  const totalFirstTime = sumField(dl, (r) => r.firstTime);
  const totalRevenue = sumField(rev, (r) => r.proceeds);
  const totalSessions = sumField(sess, (r) => r.sessions);
  const avgDuration = sess.length > 0
    ? sess.reduce((s, r) => s + r.avgDuration, 0) / sess.length
    : 0;
  const totalCrashes = sumField(crashes, (r) => r.crashes);
  const totalImpressions = sumField(eng, (r) => r.impressions);
  const totalPageViews = sumField(eng, (r) => r.pageViews);

  const lines: string[] = [
    `## Analytics (last ${days} days)`,
    "",
    `Downloads: ${formatNumber(totalDownloads)} (${formatNumber(totalFirstTime)} first-time)`,
    `Revenue: ${formatCurrency(totalRevenue)}`,
    `Sessions: ${formatNumber(totalSessions)}, avg duration: ${avgDuration.toFixed(0)}s`,
    `Impressions: ${formatNumber(totalImpressions)}, page views: ${formatNumber(totalPageViews)}`,
    `Crashes: ${formatNumber(totalCrashes)}`,
  ];

  // Top territories
  const territories = sumTerritories(
    filterByPeriod(data.dailyTerritoryDownloads, days),
    filterByPeriod(data.dailyTerritoryRevenue, days),
  );
  if (territories.length > 0) {
    lines.push("", "### Top territories");
    for (const t of territories.slice(0, 10)) {
      lines.push(`- ${t.territory} (${t.code}): ${formatNumber(t.downloads)} downloads, ${formatCurrency(t.revenue)}`);
    }
  }

  // Discovery sources
  const sources = sumDiscoverySources(filterByPeriod(data.dailyDownloadsBySource, days));
  if (sources.length > 0) {
    const total = sumField(sources, (s) => s.count);
    lines.push("", "### Discovery sources");
    for (const s of sources) {
      const pct = ((s.count / total) * 100).toFixed(0);
      lines.push(`- ${discoverySourceName(s.source)}: ${formatNumber(s.count)} (${pct}%)`);
    }
  }

  // Performance regressions
  if (data.perfRegressions.length > 0) {
    lines.push("", "### Performance regressions");
    for (const r of data.perfRegressions) {
      lines.push(`- ${r.metricCategory}/${r.metric} (v${r.latestVersion}): ${r.summary}`);
    }
  }

  return lines.join("\n");
}

// ── Topic: stability ───────────────────────────────────────────

async function buildStability(appId: string, days: number, versionFilter?: string): Promise<string> {
  const [analyticsResult, feedback, builds] = await Promise.all([
    buildAnalyticsData(appId).catch(() => null),
    listFeedback(appId),
    listBuilds(appId, false, { lite: true }),
  ]);

  const lines: string[] = [`## Stability (last ${days} days)`];

  // Crash trends from analytics
  if (analyticsResult) {
    const crashes = filterByPeriod(analyticsResult.dailyCrashes, days);
    const totalCrashes = sumField(crashes, (r) => r.crashes);
    const uniqueDevices = sumField(crashes, (r) => r.uniqueDevices);
    lines.push("", `Crashes: ${formatNumber(totalCrashes)} across ${formatNumber(uniqueDevices)} devices`);

    // By version (top 5)
    const byVersion = analyticsResult.crashesByVersion
      .filter((v) => !versionFilter || v.version === versionFilter)
      .slice(0, 5);
    if (byVersion.length > 0) {
      lines.push("", "### Crashes by version");
      for (const v of byVersion) {
        lines.push(`- v${v.version} (${v.platform}): ${formatNumber(v.crashes)} crashes, ${formatNumber(v.uniqueDevices)} devices`);
      }
    }

    // By device (top 5)
    const byDevice = analyticsResult.crashesByDevice.slice(0, 5);
    if (byDevice.length > 0) {
      lines.push("", "### Crashes by device");
      for (const d of byDevice) {
        lines.push(`- ${d.device}: ${formatNumber(d.crashes)} crashes`);
      }
    }

    // Performance regressions
    if (analyticsResult.perfRegressions.length > 0) {
      lines.push("", "### Performance regressions");
      for (const r of analyticsResult.perfRegressions) {
        lines.push(`- ${r.metricCategory}/${r.metric} (v${r.latestVersion}): ${r.summary}`);
      }
    }
  }

  // TestFlight feedback
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();
  const recentFeedback = feedback
    .filter((f) => f.createdDate >= cutoffStr)
    .filter((f) => !versionFilter || f.buildNumber === versionFilter)
    .slice(0, 10);

  if (recentFeedback.length > 0) {
    const crashCount = recentFeedback.filter((f) => f.type === "crash").length;
    const screenshotCount = recentFeedback.filter((f) => f.type === "screenshot").length;
    lines.push(
      "",
      `### TestFlight feedback (${recentFeedback.length} recent: ${crashCount} crashes, ${screenshotCount} screenshots)`,
    );
    for (const f of recentFeedback) {
      const comment = f.comment ? ` – "${f.comment.slice(0, 80)}${f.comment.length > 80 ? "..." : ""}"` : "";
      const device = f.deviceModel ?? f.deviceFamily ?? "unknown device";
      lines.push(`- [${f.type}] ${device} (${f.osVersion ?? "?"})${comment} (build ${f.buildNumber ?? "?"}, ${f.createdDate.slice(0, 10)})`);
    }
  } else {
    lines.push("", "No TestFlight feedback in this period.");
  }

  // Latest build diagnostics
  const latestValid = builds.find((b) =>
    b.status !== "Processing" && b.status !== "Invalid"
    && (!versionFilter || b.versionString === versionFilter),
  );
  if (latestValid) {
    const sigs = await listDiagnosticSignatures(latestValid.id);
    if (sigs.length > 0) {
      const byType = new Map<string, number>();
      for (const s of sigs) {
        byType.set(s.diagnosticType, (byType.get(s.diagnosticType) ?? 0) + 1);
      }
      lines.push(
        "",
        `### Diagnostics (build ${latestValid.buildNumber}, v${latestValid.versionString})`,
      );
      for (const [type, count] of byType) {
        lines.push(`- ${type}: ${count} signatures`);
      }
    }
  }

  return lines.join("\n");
}

// ── Topic: overview ────────────────────────────────────────────

async function buildOverview(appId: string, days: number): Promise<string> {
  const [reviews, analyticsResult, feedback, builds] = await Promise.all([
    listCustomerReviews(appId, "-createdDate").catch(() => []),
    buildAnalyticsData(appId).catch(() => null),
    listFeedback(appId).catch(() => []),
    listBuilds(appId, false, { lite: true }).catch(() => []),
  ]);

  const lines: string[] = [`## Overview (last ${days} days)`];

  // Downloads & revenue
  if (analyticsResult && analyticsResult.dailyDownloads.length > 0) {
    const dl = filterByPeriod(analyticsResult.dailyDownloads, days);
    const rev = filterByPeriod(analyticsResult.dailyRevenue, days);
    const totalDownloads = sumField(dl, (r) => r.firstTime + r.redownload);
    const totalRevenue = sumField(rev, (r) => r.proceeds);
    lines.push("", `Downloads: ${formatNumber(totalDownloads)}`);
    lines.push(`Revenue: ${formatCurrency(totalRevenue)}`);

    // Crash trend
    const crashes = filterByPeriod(analyticsResult.dailyCrashes, days);
    const totalCrashes = sumField(crashes, (r) => r.crashes);
    if (totalCrashes > 0) {
      lines.push(`Crashes: ${formatNumber(totalCrashes)}`);
    }

    // Performance regressions
    if (analyticsResult.perfRegressions.length > 0) {
      lines.push(`Performance regressions: ${analyticsResult.perfRegressions.length}`);
    }
  } else {
    lines.push("", "Analytics data not available yet.");
  }

  // Reviews summary
  if (reviews.length > 0) {
    const avg = reviews.reduce((s, r) => s + r.attributes.rating, 0) / reviews.length;
    const unanswered = reviews.filter((r) => !r.response).length;
    lines.push("", `Rating: ${avg.toFixed(1)}/5 (${reviews.length} reviews, ${unanswered} unanswered)`);

    // Recent negative reviews
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();
    const negative = reviews
      .filter((r) => r.attributes.rating <= 3 && r.attributes.createdDate >= cutoffStr)
      .slice(0, 5);
    if (negative.length > 0) {
      lines.push("", "### Recent negative reviews");
      for (const r of negative) {
        const a = r.attributes;
        lines.push(`- ${a.rating}★ "${a.title}" – ${a.body.slice(0, 100)}${a.body.length > 100 ? "..." : ""}`);
      }
    }
  }

  // Latest build
  if (builds.length > 0) {
    const latest = builds[0];
    lines.push(
      "",
      `### Latest build`,
      `v${latest.versionString} (${latest.buildNumber}) – ${latest.status}`,
      `Installs: ${latest.installs}, sessions: ${latest.sessions}, crashes: ${latest.crashes}, feedback: ${latest.feedbackCount}`,
    );
  }

  // TestFlight feedback count
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();
  const recentFeedback = feedback.filter((f) => f.createdDate >= cutoffStr);
  if (recentFeedback.length > 0) {
    const crashCount = recentFeedback.filter((f) => f.type === "crash").length;
    lines.push(`TestFlight feedback: ${recentFeedback.length} (${crashCount} crashes)`);
  }

  return lines.join("\n");
}

// ── Registration ───────────────────────────────────────────────

export function registerGetInsights(server: McpServer): void {
  server.registerTool(
    "get_insights",
    {
      title: "Get app insights",
      description:
        "Understand how your app is doing. Returns reviews, analytics, stability data, or a high-level overview. " +
        "Topics: 'overview' (downloads, rating, recent negative reviews, build status), " +
        "'reviews' (rating distribution, recent reviews, unanswered count), " +
        "'analytics' (downloads, revenue, territories, discovery sources, performance regressions), " +
        "'stability' (crashes by version/device, TestFlight feedback, diagnostics).",
      inputSchema: z.object({
        app: z.string().describe("App name (e.g. 'MyApp')"),
        topic: z.enum(["overview", "reviews", "analytics", "stability"]).describe("What to report on"),
        period: z.enum(["week", "month", "quarter"]).optional().describe("Time window (default: month)"),
        version: z.string().optional().describe("Filter stability data to a specific version string"),
      }),
    },
    async ({ app, topic, period, version }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured. Set them up in Itsyconnect first." }],
        };
      }

      const appResult = await resolveApp(app);
      if (isError(appResult)) {
        return { isError: true, content: [{ type: "text", text: appResult.error }] };
      }

      const days = periodDays((period ?? "month") as Period);
      const appName = appResult.attributes.name;

      try {
        let text: string;
        switch (topic as Topic) {
          case "overview":
            text = await buildOverview(appResult.id, days);
            break;
          case "reviews":
            text = await buildReviews(appResult.id, days);
            break;
          case "analytics":
            text = await buildAnalytics(appResult.id, days);
            break;
          case "stability":
            text = await buildStability(appResult.id, days, version);
            break;
        }

        return {
          content: [{ type: "text", text: `${appName}\n\n${text}` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to build insights: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  );
}
