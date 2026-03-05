"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Eye, EyeSlash } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  isLocalOpenAIProvider,
} from "@/lib/ai/local-provider";

export default function AISettingsPage() {
  const [providerId, setProviderId] = useState("anthropic");
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [baseUrl, setBaseUrl] = useState("");
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [testingLocalServer, setTestingLocalServer] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasExistingSettings, setHasExistingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [storedProvider, setStoredProvider] = useState("");
  const [storedModel, setStoredModel] = useState("");
  const [storedBaseUrl, setStoredBaseUrl] = useState("");

  const provider = useMemo(
    () => AI_PROVIDERS.find((p) => p.id === providerId)!,
    [providerId],
  );

  const isLocalProvider = isLocalOpenAIProvider(providerId);
  const hasApiKeyInput = apiKey.trim().length > 0;
  const effectiveBaseUrl = baseUrl.trim() || DEFAULT_LOCAL_OPENAI_BASE_URL;

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings/ai");
    if (res.ok) {
      const data = await res.json();
      if (data.settings) {
        const serverProvider = data.settings.provider as string;
        const serverModel = data.settings.modelId as string;
        const serverBaseUrl = (data.settings.baseUrl ?? "") as string;
        const isStoredLocal = isLocalOpenAIProvider(serverProvider);
        const normalizedStoredBaseUrl = isStoredLocal
          ? serverBaseUrl || DEFAULT_LOCAL_OPENAI_BASE_URL
          : "";

        setProviderId(serverProvider);
        setModelId(serverModel);
        setBaseUrl(serverBaseUrl);
        setDetectedModels([]);
        setHasExistingSettings(true);
        setStoredProvider(serverProvider);
        setStoredModel(serverModel);
        setStoredBaseUrl(normalizedStoredBaseUrl);
      } else {
        setHasExistingSettings(false);
        setBaseUrl("");
        setDetectedModels([]);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function handleProviderChange(id: string) {
    setProviderId(id);
    const newProvider = AI_PROVIDERS.find((p) => p.id === id)!;
    setModelId(newProvider.models[0].id);
    setDetectedModels([]);
    setApiKey("");
    setShowKey(false);
  }

  const providerChanged = hasExistingSettings && providerId !== storedProvider;

  const hasConfigChanges =
    hasExistingSettings &&
    (
      providerId !== storedProvider ||
      modelId !== storedModel ||
      (isLocalProvider && effectiveBaseUrl !== storedBaseUrl)
    );

  const canSave = providerChanged
    ? isLocalProvider
      ? modelId.trim().length > 0
      : hasApiKeyInput
    : hasExistingSettings
      ? hasConfigChanges || hasApiKeyInput
      : isLocalProvider
        ? modelId.trim().length > 0
        : hasApiKeyInput;

  async function handleTestLocalServer() {
    setTestingLocalServer(true);

    try {
      const body: Record<string, string> = { baseUrl: effectiveBaseUrl };
      if (hasApiKeyInput) {
        body.apiKey = apiKey.trim();
      }

      const res = await fetch("/api/settings/ai/local-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to reach local server");
        setTestingLocalServer(false);
        return;
      }

      const models = Array.isArray(data.models)
        ? data.models.filter((m: unknown): m is string => typeof m === "string" && m.trim().length > 0)
        : [];

      setDetectedModels(models);

      if (models.length === 0) {
        toast.error("Server is reachable, but no models were returned.");
      } else {
        if (!models.includes(modelId)) {
          setModelId(models[0]);
        }
        toast.success(`Detected ${models.length} model${models.length === 1 ? "" : "s"}`);
      }
    } catch {
      toast.error("Network error");
    }

    setTestingLocalServer(false);
  }

  async function handleSave() {
    setSaving(true);

    try {
      const body: Record<string, string> = {
        provider: providerId,
        modelId: modelId.trim(),
      };

      if (isLocalProvider) {
        body.baseUrl = effectiveBaseUrl;
      }
      if (hasApiKeyInput) {
        body.apiKey = apiKey.trim();
      }

      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("AI settings saved");
        setHasExistingSettings(true);
        setStoredProvider(providerId);
        setStoredModel(modelId.trim());
        setStoredBaseUrl(isLocalProvider ? effectiveBaseUrl : "");
        setApiKey("");
        setShowKey(false);
        invalidateAIStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    }

    setSaving(false);
  }

  async function handleRemove() {
    setRemoving(true);

    try {
      const res = await fetch("/api/settings/ai", { method: "DELETE" });
      if (res.ok) {
        toast.success("AI settings removed");
        setHasExistingSettings(false);
        setStoredProvider("");
        setStoredModel("");
        setStoredBaseUrl("");
        setBaseUrl("");
        setDetectedModels([]);
        setApiKey("");
        setShowKey(false);
        invalidateAIStatus();
      } else {
        toast.error("Failed to remove");
      }
    } catch {
      toast.error("Network error");
    }

    setRemoving(false);
  }

  if (loading) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="section-title">Provider</h3>
        <p className="text-sm text-muted-foreground">
          Select the AI provider for translations, copywriting, and other AI
          operations.
        </p>
        <Select value={providerId} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-[280px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {isLocalProvider && (
        <section className="space-y-2 max-w-2xl">
          <h3 className="section-title">Local server URL</h3>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={DEFAULT_LOCAL_OPENAI_BASE_URL}
            className="font-mono text-sm max-w-xl"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestLocalServer}
              disabled={testingLocalServer}
            >
              {testingLocalServer ? <><Spinner className="size-3" /> Testing...</> : "Test local server"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Tries <span className="font-mono">{effectiveBaseUrl}/models</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: <span className="font-mono">http://127.0.0.1:1234</span>. The app uses the OpenAI-compatible <span className="font-mono">/v1</span> API.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="section-title">Model</h3>
        {isLocalProvider ? (
          <div className="space-y-2 max-w-xl">
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="qwen2.5-7b-instruct"
              className="font-mono text-sm"
            />
            {detectedModels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {detectedModels.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-md border px-2 py-1 text-xs font-mono ${id === modelId ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                    onClick={() => setModelId(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Use the model ID exposed by your local server (for LM Studio, this is the loaded model ID).
            </p>
          </div>
        ) : (
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[320px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                  <span className="ml-2 text-muted-foreground font-mono text-xs">
                    {m.id}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="section-title">API key / token</h3>
        {hasExistingSettings && !providerChanged ? (
          <div className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-green-600" />
            <span className="text-sm">Configured</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs h-auto py-0.5 px-1.5"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? <><Spinner className="size-3" /> Removing...</> : "Remove"}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-md">
            {providerChanged && (
              <p className="text-sm text-muted-foreground">
                {isLocalProvider
                  ? "Switching to a local OpenAI-compatible server does not require a key unless auth is enabled."
                  : `Switching to ${provider.name} requires a new API key.`}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  isLocalProvider
                    ? "Optional token (if your local server requires auth)"
                    : "Paste your API key"
                }
                className="font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeSlash size={16} /> : <Eye size={16} />}
              </Button>
            </div>
          </div>
        )}
      </section>

      <Button onClick={handleSave} disabled={saving || !canSave}>
        {saving ? (
          <>
            <Spinner />
            Saving...
          </>
        ) : (
          "Save"
        )}
      </Button>
    </div>
  );
}
