import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { APP_VERSION } from "@/lib/version";
import { registerGetApp } from "./tools/get-app";
import { registerUpdateApp } from "./tools/update-app";
import { registerTranslate } from "./tools/translate";
import { registerManageLocales } from "./tools/manage-locales";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "itsyconnect",
    version: APP_VERSION,
  });

  registerGetApp(server);
  registerUpdateApp(server);
  registerTranslate(server);
  registerManageLocales(server);

  return server;
}
