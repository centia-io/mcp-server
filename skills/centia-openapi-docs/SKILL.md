---
name: centia-openapi-docs
description: OpenAPI and documentation fallback policy for Centia BaaS, including source priority, local caching workflow, and rules for docs-backed endpoint usage.
---

# OpenAPI and Docs Policy

Use this skill when MCP/SDK are insufficient and HTTP contracts are needed.

## Source priority

Use this order:

1. Local `openapi/openapi.json`
2. URL from `CENTIA_OPENAPI_URL`
3. User-provided OpenAPI JSON

OpenAPI is the contract for described endpoints.

## Fetch pattern

If allowed and needed, fetch into local cache:

```sh
mkdir -p openapi
if [ -n "$CENTIA_OPENAPI_URL" ] && [ ! -f "openapi/openapi.fetched.json" ]; then
  curl -fsSL -H "Authorization: Bearer $CENTIA_ACCESS_TOKEN" "$CENTIA_OPENAPI_URL" -o openapi/openapi.fetched.json
fi
```

## Documentation fallback

Primary docs:

- `https://centia.io/docs/intro`

Optional local vendor mirror:

```sh
mkdir -p vendor
if [ ! -d "vendor/centia-docs/docs" ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/centia-io/website.git vendor/centia-docs
  cd vendor/centia-docs
  git sparse-checkout set docs
  cd ../..
fi
```

If clone fails (auth/network), use web docs directly.

## Rules

- Use docs-backed endpoints only when fully specified.
- Do not invent undocumented payloads.
- Document source URL for each HTTP fallback implementation.