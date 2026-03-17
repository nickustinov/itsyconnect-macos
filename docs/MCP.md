# MCP server

Itsyconnect includes an optional [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that lets AI coding assistants interact with your App Store Connect data directly.

## Setup

1. Open **Settings > General**
2. Enable the **MCP server** toggle
3. Set the port (default: 3100)
4. Expand your AI tool's section and copy the config snippet

### Claude Code

```bash
claude mcp add --transport http itsyconnect http://127.0.0.1:3100/mcp
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp.itsyconnect]
type = "remote"
url = "http://127.0.0.1:3100/mcp"
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "itsyconnect": {
      "url": "http://127.0.0.1:3100/mcp"
    }
  }
}
```

### OpenCode

Add to `opencode.json` under `mcp`:

```json
{
  "itsyconnect": {
    "type": "remote",
    "url": "http://127.0.0.1:3100/mcp"
  }
}
```

## Docker

When running Itsyconnect in Docker, expose the MCP port alongside the web UI port:

```bash
docker run -d -p 3000:3000 -p 3100:3100 -v itsyconnect-data:/app/data ghcr.io/nickustinov/itsyconnect:latest
```

Enable the MCP server in **Settings > General** after starting the container.

## Available tools

### list_apps

List all apps in the connected App Store Connect account. Returns app IDs, names, bundle IDs, and primary locales.

### list_versions

List all versions for an app. Returns version IDs, version strings, states, platforms, and available locales for editable versions.

### update_listing

Update store listing fields for an app version across one or more locales.

**Fields:** `whatsNew`, `description`, `keywords`, `promotionalText`, `supportUrl`, `marketingUrl`

**Parameters:**
- `appId` – app ID
- `versionId` – version ID
- `field` – which field to update
- `values` – map of locale code to value

### update_app_details

Update app details fields across one or more locales.

**Fields:** `name`, `subtitle`, `privacyPolicyUrl`, `privacyChoicesUrl`

**Parameters:**
- `appId` – app ID
- `field` – which field to update
- `values` – map of locale code to value

### update_review_info

Update App Store review submission details for a version.

**Fields:** `notes`, `contactEmail`, `contactFirstName`, `contactLastName`, `contactPhone`, `demoAccountName`, `demoAccountPassword`, `demoAccountRequired`

**Parameters:**
- `appId` – app ID
- `versionId` – version ID
- `attributes` – object with fields to update

### translate

Translate store listing or app details fields from a source locale to target locales using the configured AI provider.

**Translatable fields:** `whatsNew`, `description`, `keywords`, `promotionalText`, `name`, `subtitle`

**Parameters:**
- `appId` – app ID
- `versionId` – version ID (required for store listing fields)
- `fields` – array of field names to translate
- `sourceLocale` – source locale (e.g. `en-US`)
- `targetLocales` – target locales (omit to translate to all existing locales)

**Example prompts:**

> Update the what's new for Itsyconnect 1.7.0 with these release notes and translate to all languages

> Translate the description for my app from English to German, French, and Spanish

## Architecture

- Runs as a separate HTTP server on its own port (default 3100)
- Uses MCP Streamable HTTP transport (stateless)
- Shares the database and ASC client with the main app – no separate process or connection
- Configurable via Settings UI or the `/api/settings/mcp` API endpoint
