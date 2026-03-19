import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetMcpEnabled = vi.fn();
const mockSetMcpEnabled = vi.fn();
const mockGetMcpPort = vi.fn();
const mockSetMcpPort = vi.fn();
const mockStartMcpServer = vi.fn();
const mockStopMcpServer = vi.fn();
const mockIsMcpRunning = vi.fn();

vi.mock("@/lib/mcp-preferences", () => ({
  getMcpEnabled: () => mockGetMcpEnabled(),
  setMcpEnabled: (...args: unknown[]) => mockSetMcpEnabled(...args),
  getMcpPort: () => mockGetMcpPort(),
  setMcpPort: (...args: unknown[]) => mockSetMcpPort(...args),
}));

vi.mock("@/mcp", () => ({
  startMcpServer: (...args: unknown[]) => mockStartMcpServer(...args),
  stopMcpServer: () => mockStopMcpServer(),
  isMcpRunning: () => mockIsMcpRunning(),
}));

vi.mock("@/lib/api-helpers", () => ({
  parseBody: async (request: Request, schema: { parse: (v: unknown) => unknown }) => {
    const body = await request.json();
    try {
      return schema.parse(body);
    } catch {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
  },
}));

vi.mock("@/mcp/events", async () => {
  const { EventEmitter } = await import("node:events");
  const emitter = new EventEmitter();
  return {
    mcpEvents: emitter,
  };
});

describe("MCP settings route", () => {
  beforeEach(() => {
    mockGetMcpEnabled.mockReset();
    mockSetMcpEnabled.mockReset();
    mockGetMcpPort.mockReset();
    mockSetMcpPort.mockReset();
    mockStartMcpServer.mockReset();
    mockStopMcpServer.mockReset();
    mockIsMcpRunning.mockReset();
    mockStartMcpServer.mockResolvedValue(undefined);
    mockGetMcpPort.mockReturnValue(3100);
    vi.resetModules();
  });

  it("GET returns MCP settings", async () => {
    mockGetMcpEnabled.mockReturnValue(true);
    mockGetMcpPort.mockReturnValue(4200);
    mockIsMcpRunning.mockReturnValue(true);

    const { GET } = await import("@/app/api/settings/mcp/route");
    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ enabled: true, port: 4200, running: true });
  });

  it("PUT enables MCP and starts server", async () => {
    mockGetMcpEnabled.mockReturnValue(true);
    mockGetMcpPort.mockReturnValue(3100);
    mockIsMcpRunning.mockReturnValue(true);

    const { PUT } = await import("@/app/api/settings/mcp/route");
    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSetMcpEnabled).toHaveBeenCalledWith(true);
    expect(mockStopMcpServer).toHaveBeenCalled();
    expect(mockStartMcpServer).toHaveBeenCalledWith(3100);
  });

  it("PUT disables MCP and stops server", async () => {
    mockGetMcpEnabled.mockReturnValue(false);
    mockGetMcpPort.mockReturnValue(3100);
    mockIsMcpRunning.mockReturnValue(false);

    const { PUT } = await import("@/app/api/settings/mcp/route");
    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSetMcpEnabled).toHaveBeenCalledWith(false);
    expect(mockStopMcpServer).toHaveBeenCalled();
    expect(mockStartMcpServer).not.toHaveBeenCalled();
  });

  it("PUT updates port", async () => {
    mockGetMcpEnabled.mockReturnValue(true);
    mockGetMcpPort.mockReturnValue(5000);
    mockIsMcpRunning.mockReturnValue(false);

    const { PUT } = await import("@/app/api/settings/mcp/route");
    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: 5000 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSetMcpPort).toHaveBeenCalledWith(5000);
  });

  it("PUT restarts server when port changes while running", async () => {
    mockGetMcpEnabled.mockReturnValue(true);
    mockGetMcpPort.mockReturnValue(5000);
    mockIsMcpRunning.mockReturnValue(true);

    const { PUT } = await import("@/app/api/settings/mcp/route");
    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: 5000 }),
      }),
    );

    expect(mockStopMcpServer).toHaveBeenCalled();
    expect(mockStartMcpServer).toHaveBeenCalledWith(5000);
  });

  it("PUT with enabled and port uses the new port", async () => {
    mockGetMcpEnabled.mockReturnValue(true);
    mockGetMcpPort.mockReturnValue(5000);
    mockIsMcpRunning.mockReturnValue(true);

    const { PUT } = await import("@/app/api/settings/mcp/route");
    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, port: 5000 }),
      }),
    );

    expect(mockStartMcpServer).toHaveBeenCalledWith(5000);
  });
});

describe("MCP events route", () => {
  it("GET returns an SSE stream", async () => {
    const { GET } = await import("@/app/api/mcp/events/route");
    const response = await GET();

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");

    // Read the initial ": connected" message
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain(": connected");

    reader.cancel();
  });
});
