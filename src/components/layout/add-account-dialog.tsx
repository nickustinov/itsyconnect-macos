"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddAccountDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddAccountDialogProps) {
  const [name, setName] = useState("My team");
  const [issuerId, setIssuerId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [keyIdFromFile, setKeyIdFromFile] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [testError, setTestError] = useState("");

  function reset() {
    setName("My team");
    setIssuerId("");
    setKeyId("");
    setKeyIdFromFile(false);
    setPrivateKey("");
    setKeyError("");
    setSaving(false);
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
    setTestStatus("idle");
    setTestError("");
    setPrivateKey("");
    setKeyId("");
    setKeyIdFromFile(false);

    file.text().then((text) => {
      const trimmed = text.trim();

      if (
        !trimmed.startsWith("-----BEGIN PRIVATE KEY-----") ||
        !trimmed.endsWith("-----END PRIVATE KEY-----")
      ) {
        setKeyError("Invalid key file – expected a .p8 private key from Apple.");
        return;
      }

      setPrivateKey(trimmed);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/settings/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "My team",
          issuerId: issuerId.trim(),
          keyId: keyId.trim(),
          privateKey,
        }),
      });

      if (res.ok) {
        toast.success("Team added");
        reset();
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to add team");
      }
    } catch {
      toast.error("Network error");
    }

    setSaving(false);
  }

  const canSave =
    issuerId.trim().length > 0 &&
    keyId.trim().length > 0 &&
    privateKey.length > 0 &&
    !keyError;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add team</DialogTitle>
          <DialogDescription>
            Connect another Apple developer account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Team name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My team"
              className="text-sm"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              A label to identify this developer account.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Issuer ID</label>
            <Input
              value={issuerId}
              onChange={(e) => setIssuerId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm"
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
                    <Spinner className="size-3.5" />
                    Testing connection…
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
          <DialogFooter>
            <Button type="submit" disabled={saving || !canSave}>
              {saving ? (
                <>
                  <Spinner />
                  Adding…
                </>
              ) : (
                "Add team"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
