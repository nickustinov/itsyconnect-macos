"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeSlash, Info } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName } from "@/lib/asc/locale-names";

interface TranslateScreenshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Original screenshot image URL (Apple CDN). */
  originalUrl: string;
  /** File name of the original screenshot. */
  fileName: string;
  /** Target locale code. */
  toLocale: string;
  /** Called with the translated image blob when user accepts. */
  onAccept: (file: File) => Promise<void>;
  /** Copy the original screenshot without translation. */
  onCopy: () => Promise<void>;
}

type Phase = "idle" | "translating" | "done" | "error";

export function TranslateScreenshotModal({
  open,
  onOpenChange,
  originalUrl,
  fileName,
  toLocale,
  onAccept,
  onCopy,
}: TranslateScreenshotModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [marketingOnly, setMarketingOnly] = useState(true);
  const [translatedSrc, setTranslatedSrc] = useState<string>("");
  const [translatedBlob, setTranslatedBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copying, setCopying] = useState(false);

  // Gemini key state (for inline key entry)
  const [geminiKey, setGeminiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Reset state and check key availability when modal opens
  useEffect(() => {
    if (!open) return;
    setPhase("idle");
    setError("");
    setTranslatedSrc("");
    setTranslatedBlob(null);
    setGeminiKey("");
    setUploading(false);
    setCopying(false);
    setHasKey(null);

    fetch("/api/settings/gemini-key")
      .then((res) => res.json())
      .then((data: { available: boolean }) => {
        setHasKey(data.available);
      })
      .catch(() => {
        setHasKey(false);
      });
  }, [open]);

  // Focus key input when it appears
  useEffect(() => {
    if (hasKey === false) {
      setTimeout(() => keyInputRef.current?.focus(), 0);
    }
  }, [hasKey]);

  async function handleTranslate(keyOverride?: string) {
    setError("");
    setPhase("translating");
    console.log("[translate-modal] Starting translation, url=%s locale=%s", originalUrl.slice(0, 80), toLocale);

    try {
      const res = await fetch("/api/ai/translate-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: originalUrl,
          toLocale,
          marketingOnly,
          ...(keyOverride ? { geminiKey: keyOverride } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "gemini_key_required") {
          setHasKey(false);
          setPhase("idle");
          return;
        }
        if (data.error === "gemini_auth_error") {
          setHasKey(false);
          setPhase("idle");
          setError("Invalid API key. Please check and try again.");
          return;
        }
        throw new Error(data.error || "Translation failed");
      }

      // Convert base64 response to blob URL for preview
      const binaryStr = atob(data.imageBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const resultBlob = new Blob([bytes], { type: data.mimeType || "image/png" });
      setTranslatedBlob(resultBlob);
      setTranslatedSrc(URL.createObjectURL(resultBlob));
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
      setPhase("error");
    }
  }

  async function handleAccept() {
    if (!translatedBlob) return;
    setUploading(true);
    try {
      const ext = translatedBlob.type === "image/jpeg" ? ".jpg" : ".png";
      const name = fileName.replace(/\.[^.]+$/, "") + `_${toLocale}${ext}`;
      const file = new File([translatedBlob], name, { type: translatedBlob.type });
      await onAccept(file);
      onOpenChange(false);
    } catch {
      setError("Failed to add screenshot");
    } finally {
      setUploading(false);
    }
  }

  function handleKeySubmit() {
    if (!geminiKey.trim()) return;
    setHasKey(true);
    handleTranslate(geminiKey.trim());
  }

  const isWorking = phase === "translating";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            Translate screenshot to {localeName(toLocale)}
          </DialogTitle>
        </DialogHeader>

        {/* Preview area – always visible */}
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border bg-muted/20 p-3">
          {phase === "done" && translatedSrc ? (
            <img
              src={translatedSrc}
              alt="Translated screenshot"
              className="max-h-[60vh] w-auto rounded object-contain"
            />
          ) : phase === "translating" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Translating with Gemini 3 Pro Image…</p>
              <p className="text-xs text-muted-foreground">This can take up to a minute</p>
            </div>
          ) : phase === "error" ? (
            <p className="max-w-sm text-center text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Translated image preview will appear here
            </p>
          )}
        </div>

        {/* Needs key – inline form */}
        {hasKey === false && phase !== "done" && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start gap-2 text-sm">
              <Info size={16} className="mt-0.5 shrink-0 text-orange-500" />
              <p className="text-muted-foreground">
                Screenshot translation uses Gemini 3 Pro Image. Enter your Gemini API key to continue.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  ref={keyInputRef}
                  type={showKey ? "text" : "password"}
                  placeholder="Gemini API key"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && geminiKey.trim()) handleKeySubmit();
                  }}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
                >
                  {showKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-auto">
            <Switch
              id="marketing-only"
              checked={marketingOnly}
              onCheckedChange={setMarketingOnly}
              disabled={isWorking}
            />
            <Label htmlFor="marketing-only" className="text-sm">
              Don&apos;t translate app UI
            </Label>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              setCopying(true);
              try {
                await onCopy();
                onOpenChange(false);
              } catch {
                setError("Failed to copy screenshot");
                setPhase("error");
              } finally {
                setCopying(false);
              }
            }}
            disabled={isWorking || copying || uploading}
          >
            {copying ? (
              <>
                <Spinner className="size-3" />
                Copying…
              </>
            ) : (
              "Copy without translation"
            )}
          </Button>
          {phase === "done" ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleTranslate()}
                disabled={uploading}
              >
                Retry
              </Button>
              <Button onClick={handleAccept} disabled={uploading}>
                {uploading ? (
                  <>
                    <Spinner className="size-3" />
                    Adding…
                  </>
                ) : (
                  "Add to locale"
                )}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => handleTranslate(hasKey === false && geminiKey.trim() ? geminiKey.trim() : undefined)}
              disabled={isWorking || copying || (hasKey === false && !geminiKey.trim())}
            >
              Translate
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-right">
          Uses Gemini 3 Pro Image – approximately $0.30 per image.{" "}
          <a
            href="https://cloud.google.com/vertex-ai/generative-ai/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Google pricing
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
