"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { territoryName } from "./territory-helpers";
import { useTranslations } from "@/lib/i18n/locale-context";

interface ReviewFiltersProps {
  sortBy: string;
  onSortChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  ratingFilter: string;
  onRatingFilterChange: (value: string) => void;
  territoryFilter: string;
  onTerritoryFilterChange: (value: string) => void;
  territories: string[];
  hideResponded: boolean;
  onHideRespondedChange: (value: boolean) => void;
}

export function ReviewFilters({
  sortBy,
  onSortChange,
  dateFilter,
  onDateFilterChange,
  ratingFilter,
  onRatingFilterChange,
  territoryFilter,
  onTerritoryFilterChange,
  territories,
  hideResponded,
  onHideRespondedChange,
}: ReviewFiltersProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={sortBy} onValueChange={onSortChange}>
        <SelectTrigger className="w-[140px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">{t("reviews.filters.newest")}</SelectItem>
          <SelectItem value="oldest">{t("reviews.filters.oldest")}</SelectItem>
          <SelectItem value="highest">{t("reviews.filters.highest")}</SelectItem>
          <SelectItem value="lowest">{t("reviews.filters.lowest")}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={dateFilter} onValueChange={onDateFilterChange}>
        <SelectTrigger className="w-[140px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("reviews.filters.allTime")}</SelectItem>
          <SelectItem value="7d">{t("reviews.filters.last7Days")}</SelectItem>
          <SelectItem value="30d">{t("reviews.filters.last30Days")}</SelectItem>
          <SelectItem value="90d">{t("reviews.filters.last90Days")}</SelectItem>
          <SelectItem value="year">{t("reviews.filters.thisYear")}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={ratingFilter} onValueChange={onRatingFilterChange}>
        <SelectTrigger className="w-[140px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("reviews.filters.allRatings")}</SelectItem>
          <SelectItem value="5">{t("reviews.filters.stars", { count: 5 })}</SelectItem>
          <SelectItem value="4">{t("reviews.filters.stars", { count: 4 })}</SelectItem>
          <SelectItem value="3">{t("reviews.filters.stars", { count: 3 })}</SelectItem>
          <SelectItem value="2">{t("reviews.filters.stars", { count: 2 })}</SelectItem>
          <SelectItem value="1">{t("reviews.filters.oneStar")}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={territoryFilter} onValueChange={onTerritoryFilterChange}>
        <SelectTrigger className="w-[160px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("reviews.filters.allTerritories")}</SelectItem>
          {territories.map((t) => (
            <SelectItem key={t} value={t}>
              {territoryName(t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Switch
          id="hide-responded"
          checked={hideResponded}
          onCheckedChange={onHideRespondedChange}
        />
        <Label htmlFor="hide-responded" className="text-sm">
          {t("reviews.filters.hideResponded")}
        </Label>
      </div>
    </div>
  );
}
