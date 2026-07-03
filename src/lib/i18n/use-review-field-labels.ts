"use client";

import { useCallback } from "react";
import { useTranslations } from "@/lib/i18n/locale-context";

export function useReviewFieldLabel() {
  const t = useTranslations();

  return useCallback(
    (field: string) => {
      switch (field) {
        case "description":
          return t("storeListing.fields.description");
        case "keywords":
          return t("storeListing.fields.keywords");
        case "whatsNew":
          return t("storeListing.fields.whatsNew");
        case "promotionalText":
          return t("storeListing.fields.promotionalText");
        case "supportUrl":
          return t("storeListing.fields.supportUrl");
        case "marketingUrl":
          return t("storeListing.fields.marketingUrl");
        case "name":
          return t("appDetails.name");
        case "subtitle":
          return t("appDetails.subtitle");
        case "privacyPolicyUrl":
          return t("appDetails.privacyPolicyUrl");
        case "privacyChoicesUrl":
          return t("appDetails.privacyChoicesUrl");
        case "copyright":
          return t("storeListing.copyright");
        case "releaseType":
          return t("reviewChanges.fields.releaseType");
        case "scheduledDate":
          return t("reviewChanges.fields.scheduledDate");
        case "phasedRelease":
          return t("storeListing.release.phasedRollout");
        case "buildId":
          return t("reviewChanges.fields.buildId");
        case "contentRights":
          return t("appDetails.contentRights");
        case "primaryCategoryId":
          return t("reviewChanges.fields.primaryCategoryId");
        case "secondaryCategoryId":
          return t("reviewChanges.fields.secondaryCategoryId");
        case "notifUrl":
          return t("reviewChanges.fields.notifUrl");
        case "notifSandboxUrl":
          return t("reviewChanges.fields.notifSandboxUrl");
        case "notes":
          return t("reviewChanges.fields.notes");
        case "demoAccountRequired":
          return t("appReview.signInRequired");
        case "demoAccountName":
          return t("reviewChanges.fields.demoAccountName");
        case "demoAccountPassword":
          return t("reviewChanges.fields.demoAccountPassword");
        case "contactFirstName":
          return t("appReview.firstName");
        case "contactLastName":
          return t("appReview.lastName");
        case "contactPhone":
          return t("appReview.phone");
        case "contactEmail":
          return t("appReview.email");
        default:
          return field;
      }
    },
    [t],
  );
}

export function useReviewSectionLabels() {
  const t = useTranslations();

  return {
    "store-listing": t("nav.items.storeListing"),
    details: t("nav.items.appDetails"),
    keywords: t("nav.items.keywords"),
    review: t("nav.items.appReview"),
  } as const;
}
