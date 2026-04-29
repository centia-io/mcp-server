# MCP server auth refactor — read credentials from gc2-cli session

## Context

Currently `src/index.ts` (line 19) reads `process.env.API_TOKEN` and uses it
as a static Bearer token. Users must obtain a Centia token manually and set
it as an env var before starting the MCP server — poor UX, and tokens leak
into shell config / Claude Desktop's `mcpServers.env` JSON.

The user already has `gc2-cli` installed (`npm i -g @mapcentia/gc2-cli`),
which supports `gc2 login` with browser (PKCE), device code, and password
flows, and persists `{token, refresh_token, host, user, database}` to
`~/.config/configstore/gc2-env.json` via the `configstore` npm package.

`@centia-io/sdk` now exposes `createConfigstoreTokenStore` and
`createTokenProvider` (file-locked, handles refresh-token rotation). See
`../gc2-js-client/.claude/prompts/auth-refactor.md`. The CLI has been
migrated to use them — see `../gc2-cli/.claude/prompts/auth-refactor.md`.

## What to do

Make the MCP server piggyback on the CLI's session. User runs `gc2 login`
once; MCP server picks up the token, refreshes when needed, no env vars
required.

### 1. Add deps in `package.json`

```json
"@centia-io/sdk": "<latest with createTokenProvider>"
```

(Don't add `configstore` directly — go through the SDK helper so file-lock
semantics are guaranteed.)

### 2. Replace lines 18-19 + token usage in `src/index.ts`

Current:
```ts
const API_BASE_URL = process.env.API_BASE_URL || "https://api.centia.io";
const API_TOKEN = process.env.API_TOKEN;
```

New (top of file):
```ts
import {
  createConfigstoreTokenStore,
  createTokenProvider,
  CodeFlow,
  NotLoggedInError,
  SessionExpiredError,
} from "@centia-io/sdk";

const DEFAULT_HOST = "https://api.centia.io";
const tokenStore = createConfigstoreTokenStore("gc2-env"); // shared with gc2-cli

async function getApiBaseUrl(): Promise<string> {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  const stored = await tokenStore.get();
  return stored.host || DEFAULT_HOST;
}

let cachedProvider: ReturnType<typeof createTokenProvider> | null = null;
async function getTokenProvider() {
  if (!cachedProvider) {
    const host = await getApiBaseUrl();
    const authService = new CodeFlow({
      host,
      clientId: "gc2-cli",  // TODO: register a separate "gc2-mcp" OAuth client server-side and switch
      redirectUri: "http://127.0.0.1:5657/auth/callback",
    }).service;
    cachedProvider = createTokenProvider({ store: tokenStore, authService });
  }
  return cachedProvider;
}

async function getAccessToken(): Promise<string> {
  // Env wins for CI / headless
  if (process.env.API_TOKEN) return process.env.API_TOKEN;
  const provider = await getTokenProvider();
  return provider.getAccessToken();
}
```

### 3. Update the request handler (line ~369)

Replace the static `if (API_TOKEN) { config.headers!["Authorization"] = ... }`
block with a call to `getAccessToken()`:

```ts
let url = `${await getApiBaseUrl()}${toolMeta.path}`;
const config: AxiosRequestConfig = { method: toolMeta.method, headers: {}, params: {} };

try {
  config.headers!["Authorization"] = `Bearer ${await getAccessToken()}`;
} catch (e) {
  if (e instanceof NotLoggedInError) {
    return {
      isError: true,
      content: [{ type: "text", text:
        "Not logged in to Centia. Run `gc2 login` (npm i -g @mapcentia/gc2-cli) " +
        "or set API_TOKEN env var." }],
    };
  }
  if (e instanceof SessionExpiredError) {
    return {
      isError: true,
      content: [{ type: "text", text:
        "Centia session expired. Run `gc2 login` again." }],
    };
  }
  throw e;
}
```

### 4. 401 retry

In the existing `catch` block on the axios call, before the current error
return: if `error.response?.status === 401` and the request hasn't been
retried yet, force a token refresh and retry once. Implementation: extend
the SDK provider with a `forceRefresh()` method, OR (simpler) clear the
`token` field via `tokenStore.set({token: undefined})` and call
`getAccessToken()` again — the provider will see the empty token and refresh.

Limit to one retry to avoid loops on persistent 401s (e.g. revoked refresh
token).

### 5. Startup banner on stderr

In `main()`, before `server.connect(transport)`, print a one-line status:

```ts
async function logAuthStatus() {
  if (process.env.API_TOKEN) {
    console.error("Centia MCP: using API_TOKEN env");
    return;
  }
  const stored = await tokenStore.get();
  if (!stored.token) {
    console.error("Centia MCP: no login found. Run `gc2 login` or set API_TOKEN.");
    return;
  }
  // Decode JWT for uid (exists in token claims as `uid`)
  try {
    const claims = JSON.parse(
      Buffer.from(stored.token.split(".")[1], "base64").toString("utf-8")
    );
    console.error(`Centia MCP: logged in as ${claims.uid} on ${stored.host || DEFAULT_HOST}`);
  } catch {
    console.error("Centia MCP: token present but unreadable");
  }
}
```

Call it once during `main()`. Keep it on stderr — stdout is for MCP JSON-RPC.

### 6. README update

Replace the env-var-only auth instructions with:

```
## Authentication

The MCP server uses the same login as the gc2-cli:

  npm i -g @mapcentia/gc2-cli
  gc2 connect https://api.centia.io   # only if not the default
  gc2 login                            # browser, device, or password

The MCP server reads ~/.config/configstore/gc2-env.json (managed by gc2-cli).

For headless / CI use, set API_TOKEN (and optionally API_BASE_URL) — env vars
take precedence over the stored session.
```

### 7. Manual test

- `gc2 login` first.
- `npm run dev` and connect from Claude Desktop.
- Trigger a tool call; verify it works without `API_TOKEN` set.
- Wait for token expiry (or temporarily lower the skew in the SDK during
  testing) and call again; verify automatic refresh.
- Unset login (`gc2 logout`) and call again; verify the friendly
  "Not logged in" error reaches Claude Desktop.

## Don't break

- `API_TOKEN` env var must still work as a fallback (CI, Docker, headless).
- `API_BASE_URL` env var must still override stored host.
- Tool schema generation (the OpenAPI → MCP tool mapping) is unrelated and
  must not regress.

## Out of scope

- Registering a dedicated `gc2-mcp` OAuth client server-side — see TODO in
  step 2. For now, share `gc2-cli`'s client_id since refresh works against
  whichever client minted the token.
- An `mcp-server login` command — login flow lives in the CLI; MCP is a
  passive consumer.
