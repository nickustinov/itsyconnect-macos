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

export default function AISettingsPage() {
  const [providerId, setProviderId] = useState("anthropic");
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [storedProvider, setStoredProvider] = useState("");
  const [storedModel, setStoredModel] = useState("");

  const provider = useMemo(
    () => AI_PROVIDERS.find((p) => p.id === providerId)!,
    [providerId],
  );

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings/ai");
    if (res.ok) {
      const data = await res.json();
      if (data.settings) {
        setProviderId(data.settings.provider);
        setModelId(data.settings.modelId);
        setHasExistingKey(data.settings.hasApiKey);
        setStoredProvider(data.settings.provider);
        setStoredModel(data.settings.modelId);
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
    setApiKey("");
    setShowKey(false);
  }

  const hasModelChanges =
    hasExistingKey &&
    (providerId !== storedProvider || modelId !== storedModel);

  const canSave = hasExistingKey
    ? hasModelChanges || apiKey.trim().length > 0
    : apiKey.trim().length > 0;

  async function handleSave() {
    setSaving(true);

    try {
      const body: Record<string, string> = { provider: providerId, modelId };
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("AI settings saved");
        setHasExistingKey(true);
        setStoredProvider(providerId);
        setStoredModel(modelId);
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
        toast.success("API key removed");
        setHasExistingKey(false);
        setStoredProvider("");
        setStoredModel("");
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="section-title">Provider</h3>
        <p className="text-sm text-muted-foreground">
          Select the AI provider for translations, copywriting, and other AI
          operations.
        </p>
        <Select value={providerId} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-[200px] text-sm">
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

      <section className="space-y-2">
        <h3 className="section-title">Model</h3>
        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger className="w-[260px] text-sm">
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

      <section className="space-y-2">
        <h3 className="section-title">API key</h3>
        {hasExistingKey ? (
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
          <div className="flex items-center gap-2 max-w-md">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key"
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
