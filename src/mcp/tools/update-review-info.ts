import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listVersions } from "@/lib/asc/versions";
import {
  updateReviewDetail,
  createReviewDetail,
  invalidateVersionsCache,
} from "@/lib/asc/review-mutations";
import { emitChange } from "@/mcp/events";

export function registerUpdateReviewInfo(server: McpServer): void {
  server.registerTool(
    "update_review_info",
    {
      title: "Update app review info",
      description:
        "Update App Store review submission details for a version. " +
        "Fields: notes, contactEmail, contactFirstName, contactLastName, " +
        "contactPhone, demoAccountName, demoAccountPassword, demoAccountRequired.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        versionId: z.string().describe("The app store version ID"),
        attributes: z.object({
          notes: z.string().max(4000).optional().describe("Notes for App Review"),
          contactEmail: z.string().optional().describe("Contact email"),
          contactFirstName: z.string().optional().describe("Contact first name"),
          contactLastName: z.string().optional().describe("Contact last name"),
          contactPhone: z.string().optional().describe("Contact phone"),
          demoAccountName: z.string().optional().describe("Demo account username"),
          demoAccountPassword: z.string().optional().describe("Demo account password"),
          demoAccountRequired: z.boolean().optional().describe("Whether sign-in is required"),
        }),
      }),
    },
    async ({ appId, versionId, attributes }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured." }],
        };
      }

      const versions = await listVersions(appId);
      const version = versions.find((v) => v.id === versionId);
      if (!version) {
        return {
          isError: true,
          content: [{ type: "text", text: `Version ${versionId} not found.` }],
        };
      }

      try {
        if (version.reviewDetail) {
          await updateReviewDetail(version.reviewDetail.id, attributes);
        } else {
          await createReviewDetail(versionId, attributes);
        }
        invalidateVersionsCache(appId);
        emitChange({ scope: "review", appId, versionId });

        const fields = Object.keys(attributes).join(", ");
        return {
          content: [{ type: "text", text: `Updated review info for ${version.attributes.versionString}: ${fields}` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  );
}
