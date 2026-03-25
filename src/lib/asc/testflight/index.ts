export type {
  TFBuild,
  TFGroup,
  TFTester,
  TFBetaAppLocalization,
  TFBetaReviewDetail,
  TFBetaLicenseAgreement,
  TFBetaAppInfo,
  TFGroupDetail,
  TFFeedbackItem,
  TFScreenshotImage,
  TFDiagnosticType,
  TFDiagnosticSignature,
  TFDiagnosticLog,
  TFCallStackFrame,
  TFDiagnosticInsight,
} from "./types";

export {
  listBuilds,
  fetchBuildMetrics,
  updateBetaBuildLocalization,
  createBetaBuildLocalization,
  addBuildToGroups,
  removeBuildFromGroups,
  submitForBetaReview,
  expireBuild,
  declareExportCompliance,
  notifyTesters,
} from "./builds";
export { listGroups, getGroupDetail, fetchTesterMetrics, createGroup, deleteGroup } from "./groups";
export {
  listBuildIndividualTesters,
  listAppBetaTesters,
  addIndividualTestersToBuild,
  removeIndividualTestersFromBuild,
  addTestersToGroup,
  removeTestersFromGroup,
  createBetaTester,
  sendBetaTesterInvitations,
} from "./testers";
export {
  getBetaAppInfo,
  createBetaAppLocalization,
  deleteBetaAppLocalization,
  updateBetaAppLocalization,
  updateBetaAppReviewDetail,
  updateBetaLicenseAgreement,
} from "./info";
export { listFeedback, getFeedbackCrashLog, deleteFeedbackItem } from "./feedback";
export { listPreReleaseVersions } from "./pre-release-versions";
export { listDiagnosticSignatures, getDiagnosticLogs } from "./diagnostics";

// ── Cache invalidation (touches caches across domains) ───────────

import { cacheInvalidatePrefix } from "@/lib/cache";

export function invalidateTestFlightCache(appId: string): void {
  cacheInvalidatePrefix(`tf-builds:${appId}`);
  cacheInvalidatePrefix(`tf-groups:${appId}`);
  cacheInvalidatePrefix(`tf-info:${appId}`);
  cacheInvalidatePrefix(`tf-feedback:${appId}`);
  cacheInvalidatePrefix(`tf-pre-release-versions:${appId}`);
}
