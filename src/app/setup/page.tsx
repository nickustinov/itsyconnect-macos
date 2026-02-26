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
  Info,
  Lock,
  Sailboat,
  SpinnerGap,
  XCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { ThemeToggle } from "@/components/theme-toggle";

const TOTAL_STEPS = 3;

export default function SetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setup) {
          router.replace("/dashboard");
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true));
  }, [router]);

  // Step 2 – ASC credentials
  const [issuerId, setIssuerId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [keyIdFromFile, setKeyIdFromFile] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [testError, setTestError] = useState("");

  // Step 3 – AI
  const [providerId, setProviderId] = useState("anthropic");
  const [modelId, setModelId] = useState("claude-sonnet-4-20250514");
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
    setTestStatus("idle");
    setTestError("");
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

      // Auto-test connection if issuer ID is filled
      const resolvedKeyId = match ? match[1] : keyId.trim();
      if (issuerId.trim() && resolvedKeyId) {
        testConnection(issuerId.trim(), resolvedKeyId, trimmed);
      }
    });
  }

  function canAdvance(): boolean {
    if (step === 1) return true; // Welcome splash – always can advance
    if (step === 2) {
      return (
        issuerId.trim().length > 0 &&
        keyId.trim().length > 0 &&
        privateKey.trim().length > 0
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
        body.issuerId = issuerId.trim();
        body.keyId = keyId.trim();
        body.privateKey = privateKey;
        if (vendorId.trim()) {
          body.vendorId = vendorId.trim();
        }
      }

      // Include AI settings if provided
      if (apiKey.trim()) {
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
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error");
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  function handleFinish() {
    handleSubmit();
  }

  if (!ready) return null;

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
            {step === 2 ? (
              <AppStoreLogoIcon size={32} weight="fill" />
            ) : (
              <Sailboat size={32} weight="fill" />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {step === 1 && "Welcome to Itsyship"}
            {step === 2 && "Set up App Store Connect"}
            {step === 3 && "Set up AI"}
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            {step === 1 && "Let\u2019s get you set up."}
            {step === 3 &&
              "Add an API key to auto-translate app metadata and generate release notes, keywords, and descriptions."}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
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

        {/* Step 1 – welcome */}
        {step === 1 && (
          <div className="space-y-4">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-primary" />
                Manage apps, versions, and metadata across all platforms
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-primary" />
                TestFlight builds, beta groups, and testers in one place
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-primary" />
                AI-powered translations and copywriting (optional)
              </li>
              <li className="flex items-start gap-2">
                <Lock size={16} weight="fill" className="mt-0.5 shrink-0 text-primary" />
                All data stays on your machine, encrypted at rest
              </li>
            </ul>
          </div>
        )}

        {/* Step 2 – ASC credentials */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Instructions */}
            <div className="space-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>
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
                  <p>
                    For <strong>Vendor ID</strong>, go to{" "}
                    <a
                      href="https://appstoreconnect.apple.com/itc/payments_and_financial_reports"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Payments and financial reports
                    </a>
                    {" "}&ndash; it&rsquo;s the number shown in the top-left corner.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Issuer ID</label>
              <Input
                value={issuerId}
                onChange={(e) => setIssuerId(e.target.value)}
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
              {privateKey && !keyError && (
                <>
                  {testStatus === "testing" && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <SpinnerGap size={14} className="animate-spin" />
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
                      {" "}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-destructive/80"
                        onClick={() => testConnection(issuerId.trim(), keyId.trim(), privateKey)}
                      >
                        Test again
                      </button>
                    </p>
                  )}
                  {testStatus === "idle" && !keyIdFromFile && (
                    <p className="text-xs text-muted-foreground">
                      Key loaded. Enter the key ID below to continue.
                    </p>
                  )}
                </>
              )}
            </div>
            {/* Show key ID input only if not extracted from filename */}
            {privateKey && !keyIdFromFile && !keyError && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Key ID</label>
                <Input
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  placeholder="XXXXXXXXXX"
                  className="font-mono text-sm"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Vendor ID{" "}
                <span className="text-xs text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                placeholder="XXXXXXXX"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Required for sales and financial reports. You can add it later in settings.
              </p>
            </div>

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
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">API key</label>
              <div className="flex items-center gap-2">
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
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className={`flex items-center ${step === 1 ? "justify-center" : "justify-between"}`}>
          {step > 1 ? (
            <Button
              variant="ghost"
              onClick={() => setStep(step - 1)}
              disabled={submitting}
            >
              Back
            </Button>
          ) : (
            step !== 1 && <div />
          )}
          <div className="flex items-center gap-2">
            {step === 3 && !apiKey && (
              <Button
                variant="ghost"
                onClick={handleFinish}
                disabled={submitting}
              >
                Skip
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canAdvance() || submitting}
            >
              {submitting ? (
                <>
                  <SpinnerGap size={16} className="animate-spin" />
                  Setting up...
                </>
              ) : step === TOTAL_STEPS ? (
                "Finish"
              ) : step === 1 ? (
                "Get started"
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
