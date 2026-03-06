"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppStoreLogoIcon,
  CheckCircle,
  Eye,
  EyeSlash,
  IdentificationBadge,
  Info,
  Lock,
  MagicWand,
  Package,
  XCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocalServerFields } from "@/components/local-server-fields";
import { clearNavigation } from "@/lib/nav-state";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  isLocalOpenAIProvider,
} from "@/lib/ai/local-provider";

const WIZARD_STEPS = 3;

export default function SetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // step 0 = welcome, steps 1–3 = wizard
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [enteringDemo, setEnteringDemo] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setup) {
          router.replace("/dashboard?entry=1");
        } else {
          setReady(true);
          (window as { electron?: { ready: () => void } }).electron?.ready();
        }
      })
      .catch(() => {
        setReady(true);
        (window as { electron?: { ready: () => void } }).electron?.ready();
      });
  }, [router]);

  // Step 1 – Team name
  const [teamName, setTeamName] = useState("My team");

  // Step 2 – ASC credentials
  const [issuerId, setIssuerId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [keyIdFromFile, setKeyIdFromFile] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [testError, setTestError] = useState("");

  // Step 3 – AI
  const [providerId, setProviderId] = useState("anthropic");
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const provider = useMemo(
    () => AI_PROVIDERS.find((p) => p.id === providerId)!,
    [providerId],
  );

  function handleProviderChange(id: string) {
    setProviderId(id);
    const p = AI_PROVIDERS.find((p) => p.id === id)!;
    setModelId(p.models[0].id);
    setApiKey("");
    setShowKey(false);
  }

  function resetConnectionTest() {
    setTestStatus("idle");
    setTestError("");
  }

  async function testConnection(
    testIssuerId: string,
    testKeyId: string,
    testPrivateKey: string,
  ) {
    setTestStatus("testing");
    setTestError("");

    try {
      const res = await fetch("/api/setup/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: testIssuerId,
          keyId: testKeyId,
          privateKey: testPrivateKey,
        }),
      });

      if (res.ok) {
        setTestStatus("ok");
      } else {
        const data = await res.json().catch(() => ({}));
        setTestStatus("error");
        setTestError(data.error || "Connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestError("Network error");
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setKeyError("");
    resetConnectionTest();
    setPrivateKey("");
    setKeyId("");
    setKeyIdFromFile(false);

    file.text().then((text) => {
      const trimmed = text.trim();

      // Validate PEM structure
      if (
        !trimmed.startsWith("-----BEGIN PRIVATE KEY-----") ||
        !trimmed.endsWith("-----END PRIVATE KEY-----")
      ) {
        setKeyError("Invalid key file – expected a .p8 private key from Apple.");
        return;
      }

      setPrivateKey(trimmed);

      // Extract key ID from filename (AuthKey_XXXXXXXXXX.p8)
      const match = file.name.match(/AuthKey_([A-Z0-9]+)\.p8/);
      if (match) {
        setKeyId(match[1]);
        setKeyIdFromFile(true);
      }

      const resolvedKeyId = match ? match[1] : keyId.trim();
      if (issuerId.trim() && resolvedKeyId) {
        testConnection(issuerId.trim(), resolvedKeyId, trimmed);
      }

    });
  }

  function canAdvance(): boolean {
    if (step === 0) return true;
    if (step === 1) return teamName.trim().length > 0;
    if (step === 2) {
      return (
        issuerId.trim().length > 0 &&
        keyId.trim().length > 0 &&
        privateKey.trim().length > 0 &&
        testStatus === "ok"
      );
    }
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);

    try {
      const body: Record<string, string> = {};

      // Include ASC credentials
      if (issuerId.trim() && keyId.trim() && privateKey.trim()) {
        body.name = teamName.trim() || "My team";
        body.issuerId = issuerId.trim();
        body.keyId = keyId.trim();
        body.privateKey = privateKey;
      }

      // Include AI settings if provided
      if (isLocalOpenAIProvider(providerId) && modelId.trim()) {
        body.aiProvider = providerId;
        body.aiModelId = modelId.trim();
        body.aiBaseUrl = baseUrl.trim() || DEFAULT_LOCAL_OPENAI_BASE_URL;
        if (apiKey.trim()) body.aiApiKey = apiKey.trim();
      } else if (apiKey.trim()) {
        body.aiProvider = providerId;
        body.aiModelId = modelId;
        body.aiApiKey = apiKey.trim();
      }

      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Setup failed");
        setSubmitting(false);
        return;
      }

      toast.success("Setup complete");
      clearNavigation();
      router.push("/dashboard?entry=1");
      router.refresh();
    } catch {
      toast.error("Network error");
      setSubmitting(false);
    }
  }

  async function handleEnterDemo() {
    setEnteringDemo(true);
    try {
      const res = await fetch("/api/setup/demo", { method: "POST" });
      if (!res.ok) {
        toast.error("Could not start demo mode");
        setEnteringDemo(false);
        return;
      }
      clearNavigation();
      router.push("/dashboard?entry=1");
      router.refresh();
    } catch {
      toast.error("Network error");
      setEnteringDemo(false);
    }
  }

  function handleNext() {
    if (step < WIZARD_STEPS) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  if (!ready) return null;

  const isWelcome = step === 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="drag fixed inset-x-0 top-0 h-16" />
      <div className="no-drag fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {step === 0 && <Package size={32} weight="fill" />}
            {step === 1 && <IdentificationBadge size={32} weight="fill" />}
            {step === 2 && <AppStoreLogoIcon size={32} weight="fill" />}
            {step === 3 && <MagicWand size={32} weight="fill" />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {step === 0 && "Welcome to Itsyconnect"}
            {step === 1 && "Developer account"}
            {step === 2 && "App Store Connect"}
            {step === 3 && "AI assistant"}
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            {step === 0 && "Better App Store Connect"}
            {step === 1 &&
              "Name your developer account to get started."}
            {step === 2 &&
              "Set up to manage apps, versions, and metadata."}
            {step === 3 &&
              "Add an API key to auto-translate app metadata, generate keywords, and improve descriptions."}
          </p>
        </div>

        {/* Step indicator (only for wizard steps 1–3) */}
        {!isWelcome && (
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: WIZARD_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i + 1 === step
                    ? "w-8 bg-primary"
                    : i + 1 < step
                      ? "w-4 bg-primary/40"
                      : "w-4 bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        {/* Welcome */}
        {step === 0 && (
          <div className="space-y-4">
            <ul className="flex flex-col items-start gap-3 text-sm text-muted-foreground w-fit mx-auto">
              <li className="flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                Manage apps, versions, and metadata across all platforms
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                TestFlight builds, beta groups, and testers in one place
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                AI-powered translations and copywriting (optional)
              </li>
              <li className="flex items-start gap-2">
                <Lock size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                All data stays on your machine, encrypted at rest
              </li>
            </ul>
          </div>
        )}

        {/* Step 1 – Team name */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Team name</label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAdvance()) handleNext();
                }}
                placeholder="My team"
                className="text-sm"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                A label to identify this developer account. You can connect multiple Apple developer accounts later.
              </p>
            </div>
          </div>
        )}

        {/* Step 2 – ASC credentials */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Go to{" "}
                  <a
                    href="https://appstoreconnect.apple.com/access/integrations/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    App Store Connect &rarr; Integrations &rarr; Team keys
                  </a>
                  {" "}and generate a key with <strong>Admin</strong> access.
                  Download the .p8 file and copy the Issuer ID shown on the page.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Issuer ID</label>
              <Input
                value={issuerId}
                onChange={(e) => {
                  setIssuerId(e.target.value);
                  resetConnectionTest();
                }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="font-mono text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Private key (.p8)
              </label>
              <Input
                type="file"
                accept=".p8"
                onChange={handleFileUpload}
                className="text-sm"
              />
              {keyError && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <XCircle size={14} weight="fill" />
                  {keyError}
                </p>
              )}
              {privateKey && !keyError && keyIdFromFile && (
                <>
                  {testStatus === "testing" && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Spinner className="size-3.5" />
                      Testing connection...
                    </p>
                  )}
                  {testStatus === "ok" && (
                    <p className="flex items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle size={14} weight="fill" />
                      Connected – key ID{" "}
                      <span className="font-mono">{keyId}</span>
                    </p>
                  )}
                  {testStatus === "error" && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircle size={14} weight="fill" />
                      {testError || "Connection failed – check your credentials."}
                    </p>
                  )}
                  {testStatus === "error" &&
                    keyId.trim() &&
                    issuerId.trim() && (
                      <button
                        type="button"
                        className="text-xs text-primary underline-offset-4 hover:underline"
                        onClick={() =>
                          testConnection(
                            issuerId.trim(),
                            keyId.trim(),
                            privateKey,
                          )
                        }
                      >
                        Test again
                      </button>
                    )}
                </>
              )}
              {privateKey && !keyError && !keyIdFromFile && (
                <p className="text-xs text-muted-foreground">
                  Key loaded. Enter the key ID below to continue.
                </p>
              )}
            </div>
            {/* Show key ID input only if not extracted from filename */}
            {privateKey && !keyIdFromFile && !keyError && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Key ID</label>
                <Input
                  value={keyId}
                  onChange={(e) => {
                    setKeyId(e.target.value);
                    resetConnectionTest();
                  }}
                  placeholder="XXXXXXXXXX"
                  className="font-mono text-sm"
                />
                {testStatus === "testing" && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    Testing connection...
                  </p>
                )}
                {testStatus === "ok" && (
                  <p className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle size={14} weight="fill" />
                    Connected – key ID{" "}
                    <span className="font-mono">{keyId}</span>
                  </p>
                )}
                {testStatus === "error" && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <XCircle size={14} weight="fill" />
                    {testError || "Connection failed – check your credentials."}
                  </p>
                )}
                {(testStatus === "idle" || testStatus === "error") &&
                  keyId.trim() &&
                  issuerId.trim() && (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() =>
                        testConnection(
                          issuerId.trim(),
                          keyId.trim(),
                          privateKey,
                        )
                      }
                    >
                      Test connection
                    </button>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Step 3 – AI */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Provider</label>
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-full text-sm">
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
            </div>
            {isLocalOpenAIProvider(providerId) && (
              <LocalServerFields
                baseUrl={baseUrl}
                onBaseUrlChange={setBaseUrl}
                modelId={modelId}
                onModelIdChange={setModelId}
                apiKey={apiKey}
                compact
              />
            )}
            {!isLocalOpenAIProvider(providerId) && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Model</label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {provider.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {m.id}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                API key{" "}
                <span className="text-xs text-muted-foreground/60">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isLocalOpenAIProvider(providerId)
                    ? "Optional token (if your local server requires auth)"
                    : "Paste your API key"}
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
          </div>
        )}

        {/* Navigation */}
        <div className={`flex items-center gap-2 ${isWelcome ? "justify-center" : "justify-end"}`}>
          {step > 1 && (
            <Button
              variant="ghost"
              onClick={() => setStep(step - 1)}
              disabled={submitting}
            >
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!canAdvance() || submitting}
          >
            {submitting ? (
              <>
                <Spinner />
                Setting up...
              </>
            ) : step === WIZARD_STEPS ? (
              "Finish"
            ) : step === 0 ? (
              "Get started"
            ) : (
              "Continue"
            )}
          </Button>
        </div>

        {isWelcome && (
          <div className="flex justify-center">
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              disabled={enteringDemo}
              onClick={handleEnterDemo}
            >
              {enteringDemo ? "Loading..." : "Explore with sample data"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
