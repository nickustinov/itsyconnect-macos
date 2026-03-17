# MCP server

Itsyconnect includes an optional [MCP](https://modelcontextprotocol.io) server that lets AI coding assistants interact with your App Store Connect data.

## Setup

1. Open **Settings > General**, enable **MCP server** (default port: 3100)
2. Copy the config snippet for your AI tool:

<details><summary>Claude Code</summary>

```bash
claude mcp add --transport http itsyconnect http://127.0.0.1:3100/mcp
```
</details>

<details><summary>Codex</summary>

Add to `~/.codex/config.toml`:
```toml
[mcp.itsyconnect]
type = "remote"
url = "http://127.0.0.1:3100/mcp"
```
</details>

<details><summary>Cursor</summary>

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
</details>

<details><summary>OpenCode</summary>

Add to `opencode.json` under `mcp`:
```json
{
  "itsyconnect": {
    "type": "remote",
    "url": "http://127.0.0.1:3100/mcp"
  }
}
```
</details>

**Docker:** expose the MCP port with `-p 3100:3100`, then enable in Settings.

## Available tools

| Tool | Description |
|------|-------------|
| `list_apps` | List apps with IDs, names, bundle IDs |
| `list_versions` | List versions with states, locales |
| `update_listing` | Update a store listing field for a locale |
| `update_app_details` | Update app details field for a locale |
| `update_review_info` | Update review notes, demo account, contact |
| `translate` | Translate field(s) to target locale(s) via AI |
| `add_locale` | Add a new locale to a version |
| `remove_locale` | Remove a locale (destructive, requires confirm) |

<details><summary>Tool parameters</summary>

### update_listing
`appId`, `versionId`, `field` (whatsNew, description, keywords, promotionalText, supportUrl, marketingUrl), `locale`, `value`

### update_app_details
`appId`, `field` (name, subtitle, privacyPolicyUrl, privacyChoicesUrl), `locale`, `value`

### update_review_info
`appId`, `versionId`, `attributes` (notes, contactEmail, contactFirstName, contactLastName, contactPhone, demoAccountName, demoAccountPassword, demoAccountRequired)

### translate
`appId`, `versionId` (for listing fields), `fields` (comma-separated: whatsNew, description, keywords, promotionalText, name, subtitle), `sourceLocale`, `targetLocales` (comma-separated, omit for all)

### add_locale
`appId`, `versionId`, `locale`

### remove_locale
`appId`, `versionId`, `locale`, `confirm` (must be true)

</details>

**Example prompts:**
- *Update the what's new for my app and translate to all languages*
- *Add German and French locales and translate everything*
- *Translate the description from English to all languages*

## Architecture

- Separate HTTP server on its own port (default 3100), Streamable HTTP transport (stateless)
- Shares database and ASC client with the main app – no separate process
- Mutations push SSE events to auto-refresh the UI
- Configurable via Settings UI or `/api/settings/mcp` API
