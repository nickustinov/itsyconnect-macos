import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: mockGet,
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  ascCredentials: {
    isActive: "isActive",
    isDemo: "isDemo",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => args,
}));

import {
  isDemoMode,
  getDemoApps,
  getDemoAnalytics,
  getDemoVersions,
  getDemoReviews,
  getDemoBuilds,
  getDemoGroups,
  getDemoPreReleaseVersions,
  getDemoTFInfo,
  getDemoAppInfos,
  getDemoAppInfoLocalizations,
  getDemoVersionLocalizations,
  getDemoBuildDetail,
  getDemoGroupDetail,
  DEMO_APPS,
} from "@/lib/demo";

const APP_IDS = [
  "demo-app-weatherly",
  "demo-app-trackfit",
  "demo-app-notepad",
] as const;

describe("demo", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  // -------------------------------------------------------------------------
  // isDemoMode
  // -------------------------------------------------------------------------

  describe("isDemoMode", () => {
    it("returns true when an active demo credential exists", () => {
      mockGet.mockReturnValue({ isDemo: true });
      expect(isDemoMode()).toBe(true);
    });

    it("returns false when no active demo credential exists", () => {
      mockGet.mockReturnValue(undefined);
      expect(isDemoMode()).toBe(false);
    });

    it("returns false when the query returns null", () => {
      mockGet.mockReturnValue(null);
      expect(isDemoMode()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDemoApps
  // -------------------------------------------------------------------------

  describe("getDemoApps", () => {
    it("returns the DEMO_APPS array", () => {
      const apps = getDemoApps();
      expect(apps).toBe(DEMO_APPS);
    });

    it("contains exactly three apps", () => {
      expect(getDemoApps()).toHaveLength(3);
    });

    it("returns apps with the expected IDs", () => {
      const ids = getDemoApps().map((a) => a.id);
      expect(ids).toEqual([...APP_IDS]);
    });

    it("each app has required attributes", () => {
      for (const app of getDemoApps()) {
        expect(app.attributes).toHaveProperty("name");
        expect(app.attributes).toHaveProperty("bundleId");
        expect(app.attributes).toHaveProperty("sku");
        expect(app.attributes).toHaveProperty("primaryLocale", "en-US");
        expect(app.attributes.iconUrl).toMatch(/^demo:/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getDemoAnalytics
  // -------------------------------------------------------------------------

  describe("getDemoAnalytics", () => {
    it.each(APP_IDS)("returns analytics for %s", (appId) => {
      const analytics = getDemoAnalytics(appId);
      expect(analytics).not.toBeNull();
      expect(analytics!.dailyDownloads).toHaveLength(30);
      expect(analytics!.dailyRevenue).toHaveLength(30);
      expect(analytics!.dailyEngagement).toHaveLength(30);
      expect(analytics!.dailySessions).toHaveLength(30);
      expect(analytics!.dailyInstallsDeletes).toHaveLength(30);
      expect(analytics!.dailyDownloadsBySource).toHaveLength(30);
      expect(analytics!.dailyVersionSessions).toHaveLength(30);
      expect(analytics!.dailyOptIn).toHaveLength(30);
      expect(analytics!.dailyWebPreview).toHaveLength(30);
      expect(analytics!.dailyTerritoryDownloads.length).toBeGreaterThan(30);
      expect(analytics!.dailyTerritoryRevenue.length).toBeGreaterThan(30);
      expect(analytics!.dailyCrashes).toHaveLength(30);
      expect(analytics!.dailyDownloadsBySource.some((d) => d.appReferrer > 0)).toBe(true);
      expect(analytics!.crashesByVersion.length).toBeGreaterThan(0);
      expect(analytics!.crashesByDevice.length).toBeGreaterThan(0);
      expect(analytics!.perfMetrics).toEqual([]);
      expect(analytics!.perfRegressions).toEqual([]);
    });

    it("returns null for an unknown app ID", () => {
      expect(getDemoAnalytics("unknown-app")).toBeNull();
    });

    it("returns deterministic data across calls", () => {
      const first = getDemoAnalytics(APP_IDS[0]);
      const second = getDemoAnalytics(APP_IDS[0]);
      expect(first).toBe(second);
    });

    it("daily downloads have expected shape", () => {
      const analytics = getDemoAnalytics(APP_IDS[0])!;
      const day = analytics.dailyDownloads[0];
      expect(day).toHaveProperty("date");
      expect(day).toHaveProperty("firstTime");
      expect(day).toHaveProperty("redownload");
      expect(day).toHaveProperty("update");
      expect(typeof day.date).toBe("string");
      expect(typeof day.firstTime).toBe("number");
    });
  });

  // -------------------------------------------------------------------------
  // getDemoVersions
  // -------------------------------------------------------------------------

  describe("getDemoVersions", () => {
    it.each(APP_IDS)("returns versions for %s", (appId) => {
      const versions = getDemoVersions(appId);
      expect(versions).toHaveLength(3);
      for (const v of versions) {
        expect(v).toHaveProperty("id");
        expect(v).toHaveProperty("attributes");
        expect(v).toHaveProperty("build");
        expect(v.attributes.platform).toBe("IOS");
      }
    });

    it("returns empty array for unknown app ID", () => {
      expect(getDemoVersions("unknown")).toEqual([]);
    });

    it("Weatherly has READY_FOR_SALE as first version state", () => {
      const versions = getDemoVersions("demo-app-weatherly");
      expect(versions[0].attributes.appStoreState).toBe("READY_FOR_SALE");
    });

    it("TrackFit has WAITING_FOR_REVIEW as first version state", () => {
      const versions = getDemoVersions("demo-app-trackfit");
      expect(versions[0].attributes.appStoreState).toBe("WAITING_FOR_REVIEW");
    });

    it("each version has a build with a valid build number", () => {
      const versions = getDemoVersions(APP_IDS[0]);
      for (const v of versions) {
        expect(v.build.attributes.version).toMatch(/^\d+$/);
        expect(v.build.attributes.processingState).toBe("VALID");
      }
    });
  });

  // -------------------------------------------------------------------------
  // getDemoReviews
  // -------------------------------------------------------------------------

  describe("getDemoReviews", () => {
    it.each(APP_IDS)("returns reviews for %s", (appId) => {
      const reviews = getDemoReviews(appId);
      expect(reviews).toHaveLength(5);
      for (const r of reviews) {
        expect(r).toHaveProperty("id");
        expect(r.attributes).toHaveProperty("rating");
        expect(r.attributes).toHaveProperty("title");
        expect(r.attributes).toHaveProperty("body");
        expect(r.attributes).toHaveProperty("reviewerNickname");
        expect(r.attributes).toHaveProperty("createdDate");
        expect(r.attributes).toHaveProperty("territory");
        expect(r.attributes.rating).toBeGreaterThanOrEqual(1);
        expect(r.attributes.rating).toBeLessThanOrEqual(5);
      }
    });

    it("returns empty array for unknown app ID", () => {
      expect(getDemoReviews("unknown")).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getDemoBuilds
  // -------------------------------------------------------------------------

  describe("getDemoBuilds", () => {
    it.each(APP_IDS)("returns builds for %s", (appId) => {
      const builds = getDemoBuilds(appId);
      expect(builds).toHaveLength(3);
      for (const b of builds) {
        expect(b).toHaveProperty("id");
        expect(b).toHaveProperty("buildNumber");
        expect(b).toHaveProperty("versionString");
        expect(b).toHaveProperty("platform", "IOS");
        expect(b).toHaveProperty("groupIds");
        expect(Array.isArray(b.groupIds)).toBe(true);
      }
    });

    it("returns empty array for unknown app ID", () => {
      expect(getDemoBuilds("unknown")).toEqual([]);
    });

    it("the third build is expired", () => {
      const builds = getDemoBuilds(APP_IDS[0]);
      expect(builds[2].expired).toBe(true);
      expect(builds[2].externalBuildState).toBe("EXPIRED");
    });

    it("the first build is assigned to two groups", () => {
      const builds = getDemoBuilds(APP_IDS[0]);
      expect(builds[0].groupIds).toHaveLength(2);
    });

    it("the last build has no groups", () => {
      const builds = getDemoBuilds(APP_IDS[0]);
      expect(builds[2].groupIds).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getDemoGroups
  // -------------------------------------------------------------------------

  describe("getDemoGroups", () => {
    it.each(APP_IDS)("returns groups for %s", (appId) => {
      const groups = getDemoGroups(appId);
      expect(groups).toHaveLength(2);
      expect(groups[0].isInternal).toBe(true);
      expect(groups[1].isInternal).toBe(false);
    });

    it("returns empty array for unknown app ID", () => {
      expect(getDemoGroups("unknown")).toEqual([]);
    });

    it("external group has a public link", () => {
      const groups = getDemoGroups(APP_IDS[0]);
      const external = groups[1];
      expect(external.publicLinkEnabled).toBe(true);
      expect(external.publicLink).toMatch(/^https:\/\/testflight\.apple\.com/);
      expect(external.publicLinkLimit).toBe(100);
    });

    it("internal group has no public link", () => {
      const groups = getDemoGroups(APP_IDS[0]);
      expect(groups[0].publicLink).toBeNull();
      expect(groups[0].publicLinkEnabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDemoPreReleaseVersions
  // -------------------------------------------------------------------------

  describe("getDemoPreReleaseVersions", () => {
    it.each(APP_IDS)("returns pre-release versions for %s", (appId) => {
      const prvs = getDemoPreReleaseVersions(appId);
      expect(prvs).toHaveLength(3);
      for (const p of prvs) {
        expect(p).toHaveProperty("id");
        expect(p).toHaveProperty("version");
        expect(p.platform).toBe("IOS");
      }
    });

    it("returns empty array for unknown app ID", () => {
      expect(getDemoPreReleaseVersions("unknown")).toEqual([]);
    });

    it("version strings match expected values", () => {
      const prvs = getDemoPreReleaseVersions(APP_IDS[0]);
      expect(prvs.map((p) => p.version)).toEqual(["2.3.0", "2.2.0", "2.1.0"]);
    });
  });

  // -------------------------------------------------------------------------
  // getDemoTFInfo
  // -------------------------------------------------------------------------

  describe("getDemoTFInfo", () => {
    it.each(APP_IDS)("returns TestFlight info for %s", (appId) => {
      const info = getDemoTFInfo(appId);
      expect(info).not.toBeNull();
      expect(info!.app.id).toBe(appId);
      expect(info!.localizations).toHaveLength(1);
      expect(info!.localizations[0].locale).toBe("en-US");
      expect(info!.reviewDetail).toHaveProperty("contactEmail");
      expect(info!.licenseAgreement).toHaveProperty("id");
    });

    it("returns null for unknown app ID", () => {
      expect(getDemoTFInfo("unknown")).toBeNull();
    });

    it("review detail has expected contact info", () => {
      const info = getDemoTFInfo(APP_IDS[0])!;
      expect(info.reviewDetail.contactFirstName).toBe("Jane");
      expect(info.reviewDetail.contactLastName).toBe("Developer");
      expect(info.reviewDetail.demoAccountRequired).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDemoAppInfos
  // -------------------------------------------------------------------------

  describe("getDemoAppInfos", () => {
    it.each(APP_IDS)("returns app infos for %s", (appId) => {
      const infos = getDemoAppInfos(appId);
      expect(infos).toHaveLength(1);
      expect(infos[0]).toHaveProperty("id");
      expect(infos[0].attributes.appStoreState).toBe("READY_FOR_DISTRIBUTION");
      expect(infos[0].primaryCategory).toHaveProperty("id");
    });

    it("returns empty array for unknown app ID", () => {
      expect(getDemoAppInfos("unknown")).toEqual([]);
    });

    it("Weatherly has WEATHER category", () => {
      const infos = getDemoAppInfos("demo-app-weatherly");
      expect(infos[0].primaryCategory.id).toBe("WEATHER");
    });

    it("TrackFit has HEALTH_AND_FITNESS category", () => {
      const infos = getDemoAppInfos("demo-app-trackfit");
      expect(infos[0].primaryCategory.id).toBe("HEALTH_AND_FITNESS");
    });

    it("Notepad has PRODUCTIVITY category", () => {
      const infos = getDemoAppInfos("demo-app-notepad");
      expect(infos[0].primaryCategory.id).toBe("PRODUCTIVITY");
    });
  });

  // -------------------------------------------------------------------------
  // getDemoAppInfoLocalizations
  // -------------------------------------------------------------------------

  describe("getDemoAppInfoLocalizations", () => {
    it.each([0, 1, 2])("returns localizations for demo-appinfo-%i", (index) => {
      const locs = getDemoAppInfoLocalizations(`demo-appinfo-${index}`);
      expect(locs).toHaveLength(1);
      expect(locs[0].attributes.locale).toBe("en-US");
      expect(locs[0].attributes).toHaveProperty("name");
      expect(locs[0].attributes).toHaveProperty("subtitle");
      expect(locs[0].attributes).toHaveProperty("privacyPolicyUrl");
    });

    it("returns empty array for unknown app info ID", () => {
      expect(getDemoAppInfoLocalizations("unknown")).toEqual([]);
    });

    it("Weatherly localization has correct name and subtitle", () => {
      const locs = getDemoAppInfoLocalizations("demo-appinfo-0");
      expect(locs[0].attributes.name).toBe("Weatherly");
      expect(locs[0].attributes.subtitle).toBe("Your weather companion");
    });

    it("TrackFit localization has correct name", () => {
      const locs = getDemoAppInfoLocalizations("demo-appinfo-1");
      expect(locs[0].attributes.name).toBe("TrackFit");
    });

    it("Notepad localization has correct name", () => {
      const locs = getDemoAppInfoLocalizations("demo-appinfo-2");
      expect(locs[0].attributes.name).toBe("Notepad Pro");
    });
  });

  // -------------------------------------------------------------------------
  // getDemoVersionLocalizations
  // -------------------------------------------------------------------------

  describe("getDemoVersionLocalizations", () => {
    it("returns localizations for a known version ID", () => {
      const locs = getDemoVersionLocalizations("demo-version-0-0");
      expect(locs).toHaveLength(1);
      expect(locs[0].attributes.locale).toBe("en-US");
      expect(locs[0].attributes).toHaveProperty("description");
      expect(locs[0].attributes).toHaveProperty("keywords");
    });

    it("returns empty array for unknown version ID", () => {
      expect(getDemoVersionLocalizations("unknown")).toEqual([]);
    });

    it("covers all 9 app/version combinations", () => {
      for (let app = 0; app < 3; app++) {
        for (let ver = 0; ver < 3; ver++) {
          const locs = getDemoVersionLocalizations(`demo-version-${app}-${ver}`);
          expect(locs).toHaveLength(1);
        }
      }
    });

    it("first version of each app has promotional text", () => {
      for (let app = 0; app < 3; app++) {
        const locs = getDemoVersionLocalizations(`demo-version-${app}-0`);
        expect(locs[0].attributes.promotionalText).not.toBeNull();
      }
    });

    it("non-first versions have null promotional text", () => {
      const locs = getDemoVersionLocalizations("demo-version-0-1");
      expect(locs[0].attributes.promotionalText).toBeNull();
    });

    it("third version has null whatsNew", () => {
      const locs = getDemoVersionLocalizations("demo-version-0-2");
      expect(locs[0].attributes.whatsNew).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getDemoBuildDetail
  // -------------------------------------------------------------------------

  describe("getDemoBuildDetail", () => {
    it("returns a specific build by ID", () => {
      const build = getDemoBuildDetail("demo-app-weatherly", "demo-tf-build-0-0");
      expect(build).not.toBeNull();
      expect(build!.id).toBe("demo-tf-build-0-0");
      expect(build!.versionString).toBe("2.3.0");
    });

    it("returns null for unknown build ID", () => {
      expect(getDemoBuildDetail("demo-app-weatherly", "nonexistent")).toBeNull();
    });

    it("returns null for unknown app ID", () => {
      expect(getDemoBuildDetail("unknown", "demo-tf-build-0-0")).toBeNull();
    });

    it("can find each build for each app", () => {
      for (let app = 0; app < 3; app++) {
        for (let build = 0; build < 3; build++) {
          const result = getDemoBuildDetail(APP_IDS[app], `demo-tf-build-${app}-${build}`);
          expect(result).not.toBeNull();
          expect(result!.id).toBe(`demo-tf-build-${app}-${build}`);
        }
      }
    });

    it("does not find a build from a different app", () => {
      expect(getDemoBuildDetail("demo-app-weatherly", "demo-tf-build-1-0")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getDemoGroupDetail
  // -------------------------------------------------------------------------

  describe("getDemoGroupDetail", () => {
    it("returns group detail with group, builds, and testers", () => {
      const detail = getDemoGroupDetail("demo-app-weatherly", "demo-group-0-0");
      expect(detail).not.toBeNull();
      expect(detail!.group.id).toBe("demo-group-0-0");
      expect(detail!.group.isInternal).toBe(true);
      expect(detail!.builds.length).toBeGreaterThan(0);
      expect(detail!.testers.length).toBeGreaterThan(0);
    });

    it("returns null for unknown group ID", () => {
      expect(getDemoGroupDetail("demo-app-weatherly", "nonexistent")).toBeNull();
    });

    it("returns null for unknown app ID", () => {
      expect(getDemoGroupDetail("unknown", "demo-group-0-0")).toBeNull();
    });

    it("internal group returns 5 testers", () => {
      const detail = getDemoGroupDetail("demo-app-weatherly", "demo-group-0-0");
      expect(detail!.testers).toHaveLength(5);
    });

    it("external group returns 4 testers", () => {
      const detail = getDemoGroupDetail("demo-app-weatherly", "demo-group-0-1");
      expect(detail!.testers).toHaveLength(4);
    });

    it("internal group has builds assigned to it", () => {
      const detail = getDemoGroupDetail("demo-app-weatherly", "demo-group-0-0");
      // The internal group (index 0) should be referenced by builds 0 and 1
      expect(detail!.builds.length).toBe(2);
      for (const b of detail!.builds) {
        expect(b.groupIds).toContain("demo-group-0-0");
      }
    });

    it("external group has only its assigned builds", () => {
      const detail = getDemoGroupDetail("demo-app-weatherly", "demo-group-0-1");
      // The external group (index 1) is only referenced by build 0
      expect(detail!.builds.length).toBe(1);
      expect(detail!.builds[0].groupIds).toContain("demo-group-0-1");
    });

    it("testers have expected properties", () => {
      const detail = getDemoGroupDetail("demo-app-weatherly", "demo-group-0-0");
      for (const t of detail!.testers) {
        expect(t).toHaveProperty("id");
        expect(t).toHaveProperty("firstName");
        expect(t).toHaveProperty("lastName");
        expect(t).toHaveProperty("email");
        expect(t).toHaveProperty("inviteType");
        expect(t).toHaveProperty("state");
        expect(t).toHaveProperty("sessions");
        expect(t).toHaveProperty("crashes");
        expect(t).toHaveProperty("feedbackCount");
      }
    });
  });
});
