"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CheckCircle, XCircle, Copy, Check, CaretRight } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { IS_MAS } from "@/lib/platform";
import { useTranslations } from "@/lib/i18n/locale-context";

type UpdateState = "idle" | "checking" | "up-to-date" | "available" | "downloaded" | "error";

export default function GeneralPage() {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewModeLoading, setReviewModeLoading] = useState(true);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [mcpPort, setMcpPort] = useState(3100);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted guard for SSR hydration
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch("/api/app-preferences/review-mode")
      .then((r) => r.json())
      .then((d) => setReviewMode(d.enabled))
      .finally(() => setReviewModeLoading(false));
    fetch("/api/settings/mcp")
      .then((r) => r.json())
      .then((d) => {
        setMcpEnabled(d.enabled);
        setMcpPort(d.port);
      })
      .finally(() => setMcpLoading(false));
  }, []);

  useEffect(() => {
    if (IS_MAS) return;
    window.electron?.updates.getAutoCheck().then((v) => setAutoCheck(v));
    return window.electron?.updates.onStatus((status) => {
      setUpdateState(status.state as UpdateState);
      if (status.state === "error") setErrorMessage(status.message ?? t("common.unknownError"));
    });
  }, []);

  function handleAutoCheckChange(enabled: boolean) {
    setAutoCheck(enabled);
    window.electron?.updates.setAutoCheck(enabled);
  }

  function handleCheckNow() {
    setUpdateState("checking");
    setErrorMessage("");
    window.electron?.updates.checkNow();
  }

  async function handleReviewModeToggle(enabled: boolean) {
    setReviewMode(enabled);
    await fetch("/api/app-preferences/review-mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function handleMcpToggle(enabled: boolean) {
    setMcpEnabled(enabled);
    await fetch("/api/settings/mcp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function handleMcpPortChange(port: number) {
    setMcpPort(port);
  }

  async function handleMcpPortBlur() {
    if (mcpPort < 1024 || mcpPort > 65535) return;
    await fetch("/api/settings/mcp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: mcpPort }),
    });
  }

  function copySnippet(name: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(name);
    setTimeout(() => setCopiedSnippet(null), 2000);
  }

  if (!mounted) return null;

  const isElectron = !!window.electron;

  return (
    <div className="space-y-8">
      {isElectron && !IS_MAS && (
        <section className="space-y-4">
          <h3 className="section-title">{t("settings.general.updates")}</h3>
          <div className="flex items-center gap-3">
            <Switch
              id="auto-check-updates"
              checked={autoCheck}
              onCheckedChange={handleAutoCheckChange}
            />
            <Label htmlFor="auto-check-updates" className="text-sm">
              {t("settings.general.autoCheckUpdates")}
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckNow}
              disabled={updateState === "checking"}
            >
              {updateState === "checking" ? (
                <>
                  <Spinner className="size-3.5" />
                  {t("settings.general.checking")}
                </>
              ) : (
                t("settings.general.checkNow")
              )}
            </Button>
            {updateState === "up-to-date" && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle size={16} weight="fill" /> {t("settings.general.upToDate")}
              </span>
            )}
            {updateState === "available" && (
              <span className="text-sm text-muted-foreground">
                {t("settings.general.downloading")}
              </span>
            )}
            {updateState === "downloaded" && (
              <span className="text-sm text-muted-foreground">
                {t("settings.general.updateReady")}
              </span>
            )}
            {updateState === "error" && (
              <span className="flex items-center gap-1.5 text-sm text-destructive">
                <XCircle size={16} weight="fill" /> {errorMessage}
              </span>
            )}
          </div>
        </section>
      )}

      {!reviewModeLoading && (
        <section className="space-y-2">
          <h3 className="section-title">{t("settings.general.diffMode")}</h3>
          <div className="flex items-center gap-3">
            <Switch
              id="review-before-saving"
              checked={reviewMode}
              onCheckedChange={handleReviewModeToggle}
            />
            <Label htmlFor="review-before-saving" className="text-sm">
              {t("settings.general.enableDiffMode")}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.general.diffModeHint")}
          </p>
        </section>
      )}

      {!mcpLoading && !IS_MAS && (
        <McpSection
          enabled={mcpEnabled}
          port={mcpPort}
          copiedSnippet={copiedSnippet}
          onToggle={handleMcpToggle}
          onPortChange={handleMcpPortChange}
          onPortBlur={handleMcpPortBlur}
          onCopy={copySnippet}
        />
      )}
    </div>
  );
}

