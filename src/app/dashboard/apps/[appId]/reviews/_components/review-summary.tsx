"use client";

import { Star } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "@/lib/i18n/locale-context";

// ── Stars ──────────────────────────────────────────────────────────

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          weight={i < rating ? "fill" : "regular"}
          className={
            i < rating ? "text-yellow-500" : "text-muted-foreground/30"
          }
        />
      ))}
    </div>
  );
}

// ── RatingBar ──────────────────────────────────────────────────────

function RatingBar({
  star,
  count,
  total,
}: {
  star: number;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 text-right text-xs text-muted-foreground">
        {star}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-yellow-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

// ── ReviewSummary ──────────────────────────────────────────────────

interface ReviewSummaryProps {
  avgRating: number;
  total: number;
  distribution: { star: number; count: number }[];
}

export function ReviewSummary({ avgRating, total, distribution }: ReviewSummaryProps) {
  const t = useTranslations();

  return (
    <Card>
      <CardContent className="flex items-center gap-8 py-0">
        <div>
          <div className="text-4xl font-bold tabular-nums">
            {avgRating.toFixed(1)}
          </div>
          <Stars rating={Math.round(avgRating)} />
          <p className="mt-1 text-xs text-muted-foreground">
            {total} {total === 1 ? t("reviews.summaryReview") : t("reviews.summaryReviews")}
          </p>
        </div>
        <div className="flex-1 space-y-1.5">
          {distribution.map(({ star, count }) => (
            <RatingBar
              key={star}
              star={star}
              count={count}
              total={total}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
