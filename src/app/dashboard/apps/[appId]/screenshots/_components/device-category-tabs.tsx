"use client";

import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  displayTypeLabel,
  DISPLAY_TYPE_SIZES,
  DEVICE_CATEGORY_TYPES,
  type DeviceCategory,
} from "@/lib/asc/display-types";
import { useAscLabels } from "@/lib/i18n/use-asc-labels";

// ---------------------------------------------------------------------------
// Device category tab bar
// ---------------------------------------------------------------------------

export function DeviceCategoryTabs({
  categories,
  selected,
  onSelect,
}: {
  categories: DeviceCategory[];
  selected: DeviceCategory;
  onSelect: (cat: DeviceCategory) => void;
}) {
  const { deviceCategoryLabel } = useAscLabels();

  return (
    <div className="border-b">
      <nav className="-mb-px flex">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(cat)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              cat === selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {deviceCategoryLabel(cat)}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add variant button
// ---------------------------------------------------------------------------

export function AddVariantButton({
  category,
  existingTypes,
  onAdd,
}: {
  category: DeviceCategory;
  existingTypes: Set<string>;
  onAdd: (displayType: string) => void;
}) {
  const available = DEVICE_CATEGORY_TYPES[category].filter(
    (dt) => !existingTypes.has(dt),
  );

  if (available.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((dt) => (
        <Button
          key={dt}
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => onAdd(dt)}
        >
          <Plus size={12} />
          {displayTypeLabel(dt)}
          {DISPLAY_TYPE_SIZES[dt] && (
            <span className="text-muted-foreground">{DISPLAY_TYPE_SIZES[dt]}</span>
          )}
        </Button>
      ))}
    </div>
  );
}
