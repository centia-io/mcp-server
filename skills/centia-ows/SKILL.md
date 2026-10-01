---
name: centia-ows
description: Use when serving or querying layers through the classic OGC web services in Centia BaaS — WMS/UTFGRID/MVT via /api/v4/ows, WFS and WFS-T via /api/v4/wfs, the authorizing MapCache (WMTS/TMS/XYZ) proxy via /api/v4/mapcache, the getOws/postOws/getWfs/postWfs/getMapcache/deleteMapcacheTileset tools, seeding tilesets with the tileseeder job queue (postSeedJob/getSeedJob/getSeedJobs/deleteSeedJob), the FILTERS/labels parameters, srs and time-slice path segments, or Basic/Bearer/anonymous access to protected layers.
---

# OWS: WMS, WFS, WFS-T and MapCache

Use this skill for the v4 OGC web service endpoints. They are the map/feature backends that GIS clients (QGIS, MapLibre/Leaflet WMS layers, OpenLayers WFS) consume directly. For the RESTful OGC API (GeoJSON items, map images by URL) use `centia-ogc`; for single-feature CRUD use `centia-feature`.

## Availability

Production-ready on GeoCloud2 `master` (2026-08) — **except the tileseeder job queue** (below), which is on GC2 local master only as of 2026-10 and **not** on production `api.centia.io`; its tools cannot be tried against production until it deploys. SDK: `@centia-io/sdk` >= 0.2.12 ships `Ows`, `Wfs` and `Mapcache` (explicit-client pattern: `new Wfs(client)`); they return text/JSON, and `Mapcache.mapcacheUrl()` builds tile URL templates for map libraries. The MCP tools wrap the same routes and return text (XML/JSON), so they suit GetCapabilities/DescribeFeatureType/GetFeature checks, not images or tiles.

## Endpoints, MCP tools and SDK

| Service | Route | Tools / SDK | Notes |
|---|---|---|---|
| WMS 1.1.1/1.3.0, UTFGRID, MVT | `GET /api/v4/ows/schema/{schema}/database/{database}?SERVICE=WMS&REQUEST=GetMap&LAYERS=schema.table&...` | `getOws` / `Ows.getOws` | MapServer (or QGIS Server / external WMS source per layer). Layer names are `schema.table`. `FORMAT=json` → UTFGRID, `FORMAT=mvt` → vector tiles |
| WFS proxy (MapServer) | `POST /api/v4/ows/...` with WFS XML | `postOws` / `Ows.postOws` | legacy path; prefer `/api/v4/wfs` |
| WFS 1.0.0/1.1.0 | `GET /api/v4/wfs/schema/{schema}/database/{database}/srs/{srs}/ts/{timeSlice}?SERVICE=WFS&REQUEST=GetFeature&TYPENAME=table&...` | `getWfs` / `Wfs.getWfs(schema, db, params, {srs, timeSlice})` | in-process engine; `srs` = output SRID, `timeSlice` = ISO date for versioned layers — both optional path segments (omit the whole `/srs/...` tail) |
| WFS-T | `POST /api/v4/wfs/...` with `<wfs:Transaction>` (Insert/Update/Delete) | `postWfs` / `Wfs.postWfs` | versioning, workflow, geofence rules, tile-cache busting, pre/post processors |
| MapCache (WMTS, TMS, XYZ, Google) | `GET /api/v4/mapcache/database/{database}/{path}` e.g. `wmts/1.0.0/WMTSCapabilities.xml`, `tms/1.0.0/schema.table@g/10/512/340.png` | `getMapcache` / `Mapcache.getMapcache`, `Mapcache.mapcacheUrl` | authorizing proxy in front of MapCache; a tile whose tileset cannot be resolved fails closed (403) |
| Tile cache wipe | `DELETE /api/v4/mapcache/database/{database}/tileset/{tileset}?bbox&zoom` | `deleteMapcacheTileset` / `Mapcache.deleteMapcacheTileset` | `{tileset}` is a layer tileset **or the merged per-schema one** (bare schema name, or `<schema>.mvt`). Full delete: `sqlite` 200 sync, `disk` 202 background, `s3`/`memcache` → 400 `UNSUPPORTED_BACKEND` — a **scoped** delete (`?bbox=`/`?zoom=`, 202) works on every backend and is the only way to clear an s3 cache. Auth splits on the name's shape: layer tileset needs write on the layer; schema tileset is super-user only (403 `SUPER_USER_ONLY`); unknown schema → 404 `SCHEMA_NOT_FOUND`. Never use the legacy session route `DELETE /controllers/tilecache/schema/<schema>` — its disk pattern misses MapCache's layout and it reports success without checking |

