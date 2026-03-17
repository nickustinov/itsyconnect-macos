import { createServer, type Server } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server";
import { getMcpEnabled, getMcpPort } from "@/lib/mcp-preferences";

// Store on globalThis so the reference survives HMR in dev
const g = globalThis as unknown as { __mcpServer?: Server | null };

function getServer(): Server | null {
  return g.__mcpServer ?? null;
}

function setServer(s: Server | null) {
  g.__mcpServer = s;
}

export async function startMcpServer(port: number): Promise<void> {
  await stopMcpServer();

  const httpServer = createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method === "POST") {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } else if (req.method === "OPTIONS") {
      res.writeHead(204, {
        Allow: "POST, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
    } else {
      res.writeHead(405, { Allow: "POST" });
      res.end();
    }
  });

  setServer(httpServer);

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[mcp] Server listening on port ${port}`);
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[mcp] Port ${port} is already in use`);
    } else {
      console.error("[mcp] Server error:", err);
    }
    setServer(null);
  });
}

export function stopMcpServer(): Promise<void> {
  return new Promise((resolve) => {
    const server = getServer();
    if (!server) {
      resolve();
      return;
    }
    setServer(null);
    server.close(() => {
      console.log("[mcp] Server stopped");
      resolve();
    });
  });
}

export function isMcpRunning(): boolean {
  return getServer() !== null;
}

export function initMcpServer(): void {
  if (getMcpEnabled()) {
    startMcpServer(getMcpPort());
  }
}
