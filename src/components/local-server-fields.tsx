"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { DEFAULT_LOCAL_OPENAI_BASE_URL } from "@/lib/ai/local-provider";
import { useTranslations } from "@/lib/i18n/locale-context";

interface LocalServerFieldsProps {
  baseUrl: string;
  onBaseUrlChange: (url: string) => void;
  modelId: string;
  onModelIdChange: (id: string) => void;
  apiKey: string;
  /** Use lightweight labels instead of section headings. */
  compact?: boolean;
}

export function LocalServerFields({
  baseUrl,
  onBaseUrlChange,
  modelId,
  onModelIdChange,
  apiKey,
  compact,
}: LocalServerFieldsProps) {
  const t = useTranslations();
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const effectiveBaseUrl = baseUrl.trim() || DEFAULT_LOCAL_OPENAI_BASE_URL;

  async function handleTest() {
    setTesting(true);
    try {
      const body: Record<string, string> = { baseUrl: effectiveBaseUrl };
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      const res = await fetch("/api/settings/ai/local-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("localServer.reachFailed"));
        setTesting(false);
        return;
      }

      const models = Array.isArray(data.models)
        ? data.models.filter((m: unknown): m is string => typeof m === "string" && m.trim().length > 0)
        : [];

      setDetectedModels(models);
      if (models.length === 0) {
        toast.error(t("localServer.noModels"));
      } else {
        if (!models.includes(modelId)) onModelIdChange(models[0]);
        toast.success(
          models.length === 1
            ? t("localServer.detectedModels", { count: models.length })
            : t("localServer.detectedModelsPlural", { count: models.length }),
        );
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setTesting(false);
  }

  const Wrapper = compact ? "div" : "section";

  return (
    <>
      <Wrapper className={compact ? "space-y-2" : "space-y-2 max-w-2xl"}>
        {compact ? (
          <label className="text-sm text-muted-foreground">{t("localServer.serverUrl")}</label>
        ) : (
          <h3 className="section-title">{t("localServer.serverUrl")}</h3>
        )}
        <Input
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder={DEFAULT_LOCAL_OPENAI_BASE_URL}
          className="font-mono text-sm max-w-xl"
        />
        <p className="text-xs text-muted-foreground">
          {t("localServer.endpointHint", { example: "http://127.0.0.1:1234/v1" })}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? <><Spinner className="size-3" /> {t("localServer.testing")}</> : t("localServer.testConnection")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("localServer.triesEndpoint", { endpoint: effectiveBaseUrl })}
          </span>
        </div>
      </Wrapper>

      <Wrapper className={compact ? "space-y-2" : "space-y-2 max-w-2xl"}>
        {compact ? (
          <label className="text-sm text-muted-foreground">{t("localServer.model")}</label>
        ) : (
          <h3 className="section-title">{t("localServer.model")}</h3>
        )}
        <Input
          value={modelId}
          onChange={(e) => onModelIdChange(e.target.value)}
          placeholder="qwen2.5-7b-instruct"
          className="font-mono text-sm max-w-xl"
        />
        {detectedModels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {detectedModels.map((id) => (
              <Badge
                key={id}
                asChild
                variant={id === modelId ? "default" : "outline"}
                className="cursor-pointer font-mono"
              >
                <button type="button" onClick={() => onModelIdChange(id)}>
                  {id}
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("localServer.modelHint")}
        </p>
      </Wrapper>
    </>
  );
}
