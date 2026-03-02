# Background analytics fetch

How analytics data flows from App Store Connect to the UI.

## Overview

Only the **background sync worker** ever fetches analytics data. The API route is strictly read-only – it returns cached data or tells the client "pending" (the worker hasn't reached this app yet). This separation ensures that navigating between apps never triggers expensive API calls or blocks the UI.

## When the worker starts

| Event | Code |
| --- | --- |
| App startup | `src/instrumentation.ts` calls `startSyncWorker()` |
| Setup complete | `POST /api/setup` calls `startSyncWorker()` after storing credentials |
| Credential change | `POST /api/settings/credentials` calls `startSyncWorker()` after storing new keys |

`startSyncWorker()` is idempotent – it checks `hasCredentials()` first and returns without setting the `running` flag if there are no credentials, so it can be called again later once credentials exist. If the worker is already running, subsequent calls are no-ops.

## What the worker does

**File:** `src/lib/sync/worker.ts`

On first start, the worker runs two jobs immediately, then repeats them every hour:

1. **`syncApps`** – refreshes the app list from ASC
2. **`syncAnalytics`** – calls `buildAnalyticsData(appId)` for each app **sequentially** (one after another, not in parallel)

The sequential loop in `syncAnalytics` means only one app is fetching at a time, which avoids overwhelming the ASC API when an account has many apps.

## How a single app fetch works

**File:** `src/lib/asc/analytics.ts` – `buildAnalyticsData()`

`buildAnalyticsData` checks cache first. If cached data exists, it returns immediately. Otherwise it fetches from ASC.

### Step 1: Discover report request IDs

The worker looks up report request IDs for the app (ONGOING + ONE_TIME_SNAPSHOT). These are cached in a two-tier system:

1. In-memory `Map` (fastest, lost on restart)
2. SQLite via `cacheGet('asc-report-requests:{appId}')` with 7-day TTL

Only falls through to the ASC API if both miss. Report request IDs never change, so 7 days is conservative.

### Step 2: Find report IDs

For each report type (downloads, sessions, crashes, etc.), the worker resolves the report ID from the request IDs. Same two-tier cache with 7-day TTL (`asc-report-id:{requestId}:{reportName}`). When a report category is queried from the API, all reports in that category are cached at once.

### Step 3: Fetch instances (with pagination)

Each report type fetches up to 365 daily instances (or 24 monthly for crashes – the ASC API only provides crash data at monthly granularity). The API paginates at 200 per page, so deeper history follows `links.next` automatically. Instances from both ONGOING and SNAPSHOT requests are merged, deduplicated by `processingDate`.

### Step 4: Download instance data from S3

Each instance's segments are gzip-compressed TSV files hosted on S3 (pre-signed URLs from ASC). Key protections:

- **Per-instance caching** – past days are immutable, cached in SQLite for 30 days (`analytics-inst:{instanceId}`). Only today's data (10-minute TTL) and uncached historical instances hit S3.
- **Global S3 semaphore** – max 6 concurrent downloads across all report types to prevent ECONNRESET from too many parallel connections.
- **Retry with backoff** – transient errors (ECONNRESET, ETIMEDOUT, socket hang up) retry up to 3 times with increasing delay.

All instances for a single report type are launched concurrently via `Promise.allSettled`, but the semaphore serialises the actual S3 requests. Failed individual instances log warnings but don't abort the entire fetch.

### Step 5: Aggregate and cache

Raw TSV rows are aggregated into the `AnalyticsData` shape (daily downloads, revenue, sessions, crashes, etc.) and cached in SQLite under `analytics:{appId}` with a 1-hour TTL. The hourly sync worker refresh means data stays current.

## How the API route serves data

**File:** `src/app/api/apps/[appId]/analytics/route.ts`

The API route reads directly from the cache. It never calls `buildAnalyticsData()` or any analytics function:

1. **No credentials** – returns `{ data: null }`.
2. **Cache hit** – returns data and cache metadata. Uses `ignoreStale` so even expired cache entries are served (the bg worker will refresh them).
3. **Cache miss** – returns `{ pending: true }`. The background worker hasn't fetched this app yet.

Responses are instant (< 10ms) since the route only reads SQLite.

## How the client handles pending state

**File:** `src/lib/analytics-context.tsx`

The `AnalyticsProvider` fetches `/api/apps/{appId}/analytics` on mount. If the response contains `{ pending: true }`:

- Sets `pending = true` in state
- Starts polling every 3 seconds until data arrives
- Stops polling once `pending` becomes false (data received or error)

The analytics pages show different UI for each state:

| State | What the user sees |
| --- | --- |
| `loading && !data` | Brief spinner (HTTP request in flight, < 100ms) |
| `pending` | Spinner + "Fetching analytics data – this may take a moment on first load" |
| `error` | Error message + reload button |
| Data loaded but empty | "No analytics data available for this app" (overview page) |
| Data loaded | Charts and KPIs |

## Caching summary

| Cache key | Storage | TTL | What |
| --- | --- | --- | --- |
| `asc-report-requests:{appId}` | In-memory + SQLite | 7 days | Report request IDs (ONGOING/SNAPSHOT) |
| `asc-report-id:{requestId}:{name}` | In-memory + SQLite | 7 days | Report ID for a specific report name |
| `analytics-inst:{instanceId}` | SQLite | 30 days (past) / 10 min (today) | Raw TSV rows for one day's instance |
| `analytics:{appId}` | SQLite | 1 hour | Aggregated `AnalyticsData` object |

After a fresh setup, the first full fetch for all apps runs in the background. Subsequent app restarts serve data instantly from SQLite – the spinner only appears if the cache has been cleared or the app was never fetched.
