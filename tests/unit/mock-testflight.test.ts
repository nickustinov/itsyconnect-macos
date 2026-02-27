import { describe, it, expect } from "vitest";
import {
  MOCK_TF_BUILDS,
  MOCK_BETA_GROUPS,
  MOCK_BETA_TESTERS,
  MOCK_BETA_LOCALIZATIONS,
  MOCK_BETA_REVIEW_DETAIL,
  MOCK_FEEDBACK,
  getFeedbackItem,
  getTFBuild,
  getAppTFBuilds,
  getAppGroups,
  getGroup,
  getGroupTesters,
  getAppFeedback,
} from "@/lib/mock-testflight";

describe("mock-testflight", () => {
  describe("data shapes", () => {
    it("MOCK_TF_BUILDS has entries with required fields", () => {
      expect(MOCK_TF_BUILDS.length).toBeGreaterThan(0);
      for (const b of MOCK_TF_BUILDS) {
        expect(b).toHaveProperty("id");
        expect(b).toHaveProperty("appId");
        expect(b).toHaveProperty("buildNumber");
        expect(b).toHaveProperty("versionString");
        expect(b).toHaveProperty("platform");
        expect(b).toHaveProperty("status");
        expect(b).toHaveProperty("groupIds");
        expect(["IOS", "MAC_OS"]).toContain(b.platform);
      }
    });

    it("MOCK_BETA_GROUPS has entries with required fields", () => {
      expect(MOCK_BETA_GROUPS.length).toBeGreaterThan(0);
      for (const g of MOCK_BETA_GROUPS) {
        expect(g).toHaveProperty("id");
        expect(g).toHaveProperty("appId");
        expect(g).toHaveProperty("name");
        expect(g).toHaveProperty("type");
        expect(["Internal", "External"]).toContain(g.type);
      }
    });

    it("MOCK_BETA_TESTERS has entries with required fields", () => {
      expect(MOCK_BETA_TESTERS.length).toBeGreaterThan(0);
      for (const t of MOCK_BETA_TESTERS) {
        expect(t).toHaveProperty("id");
        expect(t).toHaveProperty("groupId");
        expect(t).toHaveProperty("firstName");
        expect(t).toHaveProperty("status");
        expect(["Installed", "Accepted", "Invited"]).toContain(t.status);
      }
    });

    it("MOCK_BETA_LOCALIZATIONS has entries with required fields", () => {
      expect(MOCK_BETA_LOCALIZATIONS.length).toBeGreaterThan(0);
      for (const l of MOCK_BETA_LOCALIZATIONS) {
        expect(l).toHaveProperty("locale");
        expect(l).toHaveProperty("description");
        expect(l).toHaveProperty("feedbackEmail");
      }
    });

    it("MOCK_BETA_REVIEW_DETAIL has required fields", () => {
      expect(MOCK_BETA_REVIEW_DETAIL).toHaveProperty("contactFirstName");
      expect(MOCK_BETA_REVIEW_DETAIL).toHaveProperty("contactEmail");
      expect(MOCK_BETA_REVIEW_DETAIL).toHaveProperty("reviewNotes");
      expect(typeof MOCK_BETA_REVIEW_DETAIL.signInRequired).toBe("boolean");
    });

    it("MOCK_FEEDBACK has entries with required fields", () => {
      expect(MOCK_FEEDBACK.length).toBeGreaterThan(0);
      for (const f of MOCK_FEEDBACK) {
        expect(f).toHaveProperty("id");
        expect(f).toHaveProperty("appId");
        expect(f).toHaveProperty("type");
        expect(["screenshot", "crash"]).toContain(f.type);
      }
    });
  });

  describe("getFeedbackItem", () => {
    it("returns feedback by ID", () => {
      const item = getFeedbackItem("fb-001");
      expect(item).toBeDefined();
      expect(item!.id).toBe("fb-001");
    });

    it("returns undefined for unknown ID", () => {
      expect(getFeedbackItem("nonexistent")).toBeUndefined();
    });
  });

  describe("getTFBuild", () => {
    it("returns build by ID", () => {
      const build = getTFBuild("tfb-001");
      expect(build).toBeDefined();
      expect(build!.id).toBe("tfb-001");
    });

    it("returns undefined for unknown ID", () => {
      expect(getTFBuild("nonexistent")).toBeUndefined();
    });
  });

  describe("getAppTFBuilds", () => {
    it("returns builds for app-001 sorted by uploadedDate descending", () => {
      const builds = getAppTFBuilds("app-001");
      expect(builds.length).toBeGreaterThan(0);
      for (let i = 1; i < builds.length; i++) {
        expect(
          new Date(builds[i - 1].uploadedDate).getTime(),
        ).toBeGreaterThanOrEqual(new Date(builds[i].uploadedDate).getTime());
      }
    });

    it("returns empty array for unknown app", () => {
      expect(getAppTFBuilds("nonexistent")).toEqual([]);
    });
  });

  describe("getAppGroups", () => {
    it("returns groups for app-001", () => {
      const groups = getAppGroups("app-001");
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups) {
        expect(g.appId).toBe("app-001");
      }
    });

    it("returns empty array for unknown app", () => {
      expect(getAppGroups("nonexistent")).toEqual([]);
    });
  });

  describe("getGroup", () => {
    it("returns group by ID", () => {
      const group = getGroup("grp-001");
      expect(group).toBeDefined();
      expect(group!.id).toBe("grp-001");
    });

    it("returns undefined for unknown ID", () => {
      expect(getGroup("nonexistent")).toBeUndefined();
    });
  });

  describe("getGroupTesters", () => {
    it("returns testers for grp-001", () => {
      const testers = getGroupTesters("grp-001");
      expect(testers.length).toBeGreaterThan(0);
      for (const t of testers) {
        expect(t.groupId).toBe("grp-001");
      }
    });

    it("returns empty array for unknown group", () => {
      expect(getGroupTesters("nonexistent")).toEqual([]);
    });
  });

  describe("getAppFeedback", () => {
    it("returns feedback for app-001 sorted by date descending", () => {
      const feedback = getAppFeedback("app-001");
      expect(feedback.length).toBeGreaterThan(0);
      for (let i = 1; i < feedback.length; i++) {
        expect(
          new Date(feedback[i - 1].date).getTime(),
        ).toBeGreaterThanOrEqual(new Date(feedback[i].date).getTime());
      }
    });

    it("returns empty array for unknown app", () => {
      expect(getAppFeedback("nonexistent")).toEqual([]);
    });
  });
});
