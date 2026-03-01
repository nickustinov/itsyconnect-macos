"use client";

import { APP_VERSION, BUILD_NUMBER } from "@/lib/version";

export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Itsyconnect</h2>
        <a
          href="https://itsyconnect.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:underline underline-offset-4"
        >
          https://itsyconnect.com
        </a>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">Version</span>
          <p className="font-mono text-xs mt-0.5">{APP_VERSION}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Build</span>
          <p className="font-mono text-xs mt-0.5">{BUILD_NUMBER}</p>
        </div>
      </div>
    </div>
  );
}
