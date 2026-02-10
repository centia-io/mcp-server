# Centia MCP Server

A Model Context Protocol (MCP) server that exposes the Centia API as MCP tools generated from the OpenAPI spec. It communicates over STDIO and can be used with any MCP-compatible client (Claude Desktop, MCP Inspector, etc.).

## Prerequisites
- Node.js 18+ (20+ recommended)
- npm 9+

## Install
```bash
# From the project root
npm install
```

## Configuration
The server accepts the following environment variables:

- `API_BASE_URL` (optional) — Base URL for the Centia API. Default: `https://api.centia.io`
- `API_TOKEN` (recommended) — Personal access token for Centia. Most endpoints/tools require authentication; set this to enable them.

The API surface is defined in `centia-api.json` (already included in the repo). The server reads it at runtime to generate tools.

## Run locally (development)
Hot‑reload development run with `tsx`:
```bash
npm run dev
```
This starts the MCP server on STDIO. It is meant to be launched by an MCP client (see below), but you can also smoke‑test it with the MCP Inspector.

## Run with npx
You can run the server directly using `npx`.

If running from the source locally:
```bash
npm run build
npx .
```

If the package is installed or you want to use the published version:
```bash
npx @centia/mcp-server
```

## Build and run (production)
```bash
npm run build
npm start
```
This compiles TypeScript to `dist/` and starts `node dist/index.js`.

If you need environment variables:
```bash
API_TOKEN=your_token_here npm start
# or
API_BASE_URL=https://api.centia.io API_TOKEN=your_token_here npm run dev
```

## Using with MCP Inspector (recommended for local testing)
MCP Inspector lets you connect to the server and try tools interactively.

1. Start the Inspector UI:
   ```bash
   npx @modelcontextprotocol/inspector
   ```
2. In the Inspector UI, create a new "STDIO" connection and set the command to one of:
   - `npm run dev` (development)
   - `npm start` (after build)
3. If needed, add environment variables in the Inspector connection dialog (e.g., `API_TOKEN`).

Tip: You can also launch the Inspector directly with a command, depending on your version of the Inspector:
```bash
# Example (may vary by Inspector version)
npx @modelcontextprotocol/inspector --server-command "npm run dev"
```

## Using with Claude Desktop
Add the server to your Claude Desktop MCP config (e.g., `claude_desktop_config.json`).

### Using npx (easiest)
```json
{
  "mcpServers": {
    "centia": {
      "command": "npx",
      "args": ["-y", "@centia/mcp-server"],
      "env": {
        "API_TOKEN": "YOUR_CENTIA_TOKEN",
        "API_BASE_URL": "https://api.centia.io"
      }
    }
  }
}
```

### Using local source
```json
{
  "mcpServers": {
    "centia": {
      "command": "npm",
      "args": ["run", "start"],
      "env": {
        "API_TOKEN": "YOUR_CENTIA_TOKEN",
        "API_BASE_URL": "https://api.centia.io"
      },
      "cwd": "/absolute/path/to/your/mcp-server"
    }
  }
}
```
- For development, replace `"args": ["run", "start"]` with `"args": ["run", "dev"]`.
- Ensure `cwd` points to this project directory.

## NPM scripts
- `npm run dev` — Run TypeScript directly with `tsx` (hot‑reload style dev loop).
- `npm run build` — Compile TypeScript to CommonJS/ESM in `dist/` via `tsc`.
- `npm start` — Run the built server (`node dist/index.js`).

## Troubleshooting
- Tools missing or inputs look odd: ensure `centia-api.json` exists and is valid. The server generates tools from this file at startup.
- 401/403 errors: set a valid `API_TOKEN` in the environment.
- JSON Schema validation errors: schemas are auto‑normalized/sanitized for MCP, but if you updated `centia-api.json`, re-run and check logs for details.
- ESM/CommonJS issues: this project uses ESM (`"type": "module"`). Use Node.js 18+ and run scripts via npm as shown above.

## License
ISC
