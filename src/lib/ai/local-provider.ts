export const LOCAL_OPENAI_PROVIDER_ID = "local-openai";
export const DEFAULT_LOCAL_OPENAI_BASE_URL = "http://127.0.0.1:1234/v1";
export const DEFAULT_LOCAL_OPENAI_API_KEY = "lm-studio";

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";
const RECENT_LOAD_WINDOW_MS = 15_000;

const recentLoadedModelByServer = new Map<string, { modelId: string; at: number }>();
const inFlightLoads = new Map<string, Promise<string | null>>();
const unsupportedLoadEndpointServers = new Set<string>();
const unsupportedModelListEndpointServers = new Set<string>();

/** Normalize an OpenAI-compatible base URL to the `/v1` API root. */
export function normalizeOpenAICompatibleBaseUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());

    let pathname = url.pathname.replace(/\/+$/, "");
    if (pathname.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
      pathname = pathname.slice(0, -CHAT_COMPLETIONS_SUFFIX.length);
    }

    if (!pathname || pathname === "/") {
      pathname = "/v1";
    } else if (!pathname.endsWith("/v1")) {
      pathname = `${pathname}/v1`;
    }

    url.pathname = pathname;
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function isLocalOpenAIProvider(providerId: string): boolean {
  return providerId === LOCAL_OPENAI_PROVIDER_ID;
}

export function resolveLocalOpenAIApiKey(apiKey: string | undefined): string {
  const key = apiKey?.trim();
  return key && key.length > 0 ? key : DEFAULT_LOCAL_OPENAI_API_KEY;
}

export function resolveLocalOpenAIBaseUrl(baseUrl: string | undefined): string {
  const normalized = baseUrl
    ? normalizeOpenAICompatibleBaseUrl(baseUrl)
    : normalizeOpenAICompatibleBaseUrl(DEFAULT_LOCAL_OPENAI_BASE_URL);

  return normalized ?? DEFAULT_LOCAL_OPENAI_BASE_URL;
}

function localServerRootFromBaseUrl(baseUrl: string): string | null {
  try {
    const url = new URL(resolveLocalOpenAIBaseUrl(baseUrl));
    let pathname = url.pathname.replace(/\/+$/, "");
    if (pathname.endsWith("/v1")) {
      pathname = pathname.slice(0, -3);
    }
    url.pathname = pathname || "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

interface LoadModelErrorShape {
  error?: {
    type?: string;
    message?: string;
  };
  message?: string;
}

interface LocalModelListItem {
  key?: string;
  loaded_instances?: Array<{ id?: string }>;
}

interface LocalModelListShape {
  models?: LocalModelListItem[];
}

type LocalModelLoadedStatus = "loaded" | "not-loaded" | "unknown";

async function getLocalModelLoadedStatus(
  serverRoot: string,
  modelId: string,
  headers: HeadersInit,
): Promise<LocalModelLoadedStatus> {
  if (unsupportedModelListEndpointServers.has(serverRoot)) {
    return "unknown";
  }

  try {
    const res = await fetch(`${serverRoot}/api/v1/models`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 404 || res.status === 405) {
      unsupportedModelListEndpointServers.add(serverRoot);
      return "unknown";
    }

    if (!res.ok) {
      return "unknown";
    }

    const raw = await res.text();
    if (!raw) {
      return "unknown";
    }

    let payload: LocalModelListShape = {};
    try {
      payload = JSON.parse(raw) as LocalModelListShape;
    } catch {
      return "unknown";
    }

    const models = Array.isArray(payload.models) ? payload.models : [];
    const matchedModel = models.find((model) => {
      const key = typeof model.key === "string" ? model.key : "";
      if (key === modelId) {
        return true;
      }
      const instances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
      return instances.some((instance) => instance?.id === modelId);
    });

    if (!matchedModel) {
      return "not-loaded";
    }

    const loadedInstances = Array.isArray(matchedModel.loaded_instances)
      ? matchedModel.loaded_instances
      : [];

    return loadedInstances.length > 0 ? "loaded" : "not-loaded";
  } catch {
    return "unknown";
  }
}

/**
 * Ask a local server to load a model before generation.
 *
 * Many LM Studio setups keep a single active model and may ignore the
 * OpenAI `model` parameter unless a model is loaded explicitly.
 *
 * Returns null on success or when the endpoint is unsupported. Returns an
 * error message when model loading is supported but fails.
 */
export async function ensureLocalModelLoaded(
  modelId: string,
  baseUrl: string | undefined,
  apiKey: string | undefined,
): Promise<string | null> {
  const serverRoot = localServerRootFromBaseUrl(baseUrl ?? DEFAULT_LOCAL_OPENAI_BASE_URL);
  if (!serverRoot) {
    return "Invalid local server URL";
  }

  if (unsupportedLoadEndpointServers.has(serverRoot)) {
    return null;
  }

  const recent = recentLoadedModelByServer.get(serverRoot);
  if (recent && recent.modelId === modelId && Date.now() - recent.at < RECENT_LOAD_WINDOW_MS) {
    return null;
  }

  const loadKey = `${serverRoot}::${modelId}`;
  const existingLoad = inFlightLoads.get(loadKey);
  if (existingLoad) {
    return existingLoad;
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const token = apiKey?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const loadPromise = (async () => {
    const loadedStatus = await getLocalModelLoadedStatus(serverRoot, modelId, headers);
    if (loadedStatus === "loaded") {
      recentLoadedModelByServer.set(serverRoot, { modelId, at: Date.now() });
      return null;
    }

    try {
      const res = await fetch(`${serverRoot}/api/v1/models/load`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: modelId }),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) {
        recentLoadedModelByServer.set(serverRoot, { modelId, at: Date.now() });
        return null;
      }

      const raw = await res.text();
      let payload: LoadModelErrorShape = {};
      try {
        payload = raw ? JSON.parse(raw) as LoadModelErrorShape : {};
      } catch {
        payload = {};
      }

      if (res.status === 404 || res.status === 405) {
        // Non-LM Studio local servers may not implement this endpoint.
        // If we got a structured error message, surface it. Otherwise ignore.
        const maybeMessage = payload.error?.message || payload.message;
        if (maybeMessage) return maybeMessage;
        unsupportedLoadEndpointServers.add(serverRoot);
        return null;
      }

      return payload.error?.message || payload.message || `Model load failed with status ${res.status}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Could not switch local model: ${message}`;
    }
  })();

  inFlightLoads.set(loadKey, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(loadKey);
  }
}

export function resetLocalModelLoadStateForTests() {
  recentLoadedModelByServer.clear();
  inFlightLoads.clear();
  unsupportedLoadEndpointServers.clear();
  unsupportedModelListEndpointServers.clear();
}
