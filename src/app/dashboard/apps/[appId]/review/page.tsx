"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SpinnerGap } from "@phosphor-icons/react";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { resolveVersion } from "@/lib/asc/version-types";

export default function AppReviewPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading } = useVersions();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );

  const reviewDetail = selectedVersion?.reviewDetail?.attributes;

  const [notes, setNotes] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [demoName, setDemoName] = useState("");
  const [demoPassword, setDemoPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Pre-fill from review detail when version changes
  useEffect(() => {
    if (reviewDetail) {
      setNotes(reviewDetail.notes ?? "");
      setSignInRequired(reviewDetail.demoAccountRequired ?? false);
      setDemoName(reviewDetail.demoAccountName ?? "");
      setDemoPassword(reviewDetail.demoAccountPassword ?? "");
      setFirstName(reviewDetail.contactFirstName ?? "");
      setLastName(reviewDetail.contactLastName ?? "");
      setPhone(reviewDetail.contactPhone ?? "");
      setEmail(reviewDetail.contactEmail ?? "");
    } else {
      setNotes("");
      setSignInRequired(false);
      setDemoName("");
      setDemoPassword("");
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
    }
  }, [reviewDetail]);

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  if (versionsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>
          <div className="flex items-center justify-end border-t px-3 py-1.5">
            <span className="text-xs tabular-nums text-muted-foreground">
              {notes.length}/4000
            </span>
          </div>
        </Card>
      </section>

      {/* Demo account */}
      <section className="space-y-4">
        <h3 className="section-title">Demo account</h3>
        <div className="flex items-center gap-3">
          <Switch
            id="sign-in-required"
            checked={signInRequired}
            onCheckedChange={setSignInRequired}
          />
          <Label htmlFor="sign-in-required" className="text-sm">
            Sign-in required
          </Label>
        </div>
        {signInRequired && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Username</label>
              <Input
                placeholder="demo@example.com"
                className="font-mono text-sm"
                value={demoName}
                onChange={(e) => setDemoName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Password</label>
              <Input
                type="password"
                placeholder="Password"
                className="font-mono text-sm"
                value={demoPassword}
                onChange={(e) => setDemoPassword(e.target.value)}
              />
            </div>
          </div>
        )}
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
            <Input
              className="text-sm"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Last name</label>
            <Input
              className="text-sm"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Phone</label>
            <Input
              className="font-mono text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Email</label>
            <Input
              type="email"
              className="font-mono text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
