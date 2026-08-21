---
name: centia-keyvalue
description: Use when storing or reading small JSON state (app settings, feature flags, user preferences, drafts, snapshots) in the Centia BaaS key/value store, or when working with /api/v4/keyvalue endpoints, the Keyvalue SDK class, keys, owner/public flags, or paths projection.
---

# Key/Value Store

Use this skill for the v4 Keyvalue API (`/api/v4/keyvalue/{key}`): per-database storage of arbitrary JSON under globally unique keys, with an owner/public access model.

## Availability

Lives on the GeoCloud2 branch `dev/multiple_styles` (commits `2213a099`, `3897be13`) and requires the v3 migration run (`GET /api/v3/admin/migrations` adds `owner`/`public` columns to `settings.key_value`). As of 2026-08 it is **not** confirmed on production `api.centia.io` — assume dev-only. SDK support: `@centia-io/sdk` **>= 0.2.10** (not 0.2.9). The legacy v2 `/api/v2/keyvalue` is unchanged and separate.

## Endpoints and semantics

Token-only (Bearer JWT on every request). Keys are **globally unique per database** — no schema namespacing, no format rules (SDK URL-encodes).

| Operation | Route / MCP tool | Result |
|---|---|---|
| List all visible keys | `GET /api/v4/keyvalue` / `getKeyvalue` (no key) | `200`, **plain JSON array** of entries (no wrapper) |
| Get one key | `GET /api/v4/keyvalue/{key}` | `200` entry; `404` `KEY_NOT_FOUND` if absent/not visible |
| Create | `POST .../{key}`, body `{value, public?}` / `postKeyvalue` | `201` + `Location`; `409` `KEY_EXISTS` if key exists |
| Update value and/or public | `PATCH .../{key}`, body `{value?, public?}` / `patchKeyvalue` | `303 See Other` + `Location` (see `centia-provisioning`) |
| Delete | `DELETE .../{key}` / `deleteKeyvalue` | `204`; `404` if absent/not owned |

Entry shape: `{id: int, key, value: <decoded JSON>, owner: string|null, public: bool}`. `value` is arbitrary JSON, required on POST — the spec declares `type: object`, but the server applies no type check, so scalars and arrays round-trip too. There is **no PUT/upsert**: create with POST, update with PATCH (on unknown state: POST, fall back to PATCH on 409). The `201`/`303` bodies are empty; their `Location` is `/api/v4/keyvalue/{key}` — GET it to read the entry back.

## Access model

- `owner` is **always set server-side from the JWT uid** — never send it in the body; ownership never changes.
- Super user: full CRUD on every key. Sub-user: reads own keys + `public: true` keys; creates/updates/deletes **only own** keys (violations surface as `404`, not `403`).
- Legacy rows with `owner IS NULL` are treated as public and super-owned: everyone reads, only the super user modifies.

## `paths` projection (GET single key only)

`GET .../{key}?paths=user.name,active` returns only the named sub-trees: comma separates paths, dot navigates; the result `value` is keyed by the path strings, e.g. `{"value": {"user.name": "Alice", "active": true}}`. Empty path or segment → `400` `INVALID_PATHS`. No other query params exist — **no `like`/`filter`** listing (that was v2 only); filter key names client-side.

## SDK (>= 0.2.10)

Standalone class, explicit-client pattern: `new Keyvalue(client.http)`. Methods `getKeyvalue()` (list) / `getKeyvalue<T>(key)` / `getKeyvalue(key, paths)` / `postKeyvalue<T>(key, {value, public?})` / `patchKeyvalue<T>(key, {value?, public?})` / `deleteKeyvalue(key)`; errors are `CentiaApiError` (`.status`/`.code`). Types: `KeyvalueEntry<T>`, `KeyvalueProjection`.

## Common mistakes

| Mistake | Reality |
|---|---|
| Assuming production availability | dev/multiple_styles + migration required; not confirmed on api.centia.io |
| PUT or POST to overwrite an existing key | No upsert; POST on existing key → `409` — use PATCH |
| Sending `owner` in the body | Owner comes from the JWT; body allows only `value` and `public` |
| `like=`/`filter=` query params on v4 | v2-only; v4 lists everything visible, filter client-side |
| Expecting `200` from PATCH | Returns `303 See Other` — disable auto-redirect |
| Expecting `403` when touching another user's key | Non-owned rows are invisible to writes → `404 KEY_NOT_FOUND` |
| Using `@centia-io/sdk` 0.2.9 for Keyvalue | The `Keyvalue` class ships in 0.2.10+ |
