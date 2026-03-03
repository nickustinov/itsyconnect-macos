import { ascFetch } from "./client";
import { cacheInvalidate } from "@/lib/cache";

export async function updateVersionAttributes(
  versionId: string,
  attributes: {
    versionString?: string;
    releaseType?: string;
    earliestReleaseDate?: string | null;
  },
): Promise<void> {
  await ascFetch(`/v1/appStoreVersions/${versionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appStoreVersions",
        id: versionId,
        attributes,
      },
    }),
  });
}

export async function enablePhasedRelease(versionId: string): Promise<void> {
  await ascFetch("/v1/appStoreVersionPhasedReleases", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionPhasedReleases",
        attributes: { phasedReleaseState: "INACTIVE" },
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    }),
  });
}

export async function disablePhasedRelease(
  phasedReleaseId: string,
): Promise<void> {
  await ascFetch(`/v1/appStoreVersionPhasedReleases/${phasedReleaseId}`, {
    method: "DELETE",
  });
}

export async function createVersion(
  appId: string,
  versionString: string,
  platform: string,
): Promise<string> {
  const res = await ascFetch<{ data: { id: string } }>("/v1/appStoreVersions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersions",
        attributes: { versionString, platform },
        relationships: {
          app: {
            data: { type: "apps", id: appId },
          },
        },
      },
    }),
  });

  cacheInvalidate(`versions:${appId}`);
  return res.data.id;
}

export async function deleteVersion(versionId: string): Promise<void> {
  await ascFetch(`/v1/appStoreVersions/${versionId}`, {
    method: "DELETE",
  });
}

export async function cancelSubmission(versionId: string): Promise<void> {
  const res = await ascFetch<{
    data: { id: string };
  }>(`/v1/appStoreVersions/${versionId}/appStoreVersionSubmission`);

  await ascFetch(`/v1/appStoreVersionSubmissions/${res.data.id}`, {
    method: "DELETE",
  });
}

export async function submitForReview(
  appId: string,
  versionId: string,
  platform: string,
): Promise<void> {
  // Step 1: create a review submission for the app
  const submission = await ascFetch<{ data: { id: string } }>(
    "/v1/reviewSubmissions",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "reviewSubmissions",
          attributes: { platform },
          relationships: {
            app: {
              data: { type: "apps", id: appId },
            },
          },
        },
      }),
    },
  );

  const submissionId = submission.data.id;

  try {
    // Step 2: add the version as a review submission item
    await ascFetch("/v1/reviewSubmissionItems", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: {
              data: { type: "reviewSubmissions", id: submissionId },
            },
            appStoreVersion: {
              data: { type: "appStoreVersions", id: versionId },
            },
          },
        },
      }),
    });

    // Step 3: confirm the submission
    await ascFetch(`/v1/reviewSubmissions/${submissionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "reviewSubmissions",
          id: submissionId,
          attributes: { submitted: true },
        },
      }),
    });
  } catch (err) {
    // Clean up the dangling draft submission so it doesn't block future attempts
    try {
      await ascFetch(`/v1/reviewSubmissions/${submissionId}`, {
        method: "DELETE",
      });
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

export async function releaseVersion(versionId: string): Promise<void> {
  await ascFetch("/v1/appStoreVersionReleaseRequests", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionReleaseRequests",
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    }),
  });
}

export async function selectBuildForVersion(
  versionId: string,
  buildId: string | null,
): Promise<void> {
  await ascFetch(`/v1/appStoreVersions/${versionId}/relationships/build`, {
    method: "PATCH",
    body: JSON.stringify({
      data: buildId ? { type: "builds", id: buildId } : null,
    }),
  });
}

export function invalidateVersionsCache(appId: string): void {
  cacheInvalidate(`versions:${appId}`);
}
