import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { APP_VERSION } from "@/lib/version";
import { registerListApps } from "./tools/list-apps";
import { registerListVersions } from "./tools/list-versions";
import { registerUpdateListing } from "./tools/update-listing";
import { registerUpdateAppDetails } from "./tools/update-app-details";
import { registerUpdateReviewInfo } from "./tools/update-review-info";
import { registerTranslate } from "./tools/translate";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "itsyconnect",
    version: APP_VERSION,
  });

  registerListApps(server);
  registerListVersions(server);
  registerUpdateListing(server);
  registerUpdateAppDetails(server);
  registerUpdateReviewInfo(server);
  registerTranslate(server);

  return server;
}
