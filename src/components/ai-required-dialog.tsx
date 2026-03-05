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

interface AIRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIRequiredDialog({ open, onOpenChange }: AIRequiredDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI setup required</DialogTitle>
          <DialogDescription>
            Configure an AI provider (cloud or local server) in Settings to use
            translations and improvements.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              router.push("/settings/ai");
            }}
          >
            Open settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
