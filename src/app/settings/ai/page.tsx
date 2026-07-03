"use client";

import { useState, useMemo, useEffect } from "react";
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
import { useTranslations } from "@/lib/i18n/locale-context";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  isLocalOpenAIProvider,
} from "@/lib/ai/local-provider";

export default function AISettingsPage() {
  const t = useTranslations();
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

  useEffect(() => {
    let cancelled = false;

    async function fetchSettings() {
      const res = await fetch("/api/settings/ai");
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        if (cancelled) return;
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
    }

    async function fetchGeminiKeyStatus() {
      try {
        const res = await fetch("/api/settings/gemini-key");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setGeminiKeyAvailable(data.available);
          setGeminiKeyFromMain(data.fromMainProvider);
        }
      } catch { /* ignore */ }
    }

    fetchSettings();
    fetchGeminiKeyStatus();
    return () => { cancelled = true; };
  }, []);

  async function refreshGeminiKeyStatus() {
    try {
      const res = await fetch("/api/settings/gemini-key");
      if (res.ok) {
        const data = await res.json();
        setGeminiKeyAvailable(data.available);
        setGeminiKeyFromMain(data.fromMainProvider);
      }
    } catch { /* ignore */ }
  }

  function handleProviderChange(id: string) {
    if (id === "__none__") {
      setProviderId("__none__");
      handleRemove();
      return;
    }
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
        toast.success(t("settings.ai.saved"));
        setHasExistingSettings(true);
        setStoredProvider(providerId);
        setStoredModel(modelId.trim());
        setStoredBaseUrl(isLocalProvider ? effectiveBaseUrl : "");
        setApiKey("");
        setShowKey(false);
        invalidateAIStatus();
        refreshGeminiKeyStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("common.saveFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }

    setSaving(false);
  }

  async function handleRemove() {
    setRemoving(true);

    try {
      const res = await fetch("/api/settings/ai", { method: "DELETE" });
      if (res.ok) {
        toast.success(t("settings.ai.removed"));
        setHasExistingSettings(false);
        setStoredProvider("");
        setStoredModel("");
        setStoredBaseUrl("");
        setBaseUrl("");
        setApiKey("");
        setShowKey(false);
        invalidateAIStatus();
      } else {
        toast.error(t("settings.ai.removeFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
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
        toast.success(t("settings.ai.geminiKeySaved"));
        setGeminiKey("");
        setShowGeminiKey(false);
        refreshGeminiKeyStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("common.saveFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setSavingGeminiKey(false);
  }

  async function handleRemoveGeminiKey() {
    setRemovingGeminiKey(true);
    try {
      const res = await fetch("/api/settings/gemini-key", { method: "DELETE" });
      if (res.ok) {
        toast.success(t("settings.ai.geminiKeyRemoved"));
        refreshGeminiKeyStatus();
      } else {
        toast.error(t("settings.ai.removeFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setRemovingGeminiKey(false);
  }

  if (loading) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="section-title">{t("settings.ai.provider")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.ai.providerHint")}
        </p>
        <Select value={providerId} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-[280px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("settings.ai.providerNone")}</SelectItem>
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

      {!isLocalProvider && provider && (
        <section className="space-y-2">
          <h3 className="section-title">{t("settings.ai.model")}</h3>
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
        <h3 className="section-title">{t("settings.ai.apiKey")}</h3>
        {hasExistingSettings && !providerChanged ? (
          <div className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-green-600" />
            <span className="text-sm">{t("settings.ai.configured")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs h-auto py-0.5 px-1.5"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? <><Spinner className="size-3" /> {t("settings.ai.removing")}</> : t("common.remove")}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-md">
            {providerChanged && provider && (
              <p className="text-sm text-muted-foreground">
                {isLocalProvider
                  ? t("settings.ai.switchLocalHint")
                  : t("settings.ai.switchProviderHint", { provider: provider.name })}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  isLocalProvider
                    ? t("settings.ai.apiKeyPlaceholderLocal")
                    : t("settings.ai.apiKeyPlaceholder")
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
        <h3 className="section-title">{t("settings.ai.screenshotTranslation")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.ai.screenshotHint")}
          {geminiKeyFromMain && t("settings.ai.screenshotHintFromMain")}
        </p>
        {geminiKeyAvailable ? (
          <div className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-green-600" />
            <span className="text-sm">
              {geminiKeyFromMain ? t("settings.ai.usingGoogleKey") : t("settings.ai.configured")}
            </span>
            {!geminiKeyFromMain && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs h-auto py-0.5 px-1.5"
                onClick={handleRemoveGeminiKey}
                disabled={removingGeminiKey}
              >
                {removingGeminiKey ? <><Spinner className="size-3" /> {t("settings.ai.removing")}</> : t("common.remove")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 max-w-md">
            <Input
              type={showGeminiKey ? "text" : "password"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={t("settings.ai.geminiKeyPlaceholder")}
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
              {savingGeminiKey ? <Spinner className="size-4" /> : t("settings.ai.save")}
            </Button>
          </div>
        )}
      </section>

      <Button onClick={handleSave} disabled={saving || !canSave}>
        {saving ? (
          <>
            <Spinner />
            {t("settings.ai.saving")}
          </>
        ) : (
          t("settings.ai.save")
        )}
      </Button>
    </div>
  );
}
