"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MOCK_APPS, resolveVersion } from "@/lib/mock-data";

export default function AppReviewPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const app = MOCK_APPS.find((a) => a.id === appId);

  const selectedVersion = useMemo(
    () => resolveVersion(appId, searchParams.get("version")),
    [appId, searchParams],
  );

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Review notes */}
      <section className="space-y-2">
        <h3 className="section-title">Notes for App Review</h3>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              placeholder="Provide any additional information the App Review team might need..."
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-sm min-h-0"
              defaultValue=""
            />
          </CardContent>
          <div className="flex items-center justify-end border-t px-3 py-1.5">
            <span className="text-xs tabular-nums text-muted-foreground">
              0/4000
            </span>
          </div>
        </Card>
      </section>

      {/* Demo account */}
      <section className="space-y-2">
        <h3 className="section-title">Demo account</h3>
        <p className="text-sm text-muted-foreground">
          If your app requires sign-in, provide credentials for the review team.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Username</label>
            <Input placeholder="demo@example.com" className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Password</label>
            <Input
              type="password"
              placeholder="Password"
              className="font-mono text-sm"
            />
          </div>
        </div>
      </section>

      {/* Contact information */}
      <section className="space-y-2 pb-8">
        <h3 className="section-title">Contact details</h3>
        <p className="text-sm text-muted-foreground">
          How the App Review team can reach you if they have questions.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">First name</label>
            <Input className="text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Last name</label>
            <Input className="text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Phone</label>
            <Input className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Email</label>
            <Input type="email" className="font-mono text-sm" />
          </div>
        </div>
      </section>
    </div>
  );
}
