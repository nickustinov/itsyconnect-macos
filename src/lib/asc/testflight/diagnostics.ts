import { ascFetch, AscApiError } from "../client";
import { cacheGet, cacheSet } from "@/lib/cache";
import {
  DIAGNOSTICS_TTL,
  type TFDiagnosticType,
  type TFDiagnosticSignature,
  type TFDiagnosticLog,
  type TFCallStackFrame,
  type TFDiagnosticInsight,
} from "./types";

// ── Diagnostic signatures ─────────────────────────────────────────

export async function listDiagnosticSignatures(
  buildId: string,
  type?: TFDiagnosticType,
  forceRefresh = false,
): Promise<TFDiagnosticSignature[]> {
  const cacheKey = type
    ? `tf-diagnostics:${buildId}:${type}`
    : `tf-diagnostics:${buildId}`;

  if (!forceRefresh) {
    const cached = cacheGet<TFDiagnosticSignature[]>(cacheKey);
    if (cached) return cached;
  }

  try {
    const params = new URLSearchParams({ limit: "200" });
    if (type) {
      params.set("filter[diagnosticType]", type);
    }

    const response = await ascFetch<{
      data: Array<{
        id: string;
        attributes: {
          diagnosticType: TFDiagnosticType;
          signature: string;
          weight: number;
        };
      }>;
    }>(`/v1/builds/${buildId}/diagnosticSignatures?${params}`);

    const dataArr = Array.isArray(response.data) ? response.data : [];
    const signatures: TFDiagnosticSignature[] = dataArr.map((item) => ({
      id: item.id,
      diagnosticType: item.attributes.diagnosticType,
      signature: item.attributes.signature,
      weight: item.attributes.weight,
    }));

    cacheSet(cacheKey, signatures, DIAGNOSTICS_TTL);
    return signatures;
  } catch (err) {
    // 404 is expected – not all builds have diagnostics (e.g. macOS builds).
    // Cache the empty result so we don't re-hit the API on every mount.
    const is404 = err instanceof AscApiError && err.ascError.statusCode === 404;
    if (!is404) {
      console.warn(`[diagnostics] signatures for build ${buildId} failed:`, err);
    }
    cacheSet(cacheKey, [], DIAGNOSTICS_TTL);
    return [];
  }
}

// ── Diagnostic logs ───────────────────────────────────────────────

export async function getDiagnosticLogs(
  signatureId: string,
): Promise<TFDiagnosticLog[]> {
  try {
    const response = await ascFetch<{
      data: Array<{
        attributes: {
          diagnosticMetaData?: Record<string, string>;
          callStackTree?: Array<{
            callStacks?: Array<{
              callStackRootFrames?: Array<Record<string, unknown>>;
            }>;
            callStackPerThread?: boolean;
          }>;
          insightsCategory?: string;
          insights?: Array<{
            category?: string;
            description?: string;
            url?: string;
          }>;
        };
      }>;
    }>(`/v1/diagnosticSignatures/${signatureId}/logs`);

    const dataArr = Array.isArray(response.data) ? response.data : [];
    return dataArr.map((item) => {
      const attrs = item.attributes;

      // Parse call stack tree
      const callStack: TFCallStackFrame[] = [];
      const trees = Array.isArray(attrs.callStackTree) ? attrs.callStackTree : [];
      for (const tree of trees) {
        const stacks = Array.isArray(tree.callStacks) ? tree.callStacks : [];
        for (const stack of stacks) {
          const roots = Array.isArray(stack.callStackRootFrames) ? stack.callStackRootFrames : [];
          for (const frame of roots) {
            callStack.push(parseCallStackFrame(frame));
          }
        }
      }

      // Parse insights
      const insights: TFDiagnosticInsight[] = [];
      const rawInsights = Array.isArray(attrs.insights) ? attrs.insights : [];
      for (const insight of rawInsights) {
        insights.push({
          category: insight.category ?? "General",
          description: insight.description ?? "",
          url: insight.url ?? null,
        });
      }

      return {
        metadata: attrs.diagnosticMetaData ?? {},
        callStack,
        insights,
      };
    });
  } catch (err) {
    console.warn(`[diagnostics] logs for signature ${signatureId} failed:`, err);
    return [];
  }
}

// ── Call stack parser ─────────────────────────────────────────────

export function parseCallStackFrame(raw: Record<string, unknown>): TFCallStackFrame {
  const subFrameRaw = Array.isArray(raw.subFrames) ? raw.subFrames : [];
  const subFrames: TFCallStackFrame[] = subFrameRaw.map(
    (sub: Record<string, unknown>) => parseCallStackFrame(sub),
  );

  return {
    symbolName: (raw.symbolName as string) ?? "",
    binaryName: (raw.binaryName as string) ?? "",
    fileName: (raw.fileName as string) ?? null,
    lineNumber: typeof raw.lineNumber === "number" ? raw.lineNumber : null,
    address: (raw.address as string) ?? null,
    isBlameFrame: (raw.isBlameFrame as boolean) ?? false,
    sampleCount: typeof raw.sampleCount === "number" ? raw.sampleCount : 0,
    ...(subFrames.length > 0 ? { subFrames } : {}),
  };
}
