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
import { useTranslations } from "@/lib/i18n/locale-context";

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
  const t = useTranslations();
  const [name, setName] = useState("");
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
    setName("");
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
        setTestError(data.error || t("common.connectionFailed"));
      }
    } catch {
      setTestStatus("error");
      setTestError(t("common.networkError"));
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
        setKeyError(t("common.invalidKeyFile"));
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
          name: name.trim() || t("nav.myTeam"),
          issuerId: issuerId.trim(),
          keyId: keyId.trim(),
          privateKey,
        }),
      });

      if (res.ok) {
        toast.success(t("addTeam.teamAdded"));
        reset();
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("addTeam.addFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
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
          <DialogTitle>{t("addTeam.title")}</DialogTitle>
          <DialogDescription>
            {t("addTeam.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("addTeam.teamName")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("nav.myTeam")}
              className="text-sm"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t("addTeam.teamNameHint")}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("addTeam.issuerId")}</label>
            <Input
              value={issuerId}
              onChange={(e) => setIssuerId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t("addTeam.adminAccessHint")}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              {t("addTeam.privateKey")}
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
                    {t("common.testingConnection")}
                  </p>
                )}
                {testStatus === "ok" && (
                  <p className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle size={14} weight="fill" />
                    {t("common.connectedKeyId")}{" "}
                    <span className="font-mono">{keyId}</span>
                  </p>
                )}
                {testStatus === "error" && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <XCircle size={14} weight="fill" />
                    {testError || t("common.connectionFailedCheck")}
                    {" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-destructive/80"
                      onClick={() => testConnection(issuerId.trim(), keyId.trim(), privateKey)}
                    >
                      {t("common.testAgain")}
                    </button>
                  </p>
                )}
                {testStatus === "idle" && !keyIdFromFile && (
                  <p className="text-xs text-muted-foreground">
                    {t("common.keyLoadedEnterId")}
                  </p>
                )}
              </>
            )}
          </div>
          {privateKey && !keyIdFromFile && !keyError && (
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("addTeam.keyId")}</label>
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
                  {t("addTeam.adding")}
                </>
              ) : (
                t("addTeam.addTeam")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
