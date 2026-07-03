"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useTranslations } from "@/lib/i18n/locale-context";

export function CreateGroupDialog({
  open,
  onOpenChange,
  appId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  onCreated: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setIsInternal(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    try {
      await apiFetch(`/api/apps/${appId}/testflight/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), isInternal }),
      });
      toast.success(t("testflight.groupCreated", { name: name.trim() }));
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.createGroupFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("testflight.newGroup")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <RadioGroup
            value={isInternal ? "internal" : "external"}
            onValueChange={(v) => setIsInternal(v === "internal")}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="external" id="type-external" />
              <Label htmlFor="type-external">{t("testflight.groupTypeExternal")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="internal" id="type-internal" />
              <Label htmlFor="type-internal">{t("testflight.groupTypeInternal")}</Label>
            </div>
          </RadioGroup>
          <Input
            placeholder={t("testflight.groupNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || submitting}>
              {submitting && <Spinner className="mr-1.5" />}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
