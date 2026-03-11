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
import { LocalServerFields } from "@/components/local-server-fields";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  isLocalOpenAIProvider,
} from "@/lib/ai/local-provider";

export default function AISettingsPage() {
  const [providerId, setProviderId] = useState("anthropic");
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasExistingSettings, setHasExistingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [storedProvider, setStoredProvider] = useState("");
  const [storedModel, setStoredModel] = useState("");
  const [storedBaseUrl, setStoredBaseUrl] = useState("");

  // Gemini key for screenshot translation
  const [geminiKeyAvailable, setGeminiKeyAvailable] = useState(false);
  const [geminiKeyFromMain, setGeminiKeyFromMain] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);
  const [removingGeminiKey, setRemovingGeminiKey] = useState(false);

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
        setHasExistingSettings(true);
        setStoredProvider(serverProvider);
        setStoredModel(serverModel);
        setStoredBaseUrl(normalizedStoredBaseUrl);
      } else {
        setHasExistingSettings(false);
        setBaseUrl("");
      }
    }
    setLoading(false);
  }, []);

  const fetchGeminiKeyStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/gemini-key");
      if (res.ok) {
        const data = await res.json();
        setGeminiKeyAvailable(data.available);
        setGeminiKeyFromMain(data.fromMainProvider);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchGeminiKeyStatus();
  }, [fetchSettings, fetchGeminiKeyStatus]);

  function handleProviderChange(id: string) {
    setProviderId(id);
    const newProvider = AI_PROVIDERS.find((p) => p.id === id)!;
    setModelId(newProvider.models[0].id);
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
        fetchGeminiKeyStatus();
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

  async function handleSaveGeminiKey() {
    if (!geminiKey.trim()) return;
    setSavingGeminiKey(true);
    try {
      const res = await fetch("/api/settings/gemini-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: geminiKey.trim() }),
      });
      if (res.ok) {
        toast.success("Gemini key saved");
        setGeminiKey("");
        setShowGeminiKey(false);
        fetchGeminiKeyStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    }
    setSavingGeminiKey(false);
  }

  async function handleRemoveGeminiKey() {
    setRemovingGeminiKey(true);
    try {
      const res = await fetch("/api/settings/gemini-key", { method: "DELETE" });
      if (res.ok) {
        toast.success("Gemini key removed");
        fetchGeminiKeyStatus();
      } else {
        toast.error("Failed to remove");
      }
    } catch {
      toast.error("Network error");
    }
    setRemovingGeminiKey(false);
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
        <LocalServerFields
          baseUrl={baseUrl}
          onBaseUrlChange={setBaseUrl}
          modelId={modelId}
          onModelIdChange={setModelId}
          apiKey={apiKey}
        />
      )}

      {!isLocalProvider && (
        <section className="space-y-2">
          <h3 className="section-title">Model</h3>
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
        </section>
      )}

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

      {/* Screenshot translation (Gemini) */}
      <section className="space-y-2">
        <h3 className="section-title">Screenshot translation</h3>
        <p className="text-sm text-muted-foreground">
          Uses Gemini 3 Pro Image to translate text in App Store screenshots.
          {geminiKeyFromMain && " Your Google API key from above is used automatically."}
        </p>
        {geminiKeyAvailable ? (
          <div className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-green-600" />
            <span className="text-sm">
              {geminiKeyFromMain ? "Using your Google provider key" : "Configured"}
            </span>
            {!geminiKeyFromMain && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs h-auto py-0.5 px-1.5"
                onClick={handleRemoveGeminiKey}
                disabled={removingGeminiKey}
              >
                {removingGeminiKey ? <><Spinner className="size-3" /> Removing...</> : "Remove"}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 max-w-md">
            <Input
              type={showGeminiKey ? "text" : "password"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Gemini API key"
              className="font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveGeminiKey();
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setShowGeminiKey(!showGeminiKey)}
            >
              {showGeminiKey ? <EyeSlash size={16} /> : <Eye size={16} />}
            </Button>
            <Button
              onClick={handleSaveGeminiKey}
              disabled={savingGeminiKey || !geminiKey.trim()}
            >
              {savingGeminiKey ? <Spinner className="size-4" /> : "Save"}
            </Button>
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
