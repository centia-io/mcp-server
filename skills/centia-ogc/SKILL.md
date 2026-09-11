---
name: centia-ogc
description: Use when reading features or rendering maps through the OGC API (OGC API Features Part 1/2, OGC API Maps Part 1) in Centia BaaS — /api/v4/ogc/database/{database}/... routes, collections, items as GeoJSON with bbox/limit/offset/crs/datetime, map images, the getOgc* tools, CRS URIs and axis order, or the 401/403/404 semantics of collections.
---

# OGC API (Features + Maps)

Use this skill for the v4 OGC API under `/api/v4/ogc/database/{database}`: a standards-based, read-only view of OWS-enabled layers. Features are served by the in-process WFS engine (geofence rules with service `wfst`, versioning, workflow all apply), maps by the WMS backend through the OWS proxy (rules with service `ows`, versioning). For single-feature CRUD use `centia-feature`; for classic WMS/WFS/WMTS use `centia-ows`.

## Availability

Lives on the GeoCloud2 branch `feature/v4-ogc-api` (2026-09-10/11). **Not** on production `api.centia.io` yet — assume dev-only. SDK: `@centia-io/sdk` >= 0.2.13 ships the `Ogc` class (explicit-client pattern, `new Ogc(client)`) with `getLandingPage`, `getConformance`, `getCollections`, `getCollection`, `getItems<P>`, `getItem<P>`, and the URL builders `mapUrl`/`datasetMapUrl` for images, plus `OGC_CRS84` and `ogcEpsgCrs(code)` for CRS URIs. Otherwise use the MCP tools or plain HTTP. `f=jpeg` maps need the WMS mapfiles regenerated once after upgrade (save any layer via `postLayer`, or the legacy `/controllers/mapfile` endpoint).

## Routes and MCP tools

All routes are `GET`, public (`Scope::PUBLIC`): Bearer token, HTTP Basic or anonymous. A Bearer token must match `{database}` (401 otherwise). Collection id is always `schema.table`.

| Route (relative to `/api/v4/ogc/database/{database}`) | Tool | Returns |
|---|---|---|
| `/` | `getOgcLandingPage` | links: `conformance`, `data` (collections), `service-desc` (OpenAPI), `service-doc` |
| `/conformance` | `getOgcConformance` | `conformsTo` — Features Core/GeoJSON/OAS30/CRS, Maps Core/bbox/crs/datetime/png/jpeg |
| `/collections?limit&offset` | `getOgcCollections` | `collections[]`, `numberMatched`, `numberReturned`, `next`/`prev` links (limit default 100, max 1000) |
| `/collections/{id}` | `getOgcCollection` | `id`, `title`, `description`, `extent.spatial.bbox` (CRS84), `extent.temporal` (versioned layers), `crs[]`, `storageCrs`, links `items` (vector only) and `map` |
| `/collections/{id}/items?limit&offset&bbox&bbox-crs&crs&datetime` | `getOgcItems` / `Ogc.getItems(db, id, {limit, offset, bbox, bboxCrs, crs, datetime})` | streamed `application/geo+json` FeatureCollection + `Content-Crs` header |
| `/collections/{id}/items/{fid}?crs&datetime` | `getOgcItem` / `Ogc.getItem` | bare GeoJSON `Feature` with `links` |
| `/collections/{id}/map?bbox&bbox-crs&crs&width&height&f&transparent&bgcolor&datetime` | `getOgcCollectionMap` / `Ogc.mapUrl` | `image/png` (default) or `image/jpeg` |
| `/map?collections=a,b&...` | `getOgcDatasetMap` / `Ogc.datasetMapUrl` | image with several collections **of the same schema** (400 otherwise) |

Only layers with WFS/OWS enabled (`enableows`) are collections. Raster layers appear as collections without `itemType`/`items` (map only). The MCP tools return the response as text: fine for JSON, useless for map images — fetch maps over HTTP.

## Items: parameters and defaults

