import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListNominations = vi.fn();
const mockCreateNomination = vi.fn();
const mockUpdateNomination = vi.fn();
const mockDeleteNomination = vi.fn();
const mockGetNomination = vi.fn();
const mockHasCredentials = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockErrorJson = vi.fn();
const mockIsDemoMode = vi.fn();

vi.mock("@/lib/asc/nominations", () => ({
  listNominations: (...args: unknown[]) => mockListNominations(...args),
  createNomination: (...args: unknown[]) => mockCreateNomination(...args),
  updateNomination: (...args: unknown[]) => mockUpdateNomination(...args),
  deleteNomination: (...args: unknown[]) => mockDeleteNomination(...args),
  getNomination: (...args: unknown[]) => mockGetNomination(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

function makeJsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("nominations routes", () => {
  beforeEach(() => {
    mockListNominations.mockReset();
    mockCreateNomination.mockReset();
    mockUpdateNomination.mockReset();
    mockDeleteNomination.mockReset();
    mockGetNomination.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockCacheGetMeta.mockReturnValue(null);
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 502 }),
    );
    mockIsDemoMode.mockReturnValue(false);
  });

  it("GET /api/nominations returns empty in demo mode", async () => {
    const { GET } = await import("@/app/api/nominations/route");

    mockIsDemoMode.mockReturnValue(true);

    const response = await GET(new Request("http://localhost/api/nominations"));
    const data = await response.json();

    expect(data).toEqual({ nominations: [], meta: null });
  });

  it("GET /api/nominations returns empty when no credentials", async () => {
    const { GET } = await import("@/app/api/nominations/route");

    mockHasCredentials.mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/nominations"));
    const data = await response.json();

    expect(data).toEqual({ nominations: [], meta: null });
  });

  it("GET /api/nominations returns errorJson when listNominations throws", async () => {
    const { GET } = await import("@/app/api/nominations/route");

    mockListNominations.mockRejectedValue(new Error("fetch failed"));

    await GET(new Request("http://localhost/api/nominations"));

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("GET /api/nominations forwards the refresh flag", async () => {
    const { GET } = await import("@/app/api/nominations/route");

    mockListNominations.mockResolvedValue([{ id: "nom-1" }]);
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 1 });

    const response = await GET(
      new Request("http://localhost/api/nominations?refresh=1"),
    );
    const data = await response.json();

    expect(mockListNominations).toHaveBeenCalledWith(true);
    expect(data).toEqual({
      nominations: [{ id: "nom-1" }],
      meta: { fetchedAt: 1 },
    });
  });

  it("POST /api/nominations returns ok in demo mode", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    mockIsDemoMode.mockReturnValue(true);

    const response = await POST(
      makeJsonRequest("http://localhost/api/nominations", {
        action: "create",
        name: "Test",
      }),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
  });

  it("POST /api/nominations returns error when no credentials", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    mockHasCredentials.mockReturnValue(false);

    const response = await POST(
      makeJsonRequest("http://localhost/api/nominations", {
        action: "create",
        name: "Test",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No ASC credentials");
  });

  it("POST /api/nominations returns errorJson when action throws", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    mockCreateNomination.mockRejectedValue(new Error("ASC error"));

    await POST(
      makeJsonRequest("http://localhost/api/nominations", {
        action: "create",
        name: "Feature launch",
        description: "Ship the new thing",
        type: "APP_LAUNCH",
        publishStartDate: "2026-03-13T00:00:00.000Z",
        submitted: false,
        relatedAppIds: ["app-1"],
      }),
    );

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("POST /api/nominations rejects invalid JSON", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    const response = await POST(
      new Request("http://localhost/api/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });

  it("POST /api/nominations validates create payloads", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    const response = await POST(
      makeJsonRequest("http://localhost/api/nominations", {
        action: "create",
        name: "",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });

  it("POST /api/nominations creates nominations", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    mockCreateNomination.mockResolvedValue("nom-new");

    const response = await POST(
      makeJsonRequest("http://localhost/api/nominations", {
        action: "create",
        name: "Feature launch",
        description: "Ship the new thing",
        type: "APP_LAUNCH",
        publishStartDate: "2026-03-13T00:00:00.000Z",
        submitted: false,
        relatedAppIds: ["app-1"],
      }),
    );
    const data = await response.json();

    expect(mockCreateNomination).toHaveBeenCalledWith({
      name: "Feature launch",
      description: "Ship the new thing",
      type: "APP_LAUNCH",
      publishStartDate: "2026-03-13T00:00:00.000Z",
      submitted: false,
      relatedAppIds: ["app-1"],
    });
    expect(data).toEqual({ ok: true, id: "nom-new" });
  });

  it("POST /api/nominations updates nominations", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    const response = await POST(
      makeJsonRequest("http://localhost/api/nominations", {
        action: "update",
        id: "nom-1",
        attributes: { notes: "Updated" },
      }),
    );
    const data = await response.json();

    expect(mockUpdateNomination).toHaveBeenCalledWith("nom-1", {
      notes: "Updated",
    });
    expect(data).toEqual({ ok: true });
  });

  it("POST /api/nominations deletes nominations", async () => {
    const { POST } = await import("@/app/api/nominations/route");

    const response = await POST(
      makeJsonRequest("http://localhost/api/nominations", {
        action: "delete",
        id: "nom-1",
      }),
    );
    const data = await response.json();

    expect(mockDeleteNomination).toHaveBeenCalledWith("nom-1");
    expect(data).toEqual({ ok: true });
  });

  it("GET /api/nominations/[nominationId] returns a nomination", async () => {
    const { GET } = await import("@/app/api/nominations/[nominationId]/route");

    mockGetNomination.mockResolvedValue({ id: "nom-2" });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ nominationId: "nom-2" }),
    });
    const data = await response.json();

    expect(mockGetNomination).toHaveBeenCalledWith("nom-2");
    expect(data).toEqual({ nomination: { id: "nom-2" } });
  });

  it("GET /api/nominations/[nominationId] returns error when no credentials", async () => {
    const { GET } = await import("@/app/api/nominations/[nominationId]/route");

    mockHasCredentials.mockReturnValue(false);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ nominationId: "nom-2" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No ASC credentials");
  });

  it("GET /api/nominations/[nominationId] returns errorJson when getNomination throws", async () => {
    const { GET } = await import("@/app/api/nominations/[nominationId]/route");

    mockGetNomination.mockRejectedValue(new Error("not found"));

    await GET(new Request("http://localhost"), {
      params: Promise.resolve({ nominationId: "nom-bad" }),
    });

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("GET /api/nominations/[nominationId] rejects demo mode", async () => {
    const { GET } = await import("@/app/api/nominations/[nominationId]/route");

    mockIsDemoMode.mockReturnValue(true);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ nominationId: "nom-2" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Not available in demo mode");
  });
});