interface McpClientConfig {
  name: string;
  key: string;
  snippet: (port: number) => string;
  descriptionKey: "settings.general.runInTerminal" | "settings.general.addToCodex" | "settings.general.addToCursor" | "settings.general.addToOpencode";
}

const MCP_CLIENTS: McpClientConfig[] = [
  {
    name: "Claude Code",
    key: "claude-code",
    descriptionKey: "settings.general.runInTerminal",
    snippet: (port) =>
      `claude mcp add --transport http itsyconnect http://127.0.0.1:${port}/mcp`,
  },
  {
    name: "Codex",
    key: "codex",
    descriptionKey: "settings.general.addToCodex",
    snippet: (port) =>
      `[mcp.itsyconnect]\ntype = "remote"\nurl = "http://127.0.0.1:${port}/mcp"`,
  },
  {
    name: "Cursor",
    key: "cursor",
    descriptionKey: "settings.general.addToCursor",
    snippet: (port) =>
      JSON.stringify({ mcpServers: { itsyconnect: { url: `http://127.0.0.1:${port}/mcp` } } }, null, 2),
  },
  {
    name: "OpenCode",
    key: "opencode",
    descriptionKey: "settings.general.addToOpencode",
    snippet: (port) =>
      JSON.stringify({ itsyconnect: { type: "remote", url: `http://127.0.0.1:${port}/mcp` } }, null, 2),
  },
];

function McpSection({
  enabled,
  port,
  copiedSnippet,
  onToggle,
  onPortChange,
  onPortBlur,
  onCopy,
}: {
  enabled: boolean;
  port: number;
  copiedSnippet: string | null;
  onToggle: (v: boolean) => void;
  onPortChange: (v: number) => void;
  onPortBlur: () => void;
  onCopy: (name: string, text: string) => void;
}) {
  const t = useTranslations();

  return (
    <section className="space-y-2">
      <h3 className="section-title">{t("settings.general.mcpServer")}</h3>
      <div className="flex items-center gap-3">
        <Switch id="mcp-enabled" checked={enabled} onCheckedChange={onToggle} />
        <Label htmlFor="mcp-enabled" className="text-sm">
          {t("settings.general.enableMcpServer")}
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("settings.general.mcpServerHint")}
        {" "}
        <button
          type="button"
          onClick={() => window.open("https://github.com/nickustinov/itsyconnect-macos/blob/main/docs/MCP.md", "_blank")}
          className="underline underline-offset-4 hover:text-foreground"
        >
          {t("settings.general.learnMore")}
        </button>
      </p>
      {enabled && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="w-12 text-sm">{t("settings.general.port")}</Label>
            <Input
              type="number"
              value={port}
              onChange={(e) => onPortChange(Number(e.target.value))}
              onBlur={onPortBlur}
              className="w-24 font-mono text-sm"
              min={1024}
              max={65535}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {t("settings.general.connectAiTool")}
            </p>
            {MCP_CLIENTS.map(({ name, key, descriptionKey, snippet }) => {
              const text = snippet(port);
              const isCopied = copiedSnippet === key;
              return (
                <Collapsible key={key}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 [&[data-state=open]>svg]:rotate-90">
                    <CaretRight size={12} className="shrink-0 transition-transform" />
                    {name}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-6 pt-1 pb-2">
                    <p className="mb-1.5 text-xs text-muted-foreground">{t(descriptionKey)}</p>
                    <div className="relative">
                      <pre className="rounded-md border bg-muted/50 p-3 pr-10 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all">
                        {text}
                      </pre>
                      <button
                        type="button"
                        onClick={() => onCopy(key, text)}
                        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
