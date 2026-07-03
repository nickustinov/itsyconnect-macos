"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "@/lib/i18n/locale-context";

interface AIRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIRequiredDialog({ open, onOpenChange }: AIRequiredDialogProps) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ai.requiredTitle")}</DialogTitle>
          <DialogDescription>
            {t("ai.requiredDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("ai.maybeLater")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              router.push("/settings/ai");
            }}
          >
            {t("ai.openSettings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
