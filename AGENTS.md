# AGENT.md - Centia BaaS Core Rules

> Last updated: 2026-02-22

This file only contains global hard rules.
Task-specific guidance has been moved into `skills/*/SKILL.md`.

## 1) Prime Directive

- Prefer Centia MCP tools when available.
- Use `@centia-io/sdk` for all JS/TS runtime code.
- Use raw HTTP only for provisioning or SDK gaps.
- Never re-implement SDK functionality with `fetch`/`axios` in runtime app code.

## 2) Tool Priority (Hard Rule)

Use this order:

1. Centia MCP tools
2. `@centia-io/sdk`
3. OpenAPI-defined HTTP calls
4. Docs-backed HTTP calls

Never invent endpoints or payloads.

## 3) Runtime vs Provisioning (Hard Rule)

- Runtime application code must not perform schema provisioning.
- Schema changes are provisioning/codegen tasks only.
- Runtime apps must assume schema already exists.

## 4) Security and Auth Baselines

- Never hardcode credentials or tokens.
- Never commit secrets in `.env`.
- Frontend/browser code must not embed service tokens.
- Browser auth must use SDK OAuth flows; do not implement OAuth manually.

## 5) Destructive Operations Policy (Hard Rule)

Before destructive changes, present method/tool/purpose and require explicit user confirmation.

Destructive includes:

- `DROP`, `TRUNCATE`, destructive `DELETE`
- schema/table/column/constraint/index deletes
- policy overwrite operations

## 6) Required Skill Routing

Use the minimal matching skill(s) below for each task:

- Runtime SDK patterns: `skills/centia-runtime-sdk/SKILL.md`
- Provisioning and migrations: `skills/centia-provisioning/SKILL.md`
- JSON-RPC lifecycle and typed API: `skills/centia-json-rpc/SKILL.md`
- Auth model by runtime context: `skills/centia-auth-model/SKILL.md`
- PostgreSQL types and output formats: `skills/centia-types-formats/SKILL.md`
- File import workflow: `skills/centia-file-import/SKILL.md`
- OpenAPI and docs fallback: `skills/centia-openapi-docs/SKILL.md`
- Delivery checklist and MCP reference: `skills/centia-delivery/SKILL.md`

## 7) Default Paths

- SDK client: `src/baas/client.ts`
- HTTP fallback layer: `src/baas/http.ts`
- Provisioning assets: `provision/`, `migrations/`, `schema/` 