WMS GetMap parameters follow the standard (`BBOX`, `WIDTH`, `HEIGHT`, `CRS`/`SRS`, `FORMAT=image/png`, `STYLES=`, `TRANSPARENT`). Extra vendor parameters on `/ows`: `FILTERS` = base64url JSON `{ "schema.table": ["sql where", ...] }` applied as extra WHERE clauses; `LABELS=false` disables labels. Rules and `FILTERS` do not work together with several QGIS-backed layers in one request.

WFS `GetFeature` supports `TYPENAME`, `PROPERTYNAME`, `FEATUREID` (`table.key`), `BBOX`, `FILTER` (OGC Filter Encoding XML), `MAXFEATURES`, `SRSNAME`, `OUTPUTFORMAT` (`GML2`/`GML3`), `RESULTTYPE=hits`. There is no start index/offset — page with the OGC API instead.

## Tileseeder job queue (v4)

Seeding a tileset is a queued job on `/api/v4/tileseeder/jobs` (sub-user allowed; replaces the v3 pgrep/kill model, so status and stop work from any node). `postSeedJob` queues one job or an array (`SeedJobInput`: required `tileset`, `grid`, `zoom_start`, `zoom_end`; optional `name`, `extent_layer` — nullable —, `threads`; **any other field is rejected** with 400) → `202` + `Location` with the uuid(s). **`grid` is not free-form**: it must be a grid that tileset declares in the database's tile cache configuration — GC2 generates one called `g20` for every tileset, so that is the answer in practice; any other name → 400 `UNKNOWN_GRID`, whose message lists the tileset's grids (surface it to the user). Note `g20` is the grid's **name**; `GoogleMapsCompatible` is the same grid's **title** (what capabilities documents and WMTS clients show) — sending the title is the classic 400. `zoom_start`/`zoom_end` are validated against the grid's own levels (0–27 for `g20`); the string fields cap at 255 chars; `extent_layer` must be a registered layer the caller may read (else 403/404). POSTing to `.../jobs/{uuid}` is 406. Other errors: `403 INSUFFICIENT_PRIVILEGES` (no access to the tileset), `429 TOO_MANY_PENDING` (`tileseeder.maxPending`, default 20). `getSeedJobs` lists the caller's jobs (super-user: the whole database's), newest first, filters `?status=` (enum `pending`/`running`/`succeeded`/`failed`/`cancelled` — an unknown value is not rejected, it just matches nothing) and `?tileset=`, **without `log`**; `getSeedJob` (uuid, or a comma list → array) includes the `log` tail. Statuses: `pending → running → succeeded|failed|cancelled`, plus computed `stale` (running with no heartbeat for 10 min — the run or its node is gone). `deleteSeedJob` asks a job to stop: `204` if it was still queued (cancelled immediately) or already finished, `202` `{message: "Stopping"}` if running (its worker must act); a comma list validates every uuid before anything is written. Input and response are **separate schemas** — request fields are non-nullable, response rows written before v4 may present `null` there. Not the same thing as `deleteMapcacheTileset` (cache deletion).

## Schema tile settings (v4, merged per-schema tileset)

`/api/v4/schemas/{schema}/tile` (super-user only; also GC2-local-master-only as of 2026-10) configures the **merged** per-schema tilesets `<schema>` and `<schema>.mvt` — backend, TTL, format, metatiling — which used to be hardcoded. `getSchemaTileSettings` returns the **effective** settings (stored over defaults) plus `_stored` (only what is actually saved), `_defaults` (the default for every patchable key — the effective value can't reveal it once a key is stored) and `schema_exists`; `patchSchemaTileSettings` merges (an explicit `null` removes a setting) → `303`, and requires the schema to exist (`404` `SCHEMA_NOT_FOUND`); `deleteSchemaTileSettings` → `204`, idempotent — GET/DELETE deliberately work after the schema is dropped, since the row survives it.

- **`format` configures the image tileset only** (`PNG`, `jpeg_low`, `jpeg_medium`, `jpeg_high`). `MVT` is rejected (the `.mvt` tileset's only possible value *is* MVT) and `JSON` is rejected (no merged `.json` tileset exists); the response reports `vector_format` as read-only.
- Changing `cache` or `format` does **not** clear the existing cache — old tiles stay in the old backend, unserved and uncollected; plan a reseed/cleanup yourself.
- The merged schema tileset is currently only reachable through the **unauthenticated Apache alias**, not the authorizing `/api/v4/mapcache` proxy (its layer parsing drops dot-less names) — settings here affect a tileset that serves without auth.

## Access model

Every route is public (`Scope::PUBLIC`) and decides auth per request, per layer:

- **Bearer token**: validated, must be issued for `{database}` (401 otherwise, never a silent anonymous downgrade); sub-user privileges via `Authorization::check` with full group inheritance.
- **HTTP Basic**: user = database owner or a sub-user; the password is the login password, with fallback to the per-database "viewer" password. Credentials are verified even on layer-less requests (GetCapabilities), so a fabricated header is rejected.
- **Anonymous**: allowed for layers with `authentication` `None`/`Write`; `Read/write` layers answer `401` with a Basic challenge. WFS-T on a `Write` layer also needs credentials with `write` privilege.
- Allow decisions for token/Basic identities are cached 60 s (tiles); anonymous decisions never are.

Layer visibility in GetCapabilities follows the same rule (anonymous clients see `None`/`Write` layers). Geofence rules (`centia-privileges`, `getRule`/`postRule`): service `ows` for WMS/UTFGRID/MVT, `wfst` for WFS/WFS-T; `deny` renders an OWS `ServiceException` (HTTP 200 once streaming started), `limit` injects the rule filter. Anonymous traffic is geofenced as `*`, not as the database owner.

## Versioning and workflow

Versioned layers (`gc2_version_*` columns): WFS/WMS show the current version by default; `/srs/{srs}/ts/{timeSlice}` on WFS returns the version valid at that time. WFS-T updates close the old version and insert a new one. Workflow layers (`gc2_status`/`gc2_workflow`): a sub-user without a role only reads published rows (`gc2_status = 3`) and cannot transact.

## Common mistakes

| Mistake | Reality |
|---|---|
| Using unqualified layer names in WMS | `LAYERS=schema.table`; WFS `TYPENAME` may be unqualified because the schema is in the path |
| Sending a token for another database | 401 — the token must carry `database == {database}` |
| Expecting anonymous access to a `Read/write` layer | 401 + `WWW-Authenticate: Basic`; use Basic (viewer/login password) or a token |
| Reading tiles straight from `/mapcache/` | bypasses authorization; use `/api/v4/mapcache/database/{db}/...` |
| Paging WFS with `STARTINDEX` | unsupported; use OGC API `/items?limit&offset` |
| Fetching images through MCP tools or `Ows.getOws` | tools and wrappers return text; images/tiles must be fetched over HTTP (`Mapcache.mapcacheUrl()` for tile templates) |
| Expecting HTTP 4xx from a WMS/WFS error mid-stream | OGC `ServiceException`/`ExceptionReport` XML with HTTP 200 once headers are sent |
