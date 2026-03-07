/**
 * Explore ASC Customer Review Summarizations for Itsyhome.
 * Hits the v1 endpoint added in ASC API 3.6 to see what Apple returns.
 *
 * Run: npx tsx scripts/explore-review-summaries.ts
 */

import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (no dotenv dependency)
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const KEY_PATH = requireEnv("ASC_KEY_PATH");
const KEY_ID = requireEnv("ASC_KEY_ID");
const ISSUER_ID = requireEnv("ASC_ISSUER_ID");
const BASE = "https://api.appstoreconnect.apple.com";

const OUT_DIR = path.join(__dirname, "output");

// --- Helpers ---

async function makeToken(): Promise<string> {
  const keyPem = fs.readFileSync(KEY_PATH, "utf-8");
  const key = await jose.importPKCS8(keyPem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: KEY_ID, typ: "JWT" })
    .setIssuer(ISSUER_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60)
    .setAudience("appstoreconnect-v1")
    .sign(key);
}

let requestCount = 0;

async function get(token: string, urlPath: string, params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = `${BASE}${urlPath}${qs}`;
  requestCount++;
  console.log(`  [${requestCount}] GET ${urlPath}${qs}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  HTTP ${res.status}: ${text.slice(0, 500)}`);
    return null;
  }
  return res.json();
}

function save(filename: string, data: any) {
  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  const items = Array.isArray(data?.data) ? data.data.length : data?.data ? 1 : 0;
  const included = data?.included?.length ?? 0;
  console.log(`  -> ${filename} (${items} items${included ? `, ${included} included` : ""})\n`);
}

// --- Main ---

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const token = await makeToken();
  console.log("Token generated\n");

  // 1. Find Itsyhome app
  console.log("=== Finding Itsyhome app ===");
  const apps = await get(token, "/v1/apps", {
    "fields[apps]": "name,bundleId",
    limit: "200",
  });
  if (!apps) {
    console.error("Failed to fetch apps");
    return;
  }

  const app = apps.data.find((a: any) =>
    a.attributes.name.toLowerCase().includes("itsyhome"),
  );
  if (!app) {
    console.error("Itsyhome app not found. Available apps:");
    for (const a of apps.data) {
      console.log(`  - ${a.attributes.name} (${a.id})`);
    }
    return;
  }
  console.log(`  Found: ${app.attributes.name} (${app.id})\n`);

  // 2. Fetch customer review summarizations per platform
  for (const platform of ["IOS", "MAC_OS"]) {
    console.log(`=== Customer review summarizations (${platform}) ===`);
    const summaries = await get(token, `/v1/apps/${app.id}/customerReviewSummarizations`, {
      "filter[platform]": platform,
    });
    if (summaries) {
      save(`review-summarizations-${platform.toLowerCase()}.json`, summaries);
      if (Array.isArray(summaries.data)) {
        console.log(`  ${summaries.data.length} summarization(s) returned`);
        for (const s of summaries.data) {
          console.log(`\n  Summarization ${s.id}:`);
          console.log(`    Attributes: ${JSON.stringify(s.attributes, null, 4)}`);
          if (s.relationships) {
            console.log(`    Relationships: ${JSON.stringify(s.relationships, null, 4)}`);
          }
        }
      } else {
        console.log(`  Response: ${JSON.stringify(summaries, null, 2)}`);
      }
    }
    console.log();
  }

  // 4. For comparison, fetch a sample of actual reviews
  console.log("=== Sample reviews (first 10) ===");
  const reviews = await get(token, `/v1/apps/${app.id}/customerReviews`, {
    "fields[customerReviews]": "rating,title,body,reviewerNickname,createdDate,territory",
    sort: "-createdDate",
    limit: "10",
  });
  if (reviews) {
    save("review-sample.json", reviews);
    for (const r of reviews.data) {
      const a = r.attributes;
      console.log(`  ${a.rating}/5 "${a.title}" by ${a.reviewerNickname} (${a.territory}, ${a.createdDate.slice(0, 10)})`);
    }
  }

  console.log(`\nDone. ${requestCount} API requests made.`);
}

main().catch(console.error);
