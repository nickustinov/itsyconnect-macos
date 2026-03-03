export interface AscBuild {
  id: string;
  attributes: {
    version: string; // build number
    uploadedDate: string;
    processingState: string;
    minOsVersion: string | null;
    iconAssetToken: { templateUrl: string } | null;
  };
}

export interface AscReviewDetail {
  id: string;
  attributes: {
    contactEmail: string | null;
    contactFirstName: string | null;
    contactLastName: string | null;
    contactPhone: string | null;
    demoAccountName: string | null;
    demoAccountPassword: string | null;
    demoAccountRequired: boolean;
    notes: string | null;
  };
}

export interface AscPhasedRelease {
  id: string;
  attributes: {
    phasedReleaseState: string;
    currentDayNumber: number | null;
    startDate: string | null;
  };
}

export interface AscVersion {
  id: string;
  attributes: {
    versionString: string;
    appVersionState: string;
    appStoreState: string;
    platform: string;
    copyright: string | null;
    releaseType: string | null;
    earliestReleaseDate: string | null;
    downloadable: boolean;
    createdDate: string;
    reviewType: string | null;
  };
  build: AscBuild | null;
  reviewDetail: AscReviewDetail | null;
  phasedRelease: AscPhasedRelease | null;
}

/** Get unique platforms from a list of versions. */
export function getVersionPlatforms(versions: AscVersion[]): string[] {
  return [...new Set(versions.map((v) => v.attributes.platform))];
}

/** Filter versions by platform. */
export function getVersionsByPlatform(
  versions: AscVersion[],
  platform: string,
): AscVersion[] {
  return versions.filter((v) => v.attributes.platform === platform);
}

export const EDITABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "REJECTED",
  "METADATA_REJECTED",
  "DEVELOPER_REJECTED",
]);

export const PLATFORM_LABELS: Record<string, string> = {
  IOS: "iOS",
  MAC_OS: "macOS",
  TV_OS: "tvOS",
  VISION_OS: "visionOS",
};

export const STATE_DOT_COLORS: Record<string, string> = {
  READY_FOR_SALE: "bg-green-500",
  READY_FOR_DISTRIBUTION: "bg-green-500",
  ACCEPTED: "bg-green-500",
  IN_REVIEW: "bg-blue-500",
  WAITING_FOR_REVIEW: "bg-amber-500",
  PENDING_DEVELOPER_RELEASE: "bg-amber-500",
  PREPARE_FOR_SUBMISSION: "bg-yellow-500",
  REJECTED: "bg-red-500",
  METADATA_REJECTED: "bg-red-500",
  DEVELOPER_REJECTED: "bg-red-500",
};

export function stateLabel(state: string): string {
  return state
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Validate a version string: 1–3 dot-separated integers (e.g. 1.0, 2.3.1). */
const VERSION_RE = /^\d+(\.\d+){0,2}$/;
export function isValidVersionString(s: string): boolean {
  return VERSION_RE.test(s);
}

/** Returns true when the string contains characters that can never form a valid version. */
const VERSION_CHARS_RE = /^[\d.]*$/;
export function hasInvalidVersionChars(s: string): boolean {
  return !VERSION_CHARS_RE.test(s);
}

/** Resolve a version by ID or fall back to the first editable / latest. */
export function resolveVersion(
  versions: AscVersion[],
  versionId: string | null,
): AscVersion | undefined {
  if (versionId) {
    const found = versions.find((v) => v.id === versionId);
    if (found) return found;
  }
  return (
    versions.find((v) => EDITABLE_STATES.has(v.attributes.appVersionState)) ??
    versions[0]
  );
}

// ── Pre-release versions (TestFlight) ────────────────────────────

export interface PreReleaseVersion {
  id: string;
  version: string;
  platform: string;
}

/** Get unique platforms from a list of pre-release versions. */
export function getPreReleasePlatforms(versions: PreReleaseVersion[]): string[] {
  return [...new Set(versions.map((v) => v.platform))];
}

/** Filter pre-release versions by platform. */
export function getPreReleasesByPlatform(
  versions: PreReleaseVersion[],
  platform: string,
): PreReleaseVersion[] {
  return versions.filter((v) => v.platform === platform);
}

/** Resolve a pre-release version by ID or fall back to the first. */
export function resolvePreReleaseVersion(
  versions: PreReleaseVersion[],
  versionId: string | null,
): PreReleaseVersion | undefined {
  if (versionId) {
    const found = versions.find((v) => v.id === versionId);
    if (found) return found;
  }
  return versions[0];
}
