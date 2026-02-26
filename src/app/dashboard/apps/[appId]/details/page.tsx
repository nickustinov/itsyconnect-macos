"use client";

import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SpinnerGap } from "@phosphor-icons/react";
import { useApps } from "@/lib/apps-context";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";

const AGE_RATING_LABELS: Record<string, string> = {
  FOUR_PLUS: "4+",
  NINE_PLUS: "9+",
  TWELVE_PLUS: "12+",
  SEVENTEEN_PLUS: "17+",
};

export default function AppDetailsPage() {
  const { appId } = useParams<{ appId: string }>();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { appInfos, loading: infoLoading } = useAppInfo(appId);
  const appInfo = pickAppInfo(appInfos);
  const appInfoId = appInfo?.id ?? "";

  const { localizations, loading: locLoading } = useAppInfoLocalizations(appId, appInfoId);

  // Find primary locale localization
  const primaryLoc = localizations.find(
    (l) => l.attributes.locale === app?.primaryLocale,
  ) ?? localizations[0];

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  if (infoLoading || locLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ageRating = appInfo?.attributes.appStoreAgeRating;
  const primaryCategoryId = appInfo?.primaryCategory?.id ?? "";
  const secondaryCategoryId = appInfo?.secondaryCategory?.id ?? "";

  return (
    <div className="space-y-8">
      {/* Identifiers (read-only) */}
      <section className="space-y-2">
        <h3 className="section-title">Identifiers</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Bundle ID" value={app.bundleId} mono />
          <ReadOnlyField label="SKU" value={app.sku} mono />
        </div>
      </section>

      {/* Base language */}
      <section className="space-y-2">
        <h3 className="section-title">Base language</h3>
        <Select defaultValue={app.primaryLocale}>
          <SelectTrigger className="w-[200px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {localizations.map((loc) => (
              <SelectItem key={loc.attributes.locale} value={loc.attributes.locale}>
                {loc.attributes.locale}
              </SelectItem>
            ))}
            {localizations.length === 0 && (
              <SelectItem value={app.primaryLocale}>
                {app.primaryLocale}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </section>

      {/* Categories */}
      <section className="space-y-2">
        <h3 className="section-title">Categories</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Primary category
            </label>
            <ReadOnlyField label="" value={primaryCategoryId || "Not set"} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Secondary category
            </label>
            <ReadOnlyField label="" value={secondaryCategoryId || "None"} />
          </div>
        </div>
      </section>

      {/* Age rating */}
      <section className="space-y-2">
        <h3 className="section-title">Age rating</h3>
        <div className="flex gap-4">
          <Card className="w-32">
            <CardContent className="flex flex-col items-center justify-center py-4">
              <span className="text-2xl font-bold">
                {ageRating ? (AGE_RATING_LABELS[ageRating] ?? ageRating) : "–"}
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* URLs */}
      <section className="space-y-2">
        <h3 className="section-title">URLs</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Privacy policy URL
            </label>
            <Input
              defaultValue={primaryLoc?.attributes.privacyPolicyUrl ?? ""}
              placeholder="https://..."
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Privacy choices URL
            </label>
            <Input
              defaultValue={primaryLoc?.attributes.privacyChoicesUrl ?? ""}
              placeholder="https://..."
              className="font-mono text-sm"
            />
          </div>
        </div>
      </section>

      {/* Content rights */}
      <section className="space-y-2 pb-8">
        <h3 className="section-title">Content rights</h3>
        <RadioGroup defaultValue="none">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="none" id="cr-none" />
            <Label htmlFor="cr-none" className="text-sm font-normal">
              Does not use third-party content
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="has-rights" id="cr-has-rights" />
            <Label htmlFor="cr-has-rights" className="text-sm font-normal">
              Contains third-party content and I have the necessary rights
            </Label>
          </div>
        </RadioGroup>
      </section>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
