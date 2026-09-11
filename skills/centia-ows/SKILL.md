---
name: centia-ows
description: Use when serving or querying layers through the classic OGC web services in Centia BaaS — WMS/UTFGRID/MVT via /api/v4/ows, WFS and WFS-T via /api/v4/wfs, the authorizing MapCache (WMTS/TMS/XYZ) proxy via /api/v4/mapcache, the getOws/postOws/getWfs/postWfs/getMapcache/deleteMapcacheTileset tools, the FILTERS/labels parameters, srs and time-slice path segments, or Basic/Bearer/anonymous access to protected layers.
---

# OWS: WMS, WFS, WFS-T and MapCache

Use this skill for the v4 OGC web service endpoints. They are the map/feature backends that GIS clients (QGIS, MapLibre/Leaflet WMS layers, OpenLayers WFS) consume directly. For the RESTful OGC API (GeoJSON items, map images by URL) use `centia-ogc`; for single-feature CRUD use `centia-feature`.

## Availability

Production-ready on GeoCloud2 `master` (2026-08). SDK: `@centia-io/sdk` >= 0.2.12 ships `Ows`, `Wfs` and `Mapcache` (explicit-client pattern: `new Wfs(client)`); they return text/JSON, and `Mapcache.mapcacheUrl()` builds tile URL templates for map libraries. The MCP tools wrap the same routes and return text (XML/JSON), so they suit GetCapabilities/DescribeFeatureType/GetFeature checks, not images or tiles.

## Endpoints, MCP tools and SDK

| Service | Route | Tools / SDK | Notes |
|---|---|---|---|
| WMS 1.1.1/1.3.0, UTFGRID, MVT | `GET /api/v4/ows/schema/{schema}/database/{database}?SERVICE=WMS&REQUEST=GetMap&LAYERS=schema.table&...` | `getOws` / `Ows.getOws` | MapServer (or QGIS Server / external WMS source per layer). Layer names are `schema.table`. `FORMAT=json` → UTFGRID, `FORMAT=mvt` → vector tiles |
| WFS proxy (MapServer) | `POST /api/v4/ows/...` with WFS XML | `postOws` / `Ows.postOws` | legacy path; prefer `/api/v4/wfs` |
| WFS 1.0.0/1.1.0 | `GET /api/v4/wfs/schema/{schema}/database/{database}/srs/{srs}/ts/{timeSlice}?SERVICE=WFS&REQUEST=GetFeature&TYPENAME=table&...` | `getWfs` / `Wfs.getWfs(schema, db, params, {srs, timeSlice})` | in-process engine; `srs` = output SRID, `timeSlice` = ISO date for versioned layers — both optional path segments (omit the whole `/srs/...` tail) |
| WFS-T | `POST /api/v4/wfs/...` with `<wfs:Transaction>` (Insert/Update/Delete) | `postWfs` / `Wfs.postWfs` | versioning, workflow, geofence rules, tile-cache busting, pre/post processors |
| MapCache (WMTS, TMS, XYZ, Google) | `GET /api/v4/mapcache/database/{database}/{path}` e.g. `wmts/1.0.0/WMTSCapabilities.xml`, `tms/1.0.0/schema.table@g/10/512/340.png` | `getMapcache` / `Mapcache.getMapcache`, `Mapcache.mapcacheUrl` | authorizing proxy in front of MapCache; a tile whose tileset cannot be resolved fails closed (403) |
| Tile cache wipe | `DELETE /api/v4/mapcache/database/{database}/tileset/{tileset}?bbox&zoom` | `deleteMapcacheTileset` / `Mapcache.deleteMapcacheTileset` | full wipe is synchronous (200), scoped delete is a background job (202) |

WMS GetMap parameters follow the standard (`BBOX`, `WIDTH`, `HEIGHT`, `CRS`/`SRS`, `FORMAT=image/png`, `STYLES=`, `TRANSPARENT`). Extra vendor parameters on `/ows`: `FILTERS` = base64url JSON `{ "schema.table": ["sql where", ...] }` applied as extra WHERE clauses; `LABELS=false` disables labels. Rules and `FILTERS` do not work together with several QGIS-backed layers in one request.

WFS `GetFeature` supports `TYPENAME`, `PROPERTYNAME`, `FEATUREID` (`table.key`), `BBOX`, `FILTER` (OGC Filter Encoding XML), `MAXFEATURES`, `SRSNAME`, `OUTPUTFORMAT` (`GML2`/`GML3`), `RESULTTYPE=hits`. There is no start index/offset — page with the OGC API instead.

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
