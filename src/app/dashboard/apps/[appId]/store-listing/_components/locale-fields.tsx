import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharCount } from "@/components/char-count";
import { KeywordTagInput } from "@/components/keyword-tag-input";
import { FIELD_LIMITS, FIELD_MIN_LIMITS } from "@/lib/asc/locale-names";
import { MagicWandButton, wandProps } from "@/components/magic-wand-button";
import type { MagicWandLocaleProps } from "@/components/magic-wand-button";

export interface LocaleFields {
  description: string;
  keywords: string;
  whatsNew: string;
  promotionalText: string;
  supportUrl: string;
  marketingUrl: string;
}

export function emptyLocaleFields(): LocaleFields {
  return {
    description: "",
    keywords: "",
    whatsNew: "",
    promotionalText: "",
    supportUrl: "",
    marketingUrl: "",
  };
}

export function LocaleFieldsSection({
  current,
  localeTag,
  readOnly,
  onFieldChange,
  wand,
  onBulkAllMode,
  hideWhatsNew,
}: {
  current: LocaleFields;
  localeTag: ReactNode;
  readOnly: boolean;
  onFieldChange: (field: keyof LocaleFields, value: string) => void;
  wand: MagicWandLocaleProps;
  onBulkAllMode: (field: string) => void;
  hideWhatsNew?: boolean;
}) {
  return (
    <>
      {/* What's new – hidden for the first-ever version (ASC rejects it) */}
      {!hideWhatsNew && <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">What&apos;s new{localeTag}</h3>
          <MagicWandButton
            value={current.whatsNew}
            onChange={(v) => onFieldChange("whatsNew", v)}
            {...wandProps(wand, "whatsNew")}
            charLimit={FIELD_LIMITS.whatsNew}
            disabled={readOnly}
            onTranslateAll={() => onBulkAllMode("whatsNew")}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={current.whatsNew}
              onChange={(e) => onFieldChange("whatsNew", e.target.value)}
              readOnly={readOnly}
              placeholder="Describe what's new in this version..."
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.whatsNew}
              limit={FIELD_LIMITS.whatsNew}
              min={FIELD_MIN_LIMITS.whatsNew}
            />
          </div>
        </Card>
      </section>}

      {/* Promotional text -- editable anytime per ASC rules */}
      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">Promotional text{localeTag}</h3>
          <MagicWandButton
            value={current.promotionalText}
            onChange={(v) => onFieldChange("promotionalText", v)}
            {...wandProps(wand, "promotionalText")}
            charLimit={FIELD_LIMITS.promotionalText}
            onTranslateAll={() => onBulkAllMode("promotionalText")}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={current.promotionalText}
              onChange={(e) =>
                onFieldChange("promotionalText", e.target.value)
              }
              placeholder="Inform App Store visitors of current features..."
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.promotionalText}
              limit={FIELD_LIMITS.promotionalText}
            />
          </div>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">Description{localeTag}</h3>
          <MagicWandButton
            value={current.description}
            onChange={(v) => onFieldChange("description", v)}
            {...wandProps(wand, "description")}
            charLimit={FIELD_LIMITS.description}
            disabled={readOnly}
            onTranslateAll={() => onBulkAllMode("description")}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={current.description}
              onChange={(e) => onFieldChange("description", e.target.value)}
              readOnly={readOnly}
              placeholder="Describe your app..."
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.description}
              limit={FIELD_LIMITS.description}
              min={FIELD_MIN_LIMITS.description}
            />
          </div>
        </Card>
      </section>

      {/* Keywords */}
      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">Keywords{localeTag}</h3>
          <MagicWandButton
            value={current.keywords}
            onChange={(v) => onFieldChange("keywords", v)}
            {...wandProps(wand, "keywords")}
            charLimit={FIELD_LIMITS.keywords}
            disabled={readOnly}
            onTranslateAll={() => onBulkAllMode("keywords")}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <KeywordTagInput
              value={current.keywords}
              onChange={(v) => onFieldChange("keywords", v)}
              readOnly={readOnly}
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.keywords}
              limit={FIELD_LIMITS.keywords}
            />
          </div>
        </Card>
      </section>

      {/* URLs */}
      <section className="space-y-2">
        <h3 className="section-title">URLs</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Support URL{localeTag}
            </label>
            <Input
              dir="ltr"
              value={current.supportUrl}
              onChange={(e) => onFieldChange("supportUrl", e.target.value)}
              readOnly={readOnly}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Marketing URL{localeTag}
            </label>
            <Input
              dir="ltr"
              value={current.marketingUrl}
              onChange={(e) => onFieldChange("marketingUrl", e.target.value)}
              readOnly={readOnly}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
        </div>
      </section>
    </>
  );
}
