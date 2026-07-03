"use client";

import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CircleNotch, CaretRight } from "@phosphor-icons/react";
import type { TFDiagnosticSignature, TFDiagnosticLog, TFDiagnosticType, TFCallStackFrame } from "@/lib/asc/testflight";
import { DIAGNOSTIC_TYPE_DOTS } from "@/lib/asc/display-types";
import { useTranslations } from "@/lib/i18n/locale-context";

function renderCallStack(frames: TFCallStackFrame[], depth: number): React.ReactNode {
  return frames.map((frame, i) => (
    <span key={i}>
      <span className={frame.isBlameFrame ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}>
        {"  ".repeat(depth)}
        {frame.sampleCount > 0 && <span className="text-muted-foreground">[{frame.sampleCount}] </span>}
        <span className="text-muted-foreground">{frame.binaryName}</span>
        {" "}
        {frame.symbolName}
        {frame.fileName && <span className="text-muted-foreground"> ({frame.fileName}{frame.lineNumber != null ? `:${frame.lineNumber}` : ""})</span>}
      </span>
      {"\n"}
      {frame.subFrames && renderCallStack(frame.subFrames, depth + 1)}
    </span>
  ));
}

const DIAGNOSTIC_TABS = ["all", "DISK_WRITES", "HANGS", "LAUNCHES"] as const;

export function DiagnosticsSection({ appId, buildId }: { appId: string; buildId: string }) {
  const t = useTranslations();
  const [signatures, setSignatures] = useState<TFDiagnosticSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, TFDiagnosticLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/apps/${appId}/testflight/builds/${buildId}/diagnostics`)
      .then((res) => (res.ok ? res.json() : { signatures: [] }))
      .then((data) => setSignatures(data.signatures ?? []))
      .catch(() => setSignatures([]))
      .finally(() => setLoading(false));
  }, [appId, buildId]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return signatures;
    return signatures.filter((s) => s.diagnosticType === activeTab);
  }, [signatures, activeTab]);

  const maxWeight = useMemo(
    () => Math.max(...filtered.map((s) => s.weight), 1),
    [filtered],
  );

  function diagnosticTypeLabel(type: TFDiagnosticType): string {
    const labels: Record<TFDiagnosticType, string> = {
      DISK_WRITES: t("testflight.diagnosticTypes.DISK_WRITES"),
      HANGS: t("testflight.diagnosticTypes.HANGS"),
      LAUNCHES: t("testflight.diagnosticTypes.LAUNCHES"),
    };
    return labels[type];
  }

  function emptyMessage(tab: string): string {
    if (tab === "all") return t("testflight.noDiagnosticSignaturesGeneric");
    return t("testflight.noDiagnosticSignaturesType", {
      type: diagnosticTypeLabel(tab as TFDiagnosticType).toLowerCase(),
    });
  }

  async function toggleExpand(signatureId: string) {
    if (expandedId === signatureId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(signatureId);

    if (!logs[signatureId]) {
      setLogsLoading(signatureId);
      try {
        const res = await fetch(
          `/api/apps/${appId}/testflight/builds/${buildId}/diagnostics/${signatureId}/logs`,
        );
        if (res.ok) {
          const data = await res.json();
          setLogs((prev) => ({ ...prev, [signatureId]: data.logs ?? [] }));
        }
      } catch {
        /* best-effort */
      } finally {
        setLogsLoading(null);
      }
    }
  }

  if (loading) {
    return (
      <section className="space-y-3">
        <h3 className="section-title">{t("testflight.diagnostics")}</h3>
        <div className="flex items-center justify-center py-8">
          <CircleNotch size={20} className="animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="section-title">{t("testflight.diagnostics")}</h3>

      {signatures.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("testflight.noDiagnosticSignatures")}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line">
            <TabsTrigger value="all">{t("testflight.allSignatures")}</TabsTrigger>
            <TabsTrigger value="DISK_WRITES">{t("testflight.diagnosticTypes.DISK_WRITES")}</TabsTrigger>
            <TabsTrigger value="HANGS">{t("testflight.diagnosticTypes.HANGS")}</TabsTrigger>
            <TabsTrigger value="LAUNCHES">{t("testflight.diagnosticTypes.LAUNCHES")}</TabsTrigger>
          </TabsList>

          {DIAGNOSTIC_TABS.map((tab) => (
            <TabsContent key={tab} value={tab}>
              {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {emptyMessage(tab)}
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((sig) => (
                    <div key={sig.id}>
                      <button
                        className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
                        onClick={() => toggleExpand(sig.id)}
                      >
                        <CaretRight
                          size={14}
                          className={`shrink-0 text-muted-foreground transition-transform ${expandedId === sig.id ? "rotate-90" : ""}`}
                        />
                        <span
                          className={`inline-block size-2 shrink-0 rounded-full ${DIAGNOSTIC_TYPE_DOTS[sig.diagnosticType] ?? "bg-gray-400"}`}
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {sig.signature}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-foreground/30"
                              style={{ width: `${(sig.weight / maxWeight) * 100}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                            {Math.round(sig.weight * 100)}%
                          </span>
                        </div>
                      </button>

                      {expandedId === sig.id && (
                        <div className="ml-6 border-l pl-4 pt-2 pb-3">
                          {logsLoading === sig.id ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                              <CircleNotch size={14} className="animate-spin" />
                              {t("testflight.loadingLogs")}
                            </div>
                          ) : (logs[sig.id] ?? []).length === 0 ? (
                            <p className="py-4 text-sm text-muted-foreground">
                              {t("testflight.noLogsForSignature")}
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {(logs[sig.id] ?? []).map((log, logIdx) => (
                                <div key={logIdx} className="space-y-2">
                                  {Object.keys(log.metadata).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(log.metadata).map(([k, v]) => (
                                        <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs">
                                          {k}: {v}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {log.callStack.length > 0 && (
                                    <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
                                      {renderCallStack(log.callStack, 0)}
                                    </pre>
                                  )}
                                  {log.insights.length > 0 && (
                                    <div className="space-y-1">
                                      {log.insights.map((insight, i) => (
                                        <div
                                          key={i}
                                          className="rounded-lg border bg-blue-50 p-3 text-xs dark:bg-blue-900/20"
                                        >
                                          <p className="font-medium">{insight.category}</p>
                                          <p className="text-muted-foreground">{insight.description}</p>
                                          {insight.url && (
                                            <a
                                              href={insight.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline dark:text-blue-400"
                                            >
                                              {t("testflight.learnMore")}
                                            </a>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
