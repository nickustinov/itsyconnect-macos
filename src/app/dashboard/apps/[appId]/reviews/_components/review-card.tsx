import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChatText,
  WarningCircle,
  Translate,
  CircleNotch,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { Stars } from "./review-summary";
import { territoryName } from "./territory-helpers";
import type { Review } from "./territory-helpers";

interface ReviewCardProps {
  review: Review;
  foreign: boolean;
  translated: false | { title: string; body: string };
  isTranslating: boolean;
  onTranslate: (review: Review) => void;
  onReply: (review: Review) => void;
  onEdit: (review: Review) => void;
  onAppeal: (review: Review) => void;
  onDeleteResponse: (reviewId: string, responseId: string) => void;
  deletingResponseId: string | null;
}

export function ReviewCard({
  review,
  foreign,
  translated,
  isTranslating,
  onTranslate,
  onReply,
  onEdit,
  onAppeal,
  onDeleteResponse,
  deletingResponseId,
}: ReviewCardProps) {
  return (
    <Card key={review.id}>
      <CardContent className="space-y-2 py-0">
        {/* Header: stars + title + date */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Stars rating={review.rating} size={12} />
            <p className="text-sm font-semibold select-text">
              {translated
                ? translated.title
                : review.title}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(review.createdDate).toLocaleDateString(
              "en-GB",
              {
                day: "numeric",
                month: "short",
                year: "numeric",
              },
            )}
          </span>
        </div>

        {/* Body */}
        <p className="text-sm select-text">
          {translated
            ? translated.body
            : review.body}
        </p>

        {/* Translation toggle */}
        {foreign && (
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            onClick={() => onTranslate(review)}
            disabled={isTranslating}
          >
            {isTranslating ? (
              <CircleNotch
                size={14}
                className="animate-spin"
              />
            ) : (
              <Translate size={14} />
            )}
            {isTranslating
              ? "Translating…"
              : translated
                ? "Show original"
                : "Translate"}
          </button>
        )}

        {/* Footer: author + territory + actions */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {review.reviewerNickname} &middot;{" "}
            {territoryName(review.territory)}
          </span>
          <div className="flex items-center gap-2">
            {review.rating <= 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => onAppeal(review)}
              >
                <WarningCircle size={14} className="mr-1.5" />
                Appeal review
              </Button>
            )}
            {!review.response && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReply(review)}
              >
                <ChatText size={14} className="mr-1.5" />
                Reply
              </Button>
            )}
          </div>
        </div>

        {/* Developer response */}
        {review.response && (
          <div className="rounded-lg border bg-muted/50 px-4 py-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium">
                  Developer response
                </p>
                {review.response.state === "PENDING_PUBLISH" && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    Pending
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => onEdit(review)}
                >
                  <PencilSimple size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteResponse(review.id, review.response!.id)}
                  disabled={deletingResponseId === review.response!.id}
                >
                  {deletingResponseId === review.response!.id ? (
                    <CircleNotch size={12} className="animate-spin" />
                  ) : (
                    <Trash size={12} />
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {new Date(
                    review.response.lastModifiedDate,
                  ).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
            <p className="text-sm select-text">
              {review.response.responseBody}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
