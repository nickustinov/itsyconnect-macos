<h1>Itsyconnect</h1>

<p>
  Better App Store Connect.
</p>

<p>
  <a href="https://github.com/nickustinov/itsyconnect-macos/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/nickustinov/itsyconnect-macos/actions"><img src="https://img.shields.io/github/actions/workflow/status/nickustinov/itsyconnect-macos/ci.yml?branch=main" alt="CI" /></a>
  <img src="https://img.shields.io/badge/electron-40-9feaf9" alt="Electron" />
  <img src="https://img.shields.io/badge/next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/sqlite-WAL-green" alt="SQLite" />
  <img src="https://img.shields.io/badge/macOS-11%2B-999" alt="macOS 11+" />
  <a href="https://github.com/nickustinov/itsyconnect-macos/releases"><img src="https://img.shields.io/github/downloads/nickustinov/itsyconnect-macos/total" alt="Downloads" /></a>
</p>

---

A desktop app and self-hosted web dashboard that replaces Apple's App Store Connect. Edit metadata across all locales at once, manage TestFlight builds and testers, review analytics, respond to customer reviews, and submit nominations – all from a single desktop window. AI translates your descriptions, keywords, review replies, and even screenshots into every language with one click.

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

**Keyword optimisation** – track keyword character budgets per locale and storefront. Detect duplicates between name, subtitle, and keyword fields within a locale and across locales. One-click fix suggestions help maximise coverage and ranking across every market.

**Customer reviews** – filter by rating, territory, or response status. Translate foreign-language reviews with one click. Draft replies with AI, automatically matching the reviewer's language. Edit and delete existing responses.

**Screenshots** – upload, reorder with drag-and-drop, preview in lightbox, and delete screenshots across all device categories (iPhone, iPad, Mac, Apple TV, Apple Watch, Apple Vision) and locales. Translate screenshots to any locale using Gemini 3 Pro Image – the AI translates marketing text while preserving fonts and layout. Copy base locale screenshots to other locales without translation. Locale picker shows which locales have screenshots at a glance.

**Nominations** – browse, edit, and submit App Store nominations. AI-powered fill generates nomination answers from your app metadata with one click.

**Dark mode** – full light and dark theme support, follows your system appearance or can be set manually.

**Self-hosted Docker** – run Itsyconnect as a web app on your local network or server. One command to start, auto-generated encryption key, persistent SQLite volume. See [self-hosting with Docker](#self-hosting-with-docker).

**Diff mode** – opt-in setting that accumulates store listing, app details, app review, and keyword changes locally instead of saving to App Store Connect immediately. Review a full before/after diff across all sections and locales, discard individual fields, then push everything in one go.

**MCP server** – optional [Model Context Protocol](https://modelcontextprotocol.io) server lets AI coding tools (Claude Code, Codex, Cursor, OpenCode) manage your app listings directly. Update release notes, translate fields, add locales – all from your terminal. Respects diff mode when enabled. See [docs/MCP.md](docs/MCP.md).

**Privacy and security** – local-first architecture. All data stays on your Mac in a single SQLite file. Credentials encrypted with AES-256-GCM envelope encryption, master key stored in the macOS Keychain. No cloud, no accounts, no telemetry.

## Free and open source

Itsyconnect is completely free, with no limits – manage as many apps and developer accounts as you like. Every feature is available to everyone, distributed as a direct DMG download. Licensed under [MIT](LICENSE).

## Download

Most people just want the app. Download the latest release, open the DMG, and drag Itsyconnect into your Applications folder:

**[⬇ Download Itsyconnect](https://github.com/nickustinov/itsyconnect-macos/releases/latest/download/Itsyconnect.dmg)** – macOS 11 or later

The build is signed and notarized by Apple, so it opens without Gatekeeper warnings, and updates itself automatically from then on. On first launch the setup wizard guides you through connecting your App Store Connect credentials. Older builds are on the [releases page](https://github.com/nickustinov/itsyconnect-macos/releases).

## Build from source

Prefer to compile and run it yourself? Clone the repo and start the dev build:

```bash
git clone https://github.com/nickustinov/itsyconnect-macos.git
cd itsyconnect-macos
npm install
npm run electron:dev
```

The setup wizard will guide you through connecting your App Store Connect credentials. See [Development](#development) below for building your own signed DMG.

## Self-hosting with Docker

Run Itsyconnect as a web app on your local network or server.

```bash
docker run -d -p 3000:3000 -v itsyconnect-data:/app/data ghcr.io/nickustinov/itsyconnect:latest
```

Or with docker compose:

```bash
docker compose up -d
```

The app will be available at `http://localhost:3000`. A master encryption key is auto-generated and saved to the data volume on first run.
### Reverse proxy with authentication

The Docker container has no built-in authentication. If you expose it beyond your local machine, put it behind a reverse proxy with basic auth.

**Caddy** (recommended – automatic HTTPS):

```
itsyconnect.example.com {
    basicauth {
        admin $2a$14$... # caddy hash-password
    }
    reverse_proxy localhost:3000
}
```

Generate a password hash with `caddy hash-password`, then paste it into the Caddyfile.

**Nginx:**

```nginx
server {
    listen 443 ssl;
    server_name itsyconnect.example.com;

    auth_basic "Itsyconnect";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Generate credentials with `htpasswd -c /etc/nginx/.htpasswd admin`.

**Tailscale** – if you just want access from your own devices without exposing anything to the public internet, put the machine on your tailnet and access it via the Tailscale IP. No auth config needed.

### Data persistence

All data (SQLite database, master key) is stored in the `/app/data` volume. Back up this directory to preserve your configuration and cached analytics.

## Development

```bash
npm run electron:dev          # Launch Electron with hot reload
npm run electron:make:dmg     # Build signed DMG
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

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, project conventions, and how to submit a pull request. For features, open an issue to discuss the idea first; bug reports and small fixes can go straight in.

## License

[MIT](LICENSE)