- `limit` default **10**, max 10000 (values above are clamped); `offset` default 0. The response always carries `numberMatched` (exact count, saturating at 1,000,000) and `numberReturned`; follow the `next` link to page.
- `bbox` = `minx,miny,maxx,maxy` (6 values allowed, the vertical pair is dropped) in the axis order of `bbox-crs`; a lower corner above the upper corner is 400 (no antimeridian boxes).
- `crs` / `bbox-crs` must be a URI from the collection's `crs` list: `http://www.opengis.net/def/crs/OGC/1.3/CRS84` (default, lon/lat), `http://www.opengis.net/def/crs/EPSG/0/4326` (**lat/lon** axis order, both in bbox input and GeoJSON output), `http://www.opengis.net/def/crs/EPSG/0/<n>` for projected CRSs (x/y). Anything else is 400 `INVALID_CRS`.
- `datetime` = one ISO 8601 instant (`2024-01-01T00:00:00Z`); intervals are 400 `DATETIME_INTERVAL_UNSUPPORTED`. On a versioned layer it selects the version valid at that instant; on other layers it is ignored. Without it, versioned layers return the current version.
- `f=json` only; any unknown query parameter is 400 `UNKNOWN_PARAMETER` (OGC API Common). The single-item route accepts only `crs`, `datetime`, `f`.
- Properties keep the primary key as well as exposing it as the feature `id` (int when the key column is an integer type). Geometry is `null` for rows without geometry; `bytea` columns are omitted.

## Maps: parameters

`bbox` defaults to the collection extent; `width`/`height` 1..16384 — give one and the other follows the bbox aspect ratio, give none and width is 1024; `f` = `png` (default, transparent) or `jpeg` (opaque); `bgcolor` = `0xRRGGBB`; `datetime` as for items. Rendering goes through the same WMS backend as `centia-ows`, so styling comes from the layer classes (`centia-map-styling`).

## Access model and status codes

Same per-layer model as WMS/WFS (`centia-privileges`): anonymous callers read layers with `authentication` `None`/`Write`; `Read/write` layers need credentials and, for sub-users, a privilege ≠ `none` (group inheritance applies). Geofence rules (`getRule`/`postRule`) apply: service `wfst` for items, `ows` for maps; `deny` → 403 `FORBIDDEN`, `limit` filters the rows/pixels. Anonymous requests are geofenced as `*`, never as the database owner.

| Situation | Status |
|---|---|
| Unknown collection or feature | 404 `COLLECTION_NOT_FOUND` / `FEATURE_NOT_FOUND` |
| Existing `Read/write` collection, no credentials | 401 `UNAUTHORIZED` + `WWW-Authenticate: Basic` |
| Existing `Read/write` collection, identity without privilege | 403 `INSUFFICIENT_PRIVILEGES` |
| Geofence deny | 403 `FORBIDDEN` |
| Bad/unknown parameter, bad CRS, interval datetime, items on a raster | 400 |
| Map backend (MapServer) failure, e.g. missing mapfile | 502 `MAP_BACKEND_ERROR` (JSON, never an HTML page with 200) |

`/collections` simply omits what the caller may not read. Errors use the v4 JSON shape `{"success":false,"message":…,"code":…,"errorCode":…}`.

## Common mistakes

| Mistake | Reality |
|---|---|
| Expecting every feature from `/items` | default `limit` is 10 — pass `limit` or follow `next` |
| Passing `bbox` as lat/lon with the default CRS | CRS84 is lon/lat; only the EPSG:4326 URI is lat/lon |
| Passing `crs=EPSG:25832` | CRS must be the URI `http://www.opengis.net/def/crs/EPSG/0/25832` |
| Expecting 404 on a protected collection | it exists → 401 (anonymous) or 403 (no privilege); 404 means unknown |
| Adding custom query parameters | 400 `UNKNOWN_PARAMETER` |
| Reading a map image through the MCP tool | tools return text; use `Ogc.mapUrl()` and fetch the image over HTTP |
| Mixing schemas in `/map?collections=` | one WMS mapfile per schema → 400 |
| Using it for editing | read-only; write with `centia-feature` (WFS-T) or the SQL API |
