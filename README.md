<h1>Itsyconnect</h1>

<p>
  Better App Store Connect.
</p>

<p>
  <a href="https://github.com/nickustinov/itsyconnect-macos/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--v3-blue.svg" alt="License" /></a>
  <a href="https://github.com/nickustinov/itsyconnect-macos/actions"><img src="https://img.shields.io/github/actions/workflow/status/nickustinov/itsyconnect-macos/ci.yml?branch=main" alt="CI" /></a>
  <img src="https://img.shields.io/badge/electron-40-9feaf9" alt="Electron" />
  <img src="https://img.shields.io/badge/next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/sqlite-WAL-green" alt="SQLite" />
  <img src="https://img.shields.io/badge/macOS-11%2B-999" alt="macOS 11+" />
</p>

---

A macOS desktop app that replaces Apple's App Store Connect web dashboard. Edit metadata across all locales at once, manage TestFlight builds and testers, review analytics, and respond to customer reviews – all from a single desktop window. AI translates your descriptions, keywords, and review replies into every language with one click.

Everything runs locally. One SQLite database, no cloud, no accounts, no telemetry. Credentials are encrypted with AES-256-GCM and the master key lives in the macOS Keychain.

<table>
  <tr>
    <td><a href="docs/screenshots/1.webp"><img src="docs/screenshots/1.webp" alt="App overview" /></a></td>
    <td><a href="docs/screenshots/2.webp"><img src="docs/screenshots/2.webp" alt="Store listing" /></a></td>
  </tr>
  <tr>
    <td><a href="docs/screenshots/3.webp"><img src="docs/screenshots/3.webp" alt="Screenshots" /></a></td>
    <td><a href="docs/screenshots/4.webp"><img src="docs/screenshots/4.webp" alt="TestFlight builds" /></a></td>
  </tr>
  <tr>
    <td><a href="docs/screenshots/5.webp"><img src="docs/screenshots/5.webp" alt="Analytics" /></a></td>
    <td><a href="docs/screenshots/6.webp"><img src="docs/screenshots/6.webp" alt="Customer reviews" /></a></td>
  </tr>
</table>

## Features

**Release management** – edit descriptions, keywords, what's new, promotional text, names, and subtitles for every locale. Pick builds, choose release method (manual, automatic, or scheduled), toggle phased rollout. Save everything in one click.

**AI-powered localisation** – translate any field or all fields to one locale or every locale simultaneously. Generate optimised keywords. Draft professional review replies. Translate foreign reviews. Generate appeal text for unfair ratings. Bring your own API key from Anthropic, OpenAI, Google, xAI, Mistral, or DeepSeek.

**TestFlight** – manage builds, beta groups, and testers in one interface. Add or remove builds from groups in bulk. Track installs, sessions, and crashes per build. Review tester feedback with device details and screenshots. Mark feedback as done.

**Analytics** – impressions, downloads, proceeds, first-time downloads, sessions, crashes, and conversion funnel. Compare periods, break down by territory, track version adoption. Acquisition sources, usage patterns, and crash reports across separate tabs.

**Customer reviews** – filter by rating, territory, or response status. Translate foreign-language reviews with one click. Draft replies with AI, automatically matching the reviewer's language. Edit and delete existing responses.

**Screenshots** – upload, reorder with drag-and-drop, preview in lightbox, and delete screenshots across all device categories (iPhone, iPad, Mac, Apple TV, Apple Watch, Apple Vision) and locales.

**Privacy and security** – local-first architecture. All data stays on your Mac in a single SQLite file. Credentials encrypted with AES-256-GCM envelope encryption, master key stored in the macOS Keychain. No cloud, no accounts, no telemetry.

## Quick start

```bash
git clone https://github.com/nickustinov/itsyconnect-macos.git
cd itsyconnect-macos
npm install
npm run electron:dev
```

The setup wizard will guide you through connecting your App Store Connect credentials.

## Development

```bash
npm run electron:dev          # Launch Electron with hot reload
npm run electron:make:dmg     # Build signed DMG (dev/testing)
npm run test                  # Run tests
npm run test:watch            # Watch mode
npm run test:coverage         # Coverage report
npm run db:generate           # Generate Drizzle migration
npm run db:studio             # Drizzle Studio
npm run lint                  # ESLint
```

## Architecture

```
Electron app
├── electron/main.ts      → main process (Keychain, server, window)
├── electron/preload.ts   → minimal context bridge (no FS access)
├── src/proxy.ts          → request interception (replaces middleware.ts)
├── src/app/api/*         → REST API routes (Next.js 16)
├── src/lib/asc/*         → App Store Connect API client
├── src/lib/ai/*          → AI prompt templates and streaming
├── src/db/*              → Drizzle ORM + SQLite (WAL mode)
└── ~/Library/Application Support/Itsyconnect/
    ├── itsyconnect.db    → SQLite database
    └── master-key.enc    → Keychain-encrypted master key
```

**Stack:** Electron 40 · Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Phosphor Icons · Geist font · SQLite via better-sqlite3 · Drizzle ORM · Recharts · dnd-kit · Zod · Vercel AI SDK · AES-256-GCM envelope encryption · macOS Keychain

## Releasing a new version

The app auto-updates via [update.electronjs.org](https://update.electronjs.org), which reads from public GitHub Releases.

1. Bump `APP_VERSION` and `BUILD_NUMBER` in `src/lib/version.ts`, and `"version"` in `package.json`
2. Commit and push
3. Run the release script (builds, signs, notarizes, creates a draft GitHub release):
   ```bash
   APPLE_ID=you@example.com APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=XXXXXXXXXX \
     ./scripts/build-release.sh
   ```
4. Review the draft release on GitHub, edit release notes, then click **Publish**
5. `update.electronjs.org` picks up the new release – existing users are prompted to restart and update

Users can also check manually via **Itsyconnect > Check for updates…** in the menu bar.

## License

[AGPL-3.0](LICENSE)
