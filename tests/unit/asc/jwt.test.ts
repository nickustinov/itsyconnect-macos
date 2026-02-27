import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { generateAscJwt } from "@/lib/asc/jwt";

describe("generateAscJwt", () => {
  let privateKeyPem: string;
  let publicKey: ReturnType<typeof createPublicKey>;

  beforeAll(() => {
    const pair = generateKeyPairSync("ec", {
      namedCurve: "P-256",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    privateKeyPem = pair.privateKey;
    publicKey = createPublicKey(pair.publicKey);
  });

  it("returns a three-part JWT string", () => {
    const jwt = generateAscJwt("issuer-1", "KEY123", privateKeyPem);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    // Each part should be non-empty base64url
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it("header has correct algorithm, key ID, and type", () => {
    const jwt = generateAscJwt("issuer-1", "KEY123", privateKeyPem);
    const header = JSON.parse(
      Buffer.from(jwt.split(".")[0], "base64url").toString(),
    );
    expect(header).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
  });

  it("payload has correct issuer, audience, and timestamps", () => {
    const before = Math.floor(Date.now() / 1000);
    const jwt = generateAscJwt("issuer-1", "KEY123", privateKeyPem);
    const after = Math.floor(Date.now() / 1000);

    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString(),
    );
    expect(payload.iss).toBe("issuer-1");
    expect(payload.aud).toBe("appstoreconnect-v1");
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(payload.exp).toBe(payload.iat + 15 * 60);
  });

  it("signature is verifiable with the public key", () => {
    const jwt = generateAscJwt("issuer-1", "KEY123", privateKeyPem);
    const [headerB64, payloadB64, signatureB64] = jwt.split(".");
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, "base64url");

    const valid = verify(
      "SHA256",
      Buffer.from(signingInput),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
    expect(valid).toBe(true);
  });

  it("throws for invalid private key", () => {
    expect(() =>
      generateAscJwt("issuer-1", "KEY123", "not-a-valid-key"),
    ).toThrow();
  });
});
