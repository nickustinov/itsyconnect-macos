# Itsyconnect – LLM build guide

Self-hosted App Store Connect dashboard. Next.js 16, TypeScript, Tailwind v4, shadcn/ui, SQLite.

## Required reading

Before writing any code, read these docs:

- **[docs/UI.md](docs/UI.md)** – typography, icons, component patterns, form conventions, layout rules. All UI must follow these conventions exactly.
- **[docs/BACKEND.md](docs/BACKEND.md)** – architecture, security model, database schema, caching strategy, API conventions, testing. All server-side code must follow these conventions.
- **[docs/ASC-API.md](docs/ASC-API.md)** – App Store Connect API endpoints, field names, data shapes, and known quirks. Reference this before writing any ASC fetch code.

## Project rules

1. **shadcn/ui 100%** – every UI element uses shadcn. No custom primitives.
2. **Phosphor icons only** – `@phosphor-icons/react`. Never import from lucide-react.
3. **Geist font** – sans (body) and mono (code/inputs). Set globally, never override.
4. **Custom CSS classes over inline Tailwind** – reusable styles live in `globals.css` `@layer components`. Use `.section-title` for form headings, not ad-hoc utility classes. Add new classes there when a pattern repeats.
## Core principles

1. **Security first** – never expose API keys client-side. Use session tokens for browser auth, API keys server-side only. No security shortcuts.
2. **Test-driven** – write tests before code. No untested code in production.
3. **No hacks** – fix root causes, not symptoms. No "temporary" workarounds.
4. **No dead code** – remove unused code immediately. Every line must serve a purpose.
5. **Refactor continuously** – extract duplication, simplify complexity, rename for clarity. Not optional.
6. **No assumptions** – ask if uncertain. Verify with tests. Facts over guesses.
7. **Research before guessing** – web search for solutions before guessing at fixes, especially for platform-specific layout/rendering issues. Facts over trial-and-error.
8. **Revert failed changes** – if a code change doesn't fix the problem, remove it completely before trying the next approach. Never leave dead or ineffective code behind.
9. **Clean up failed fixes immediately** – if a code change aimed at fixing something has no effect, remove it completely before trying the next approach. Never accumulate layers of ineffective code.

## Routing and request interception

- **`src/proxy.ts`** handles all request interception (setup redirect, auth guards, etc.). This is Next.js 16's replacement for `middleware.ts` – never create a `middleware.ts` file.
- The proxy checks `/api/health` on root (`/`) to determine if setup is needed, then redirects to `/setup` or `/dashboard`.
- Electron loads `/` so the proxy can handle initial routing. Never hardcode `/dashboard` as the Electron entry URL.

## Versioning

- **Single source of truth**: `src/lib/version.ts` – exports `APP_VERSION` and `BUILD_NUMBER`.
- `package.json` `"version"` must match `APP_VERSION`.
- `forge.config.ts` imports `BUILD_NUMBER` for `CFBundleVersion`.
- When asked to bump: update `src/lib/version.ts` and `package.json` version.

## Style

1. **European-style titles** – never use American Title Case.
2. **En dashes, not em dashes** – use – not —.

## Git

1. **No autonomous commits** – never commit or push without explicit user instruction.
2. **No co-authorship** – never add Co-Authored-By lines to commits.
3. **No git reverts without permission** – never revert files using git checkout, git restore, or any git command without explicit user approval. Debug and fix issues instead.
