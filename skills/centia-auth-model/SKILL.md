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