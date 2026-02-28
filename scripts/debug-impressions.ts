/**
 * Debug impressions mismatch – list all reports and examine engagement data.
 *
 * Run: npx tsx --env-file=.env.local scripts/debug-impressions.ts
 */

import * as jose from "jose";
import * as fs from "fs";
import * as zlib from "zlib";

// ── Config ──────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const KEY_PATH = requireEnv("ASC_KEY_PATH");
const KEY_ID = requireEnv("ASC_KEY_ID");
const ISSUER_ID = requireEnv("ASC_ISSUER_ID");
const APP_ID = requireEnv("ASC_APP_ID");
const ONGOING_REQUEST_ID = requireEnv("ASC_ANALYTICS_ONGOING_REQUEST_ID");
const SNAPSHOT_REQUEST_ID = requireEnv("ASC_ANALYTICS_SNAPSHOT_REQUEST_ID");
const BASE = "https://api.appstoreconnect.apple.com";

// ── ASC auth + helpers ──────────────────────────────────────────────

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

let token = "";

async function ascApi(path: string) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`  HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  return res.json();
}

async function downloadSegment(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  try { return zlib.gunzipSync(buf).toString("utf-8"); } catch { return buf.toString("utf-8"); }
}

function parseTsv(raw: string): Array<Record<string, string>> {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = (values[i] ?? "").replace(/^"|"$/g, "");
    }
    return record;
  });
}

// ── Data fetching ───────────────────────────────────────────────────

interface InstanceInfo {
  id: string;
  processingDate: string;
}

async function getAllInstances(reportId: string, granularity: string, limit: number): Promise<InstanceInfo[]> {
  const instances: InstanceInfo[] = [];
  let url: string | undefined = `/v1/analyticsReports/${reportId}/instances?filter[granularity]=${granularity}&limit=${Math.min(limit, 200)}`;

  while (url && instances.length < limit) {
    const resp = await ascApi(url);
    if (!resp?.data) break;
    for (const inst of resp.data) {
      instances.push({ id: inst.id, processingDate: inst.attributes.processingDate });
    }
    url = resp.links?.next;
  }
  return instances;
}

async function downloadInstanceData(instanceId: string): Promise<Array<Record<string, string>>> {
  const segments = await ascApi(`/v1/analyticsReportInstances/${instanceId}/segments`);
  if (!segments?.data?.length) return [];
  const rows: Array<Record<string, string>> = [];
  for (const seg of segments.data) {
    const tsv = await downloadSegment(seg.attributes.url);
    if (tsv) rows.push(...parseTsv(tsv));
  }
  return rows;
}

function filterByApp(rows: Array<Record<string, string>>): Array<Record<string, string>> {
  if (rows.length === 0 || !rows[0]["App Apple Identifier"]) return rows;
  return rows.filter((r) => r["App Apple Identifier"] === APP_ID);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  token = await makeToken();

  console.log(`App: ${APP_ID}`);
  console.log(`ASC dashboard: Impressions ≈ 27K`);
  console.log(`Our app:       Impressions = 16,273\n`);

  // ── 1. List ALL reports in ALL categories ────────────────────

  console.log("=".repeat(70));
  console.log("STEP 1: List all available reports");
  console.log("=".repeat(70));

  for (const requestId of [ONGOING_REQUEST_ID, SNAPSHOT_REQUEST_ID]) {
    const label = requestId === ONGOING_REQUEST_ID ? "ONGOING" : "SNAPSHOT";
    console.log(`\n── ${label} (${requestId}) ──`);

    for (const category of ["APP_STORE_ENGAGEMENT", "COMMERCE", "APP_USAGE"]) {
      const resp = await ascApi(`/v1/analyticsReportRequests/${requestId}/reports?filter[category]=${category}`);
      if (!resp?.data) continue;

      console.log(`\n  Category: ${category}`);
      for (const r of resp.data) {
        console.log(`    Report: "${r.attributes.name}" (id=${r.id})`);
      }
    }
  }

  // ── 2. Examine "Detailed" engagement report if exists ──────

  console.log(`\n${"=".repeat(70)}`);
  console.log("STEP 2: Check for 'Detailed' engagement reports");
  console.log("=".repeat(70));

  // Search for any report with "engagement" or "impression" in the name
  for (const requestId of [ONGOING_REQUEST_ID, SNAPSHOT_REQUEST_ID]) {
    const label = requestId === ONGOING_REQUEST_ID ? "ONGOING" : "SNAPSHOT";
    const resp = await ascApi(`/v1/analyticsReportRequests/${requestId}/reports?filter[category]=APP_STORE_ENGAGEMENT`);
    if (!resp?.data) continue;

    for (const r of resp.data) {
      const name: string = r.attributes.name;
      if (name.includes("Standard")) continue; // We already know about Standard

      console.log(`\n  ${label}: Found non-standard report: "${name}" (id=${r.id})`);

      // Check instances
      const instances = await getAllInstances(r.id, "DAILY", 5);
      console.log(`    Instances: ${instances.length}`);
      if (instances.length > 0) {
        const rows = filterByApp(await downloadInstanceData(instances[0].id));
        console.log(`    Sample instance rows: ${rows.length}`);
        if (rows.length > 0) {
          console.log(`    Columns: ${Object.keys(rows[0]).join(", ")}`);
          console.log(`    First row: ${JSON.stringify(rows[0])}`);
        }
      }
    }
  }

  // ── 3. Detailed breakdown of one date ─────────────────────

  console.log(`\n${"=".repeat(70)}`);
  console.log("STEP 3: Detailed impression breakdown for Feb 20");
  console.log("=".repeat(70));

  // Use the SNAPSHOT which has the broadest data
  const snapResp = await ascApi(`/v1/analyticsReportRequests/${SNAPSHOT_REQUEST_ID}/reports?filter[category]=APP_STORE_ENGAGEMENT`);
  if (!snapResp?.data) { console.log("No SNAPSHOT engagement reports"); return; }

  const stdReport = snapResp.data.find((r: any) => r.attributes.name === "App Store Discovery and Engagement Standard");
  if (!stdReport) { console.log("No Standard engagement report in SNAPSHOT"); return; }

  const snapInstances = await getAllInstances(stdReport.id, "DAILY", 5);
  if (snapInstances.length === 0) { console.log("No instances"); return; }

  const snapRows = filterByApp(await downloadInstanceData(snapInstances[0].id));
  const feb20Rows = snapRows.filter((r) => r["Date"] === "2026-02-20");

  console.log(`\nFeb 20 rows: ${feb20Rows.length}`);

  // Break down by Event + Source Type + Page Type
  const breakdown = new Map<string, { counts: number; uniqueCounts: number; rows: number }>();
  for (const row of feb20Rows) {
    const key = `Event=${row["Event"]} | PageType=${row["Page Type"]} | Source=${row["Source Type"]}`;
    const existing = breakdown.get(key) || { counts: 0, uniqueCounts: 0, rows: 0 };
    existing.counts += parseInt(row["Counts"] || "0", 10) || 0;
    existing.uniqueCounts += parseInt(row["Unique Counts"] || "0", 10) || 0;
    existing.rows++;
    breakdown.set(key, existing);
  }

  console.log(`\nBreakdown by Event × PageType × Source:`);
  for (const [key, data] of [...breakdown.entries()].sort((a, b) => b[1].counts - a[1].counts)) {
    console.log(`  ${key}`);
    console.log(`    Rows: ${data.rows} | Counts: ${data.counts} | Unique: ${data.uniqueCounts}`);
  }

  // Total impressions for Feb 20
  const feb20Impressions = feb20Rows.filter((r) => r["Event"] === "Impression");
  const totalCounts = feb20Impressions.reduce((s, r) => s + (parseInt(r["Counts"] || "0", 10) || 0), 0);
  const totalUnique = feb20Impressions.reduce((s, r) => s + (parseInt(r["Unique Counts"] || "0", 10) || 0), 0);
  console.log(`\nFeb 20 Impression totals: Counts=${totalCounts}, Unique Counts=${totalUnique}`);

  // ── 4. Check "Detailed" report for same date ─────────────

  console.log(`\n${"=".repeat(70)}`);
  console.log("STEP 4: Check all report types for engagement data");
  console.log("=".repeat(70));

  for (const r of snapResp.data) {
    const name: string = r.attributes.name;
    console.log(`\n── Report: "${name}" ──`);

    const instances = await getAllInstances(r.id, "DAILY", 3);
    console.log(`  DAILY instances: ${instances.length}`);

    if (instances.length > 0) {
      const rows = filterByApp(await downloadInstanceData(instances[0].id));
      console.log(`  Instance ${instances[0].processingDate}: ${rows.length} rows`);

      if (rows.length > 0) {
        console.log(`  Columns: ${Object.keys(rows[0]).join(", ")}`);
        const events = new Set(rows.map((r) => r["Event"]).filter(Boolean));
        if (events.size > 0) console.log(`  Events: ${[...events].join(", ")}`);

        // Count impressions
        const impRows = rows.filter((r) => r["Event"] === "Impression");
        if (impRows.length > 0) {
          const total = impRows.reduce((s, r) => s + (parseInt(r["Counts"] || "0", 10) || 0), 0);
          console.log(`  Impression rows: ${impRows.length}, Total Counts: ${total}`);
        }
      }
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("DONE");
}

main().catch(console.error);
