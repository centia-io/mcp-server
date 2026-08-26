---
name: centia-feature
description: Use when reading, creating, updating, or deleting individual geographic features (rows) as GeoJSON by primary key in Centia BaaS tables, or when working with /api/v4/schemas/{schema}/tables/{table}/features endpoints, getFeature/postFeature/patchFeature/deleteFeature tools, the Features SDK class, WFS-T feature editing, or the srs/SRID of feature geometry.
---

# Feature API (GeoJSON CRUD by primary key)

Use this skill for the v4 Feature API (`/api/v4/schemas/{schema}/tables/{table}/features/{feature}`): GeoJSON CRUD on single table rows, addressed by primary key, executed through the in-process WFS-T engine (versioning, workflow, geofence rules and tile-cache busting all apply). Successor of v2 `/api/v2/feature`.

## Availability

Lives on the GeoCloud2 branch `dev/multiple_styles` (commits `25900b64`…`844d8fd6`, 2026-08-25/26). As of 2026-08 it is **not** on production `api.centia.io` — assume dev-only. SDK support: `@centia-io/sdk` **>= 0.2.11** (published on npm; the `Features` class is absent in <= 0.2.10).

## Endpoints and semantics

**Token-only** (Bearer JWT on every request; there is NO anonymous read, even for public layers). Sub-users allowed, governed by per-table privileges (see `centia-privileges`). The table must be a registered layer with a **single-column primary key** (400 `NO_PRIMARY_KEY` otherwise) and WFS enabled (400 `WFS_NOT_ENABLED`).

| Operation | Route / MCP tool | Result |
|---|---|---|
| Get by key(s) | `GET .../features/{feature}` / `getFeature` — `{feature}` is one key **or a comma list** (`1,2,3`); `?srs` = output SRID (default 4326) | `200`: **one match → bare GeoJSON `Feature`; several → `FeatureCollection`**; `404` `FEATURE_NOT_FOUND` if none match (partial matches return `200` with the found ones) |
| Create | `POST .../features` (no key in path); body = `Feature` or `FeatureCollection`; `?srs` = SRID of incoming geometry / `postFeature` | `201` + `Location: .../features/{keys}` (comma list of the new keys — parse it for generated keys); `400` `NOTHING_INSERTED` if the layer is not editable |
| Update | `PATCH .../features/{feature}` (key optional) / `patchFeature` | `303 See Other` + `Location`; `404` `FEATURE_NOT_FOUND` if nothing updated |
| Delete | `DELETE .../features/{feature}` (exactly one key) / `deleteFeature` | `204`; `404` `FEATURE_NOT_FOUND` |

No PUT/upsert. No collection GET — reading a whole table is a SQL API or WFS job (`GET .../features` without a key → 400 `FEATURE_ID_REQUIRED`). Keys containing `'` are rejected (400 `INVALID_FEATURE_ID`).

## Body and write rules

- Body must be a GeoJSON `Feature` or a **non-empty** `FeatureCollection` (else 400 `INVALID_GEOJSON`). Geometry is optional — a feature without geometry inserts/updates properties only, and reads back with `geometry: null`.
- `srs` is asymmetric: output SRID on GET, **incoming**-geometry SRID on POST/PATCH, always defaulting to 4326 (GeoJSON lon/lat). Sending e.g. 25832 coordinates without `?srs=25832` stores garbage geometry.
- POST: a primary-key value in `properties` is used as the new key; otherwise one is generated. No upsert — posting an existing key fails the WFS transaction.
- PATCH: the path key wins; without it every feature must carry its primary key in `properties` (400 `PRIMARY_KEY_MISSING`). You **cannot PATCH one path key with a collection** (400 `INVALID_DATA`) — omit the key to batch-update. Omitted properties stay untouched.
- Property encoding (WFS-T): booleans become `t`/`f`, **JSON arrays are converted to PostgreSQL array literals automatically** — send plain JSON values, do not pre-format `"{1,2,3}"` strings.

## SDK (>= 0.2.11)

Standalone class **`Features`** (plural — `Feature` is the GeoJSON type), explicit-client pattern: `new Features(client.http)`. Methods: `getFeature<P>(schema, table, key | keys[], {srs?})` → `GeoJsonFeature<P> | GeoJsonFeatureCollection<P>` (union — normalize the shape yourself); `postFeature(schema, table, body, {srs?})` and `patchFeature(schema, table, body, {feature?, srs?})` → `{location}`; `deleteFeature(schema, table, key)`. Own minimal GeoJSON types (`GeoJsonFeature`, `GeoJsonFeatureCollection`, `GeoJsonGeometry`), no `@types/geojson`. Errors: `CentiaApiError` (`.status`/`.code`).

## Common mistakes

| Mistake | Reality |
|---|---|
| Assuming production availability | dev/multiple_styles only; MCP tools need a server restart against the updated spec |
| Reading public layers without a token | v4 Feature API always requires a Bearer JWT (unlike the OGC routes) |
| Expecting one response shape from GET | one match = bare `Feature`, several = `FeatureCollection` |
| Listing a table via `GET .../features` | 400 `FEATURE_ID_REQUIRED` — use the SQL API or WFS for collections |
| Pre-formatting array columns as `"{a,b}"` strings | send JSON arrays; the server builds the PG array literal |
| PATCHing `/features/42` with a `FeatureCollection` | 400 `INVALID_DATA` — drop the path key and put keys in `properties` |
| Forgetting `?srs` on POST/PATCH of projected coordinates | geometry is read as EPSG:4326 by default |
| Expecting `200` from PATCH / a JSON body from POST | `303`/`201` with empty bodies; the keys are in the `Location` header |
