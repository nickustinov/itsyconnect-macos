"use client";

import { useState } from "react";
import { WarningCircle, GithubLogo, Copy, Check, EnvelopeSimple } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/lib/version";
import { sanitisePath, sanitiseText } from "@/lib/sanitise-error";
import type { AscErrorEntry } from "@/lib/asc/errors";
import type { SyncError } from "@/lib/api-helpers";

export interface AscErrorReportData {
  message: string;
  ascErrors?: AscErrorEntry[];
  ascMethod?: string;
  ascPath?: string;
}

export interface SyncErrorReportData {
  syncErrors: SyncError[];
}

type ReportData =
  | ({ kind: "asc" } & AscErrorReportData)
  | ({ kind: "sync" } & SyncErrorReportData);

interface ErrorReportDialogProps {
  data: ReportData | null;
  onClose: () => void;
}

function formatAscDetails(data: AscErrorReportData): string {
  const lines: string[] = [];

  if (data.ascMethod && data.ascPath) {
    lines.push(`${data.ascMethod} ${sanitisePath(data.ascPath)}`);
    lines.push("");
  }

  if (data.ascErrors?.length) {
    for (const entry of data.ascErrors) {
      lines.push(`${entry.code}: ${sanitiseText(entry.detail)}`);
      if (entry.source?.pointer) {
        lines.push(`  source: ${entry.source.pointer}`);
      }
    }
  } else {
    lines.push(sanitiseText(data.message));
  }

  return lines.join("\n");
}

function formatSyncDetails(data: SyncErrorReportData): string {
  const lines: string[] = [];

  for (const err of data.syncErrors) {
    lines.push(`${err.operation} ${err.locale}: ${sanitiseText(err.message)}`);

    if (err.ascErrors?.length) {
      for (const entry of err.ascErrors) {
        lines.push(`  ${entry.code}: ${sanitiseText(entry.detail)}`);
        if (entry.source?.pointer) {
          lines.push(`    source: ${entry.source.pointer}`);
        }
      }
    }

    if (err.ascMethod && err.ascPath) {
      lines.push(`  ${err.ascMethod} ${sanitisePath(err.ascPath)}`);
    }
  }

  return lines.join("\n");
}

function buildGithubUrl(details: string, title: string): string {
  const body = [
    `**App version:** ${APP_VERSION}`,
    "",
    "**Error details:**",
    "```",
    details,
    "```",
    "",
    "**Steps to reproduce:**",
    "<!-- Describe what you were doing when this error occurred -->",
    "",
    "---",
    "_Reported via Itsyconnect error dialog_",
  ].join("\n");

  // URL limit is ~8000 chars after encoding; truncate body to stay safe
  const maxBody = 2500;
  const truncatedBody = body.length > maxBody
    ? body.slice(0, maxBody) + "\n...(truncated)"
    : body;

  const params = new URLSearchParams({
    title: sanitiseText(title),
    body: truncatedBody,
    labels: "bug",
  });

  return `https://github.com/nickustinov/itsyconnect-macos/issues/new?${params}`;
}

function buildReportText(details: string, title: string): string {
  return [
    title,
    "",
    `App version: ${APP_VERSION}`,
    "",
    "Error details:",
    details,
    "",
    "Steps to reproduce:",
    "(describe what you were doing when this error occurred)",
  ].join("\n");
}

const SUPPORT_EMAIL = "support@itsyconnect.com";

export function ErrorReportDialog({ data, onClose }: ErrorReportDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const details = data.kind === "asc"
    ? formatAscDetails(data)
    : formatSyncDetails(data);

  const title = data.kind === "asc"
    ? `ASC error: ${sanitiseText(data.message).slice(0, 60)}`
    : `Sync errors (${data.syncErrors.length})`;

  const description = data.kind === "asc"
    ? "App Store Connect returned an error"
    : `${data.syncErrors.length} error(s) occurred while saving`;

  function handleReport() {
    const url = buildGithubUrl(details, title);
    window.open(url, "_blank");
  }

  function handleCopy() {
    const text = buildReportText(details, title);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <WarningCircle size={20} className="shrink-0 text-destructive" />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-60 overflow-y-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-words">
          {details}
        </div>

        <p className="text-xs text-muted-foreground">
          <EnvelopeSimple size={13} className="inline-block mr-1 -mt-0.5" />
          You can also email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>
        </p>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Dismiss
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied
              ? <><Check size={14} className="mr-1.5" />Copied</>
              : <><Copy size={14} className="mr-1.5" />Copy</>
            }
          </Button>
          <Button size="sm" onClick={handleReport}>
            <GithubLogo size={14} className="mr-1.5" />
            Report issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
