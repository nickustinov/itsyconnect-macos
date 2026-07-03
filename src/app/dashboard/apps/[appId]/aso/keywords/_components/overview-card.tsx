"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Warning, CheckCircle, MagicWand } from "@phosphor-icons/react";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { AIRequiredDialog } from "@/components/ai-required-dialog";
import { FixAllDialog } from "./fix-all-dialog";
import type { StorefrontAnalysis } from "./keyword-analysis";
import { useTranslations } from "@/lib/i18n/locale-context";

interface OverviewCardProps {
  analysis: StorefrontAnalysis;
  readOnly: boolean;
  appName: string | undefined;
  primaryLocale?: string;
  getTitle: (locale: string) => string | null;
  getSubtitle: (locale: string) => string | null;
  getDescription: (locale: string) => string;
  onApplyFixes: (updates: Record<string, string>) => void;
  header?: React.ReactNode;
  children?: React.ReactNode;
}

export function OverviewCard({
  analysis,
  readOnly,
  appName,
  primaryLocale,
  getTitle,
  getSubtitle,
  getDescription,
  onApplyFixes,
  header,
  children,
}: OverviewCardProps) {
  const t = useTranslations();
  const { configured } = useAIStatus();
  const [showAIRequired, setShowAIRequired] = useState(false);
  const [showFixAll, setShowFixAll] = useState(false);

  const budgetPercent = analysis.totalBudget > 0
    ? Math.round((analysis.totalCharsUsed / analysis.totalBudget) * 100)
    : 0;
  const issueCount = analysis.totalOverlaps + analysis.crossLocaleDuplicates.size + analysis.missingLocales.length;
  const fixableIssueCount = analysis.totalOverlaps + analysis.crossLocaleDuplicates.size;
  const hasUnusedBudget = analysis.localeData.some((ld) => ld.charsFree > 15);
  const allGood = issueCount === 0 && budgetPercent >= 80;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {header}
              {children}
            </div>
            {allGood && (
              <Badge variant="outline" className="border-green-500/50 text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle size={14} className="mr-1" weight="fill" />
                {t("keywords.goodShape")}
              </Badge>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">
                {t("keywords.keywordBudget", {
                  used: analysis.totalCharsUsed,
                  total: analysis.totalBudget,
                  percent: budgetPercent,
                })}
              </span>
              <span className="text-muted-foreground">
                {t("keywords.charsFree", { count: analysis.totalBudget - analysis.totalCharsUsed })}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetPercent >= 80 ? "bg-green-500" : budgetPercent >= 50 ? "bg-primary" : "bg-amber-500"}`}
                style={{ width: `${Math.min(budgetPercent, 100)}%` }}
              />
            </div>
          </div>

          {(issueCount > 0 || hasUnusedBudget) && (
            <div className="flex flex-wrap items-center gap-2">
              {analysis.totalOverlaps > 0 && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                  <Warning size={14} className="mr-1" weight="fill" />
                  {analysis.totalOverlaps === 1
                    ? t("keywords.overlapBadge", { count: analysis.totalOverlaps })
                    : t("keywords.overlapBadgePlural", { count: analysis.totalOverlaps })}
                </Badge>
              )}
              {analysis.crossLocaleDuplicates.size > 0 && (
                <Badge variant="outline" className="border-blue-500/50 text-blue-600 dark:text-blue-400">
                  {analysis.crossLocaleDuplicates.size === 1
                    ? t("keywords.crossLocaleBadge", { count: analysis.crossLocaleDuplicates.size })
                    : t("keywords.crossLocaleBadgePlural", { count: analysis.crossLocaleDuplicates.size })}
                </Badge>
              )}
              {analysis.missingLocales.length > 0 && (
                <Badge variant="outline">
                  {analysis.missingLocales.length === 1
                    ? t("keywords.untappedBadge", { count: analysis.missingLocales.length })
                    : t("keywords.untappedBadgePlural", { count: analysis.missingLocales.length })}
                </Badge>
              )}
            </div>
          )}

          {!readOnly && (fixableIssueCount > 0 || hasUnusedBudget) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!configured) { setShowAIRequired(true); return; }
                setShowFixAll(true);
              }}
            >
              <MagicWand size={14} className="mr-1.5" />
              {t("keywords.fixAllIssues")}
            </Button>
          )}
        </CardContent>
      </Card>

      <AIRequiredDialog open={showAIRequired} onOpenChange={setShowAIRequired} />
      <FixAllDialog
        open={showFixAll}
        onOpenChange={setShowFixAll}
        analysis={analysis}
        appName={appName}
        primaryLocale={primaryLocale}
        appTitle={getTitle}
        appSubtitle={getSubtitle}
        description={getDescription}
        onApply={onApplyFixes}
      />
    </>
  );
}
