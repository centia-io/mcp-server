---
name: centia-auth-model
description: Authentication policy for Centia BaaS across browser, backend, CLI, and provisioning contexts, including required SDK flows and environment variable usage.
---

# Auth Model Policy

Use this skill whenever authentication is implemented or reviewed.

## Identify runtime context

Determine one of:

- browser app (SPA/frontend)
- server/backend/CLI
- provisioning script

## Browser apps

Use SDK OAuth PKCE flow only.

Required SDK classes:

- `CodeFlow` for sign-in/sign-out/callback handling
- `SignUp` for signup redirect flow

Forbidden:

- `CENTIA_ACCESS_TOKEN` in frontend code
- service tokens in browser app code
- manual OAuth implementation
- provisioning API calls from browser runtime

## Public (anonymous) access without sign-in

When an app must call the API before any user has signed in, use the **guest token flow**: SDK class `GuestFlow` (`POST /api/v4/oauth/guest`; MCP tool `postGuest`).

```ts
import { GuestFlow } from '@centia-io/sdk'
const flow = new GuestFlow({ host, clientId, database, clientSecret? })
await flow.signIn()  // stores access/refresh tokens; Sql/Rpc/Gql now run as the default user
flow.signOut()       // clears tokens
```

- Body: `database`, `client_id`, and `client_secret` only when the OAuth client is confidential (public clients omit it).
- No `Authorization` header. Returns the normal OAuth response (`access_token`, `refresh_token`, `token_type: bearer`, `expires_in`), refreshable with the standard refresh flow.
- The token is issued for the database's **default user** (`default_user=true`, see `centia-privileges`) and carries exactly that user's privileges — the same identity anonymous OGC/OWS requests get.
- Prerequisites: a default user must exist on the database (otherwise 404 `NO_DEFAULT_USER_FOUND`) and an OAuth client must be registered (`postClient`); unknown client → 401 `invalid_grant`, wrong secret → 401 `invalid_client`.
- Use it for read-only/public UIs and for token-only endpoints (Feature, SQL, GraphQL, RPC) that need a bearer even for public data. Never grant the default user write or admin privileges to make a guest app "work".
- In browsers use a **public** client so no secret ships in the bundle; switch to `CodeFlow` once the user signs in.
- Errors are thrown as plain `Error` with status and response body, like the other auth flows — not `CentiaApiError`. `GuestFlow` ships in `@centia-io/sdk` >= 0.2.14 (unreleased as of 2026-09-11; latest is 0.2.13).

## Server and CLI

Allowed methods:

- `PasswordFlow`
- `CENTIA_ACCESS_TOKEN` for MCP/HTTP fallback

Typical use:

- provisioning
- admin/service-to-service operations
- CLI tools

## Provisioning scripts

Provisioning runs server-side only.

Allowed:

- access token
- `PasswordFlow`
- MCP tools
- OpenAPI calls

Forbidden:

- browser auth flows

## Responsibility matrix

- Browser app: `CodeFlow`
- Browser signup: `SignUp`
- Browser/public access before sign-in: `GuestFlow`
- Backend app: `PasswordFlow`
- Provisioning: `PasswordFlow` or access token
- CLI: `PasswordFlow`

## Environment variables

Server/provisioning:

- `CENTIA_HOST`
- `CENTIA_CLIENT_ID`
- `CENTIA_CLIENT_SECRET`
- `CENTIA_USERNAME`
- `CENTIA_PASSWORD`
- `CENTIA_DATABASE`
- optional: `CENTIA_ACCESS_TOKEN`

Browser (Vite):

- `VITE_CENTIA_HOST`
- `VITE_CENTIA_CLIENT_ID`
- `VITE_CENTIA_DATABASE`

Never commit secrets. Keep `.env.example` with placeholders.