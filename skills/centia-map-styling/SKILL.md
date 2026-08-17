---
name: centia-map-styling
description: Map view configuration and layer cartography for Centia BaaS, including per-schema map center/zoom/extent, layers, classes, styles, and labels, MapServer-backed rendering, id round-trip rules, and payload value conventions.
---

# Map, Layers, Classes, Styles, and Labels

Use this skill when configuring the per-schema map view or the cartographic styling of layers (classes, styles, labels) via MCP tools or the v4 API.

## Availability

The Map API and the granular class/style/label sub-routes live on the GeoCloud2 branch `dev/multiple_styles`. As of 2026-08 they are **not** on production `api.centia.io`. SDK support: `@centia-io/sdk` >= 0.2.5 has `provisioning.maps.getMap/patchMap` and the `MapConfig` type.

## Data model

```txt
Map      per-SCHEMA view config (center, zoom, extent) — orthogonal to layers
Layer    one relation, key = schema.table.geometry_column, carries `properties` (def JSON)
 └─ classes[]      one rendering rule each: expression + scale range + sortid
     ├─ styles[]   one symbolizer each (MapServer STYLE parameters)
     └─ labels[]   one text label each (MapServer LABEL parameters)
```

Classes, styles, and labels are converted server-side into a MapServer mapfile; they control WMS/tile rendering. The schema's Map `extent` is also used as the schema bbox in OGC GetCapabilities.

## Map view config

- `GET`/`PATCH /api/v4/map/schema/{schema}` — MCP tools `getMap` / `patchMap`.
- Shape: `{ center: [lon, lat] | null, zoom: number | null, extent: [minx, miny, maxx, maxy] | null }`.
- **CRS is EPSG:4326** (lon/lat). Older copies of the OpenAPI spec say EPSG:3857 — that is outdated; the API surface transforms to/from the 3857 storage at the boundary.
- PATCH is partial: only provided keys are updated; explicit `null` clears a key. Returns `303 See Other` (see `centia-provisioning` for redirect handling).

## Layer endpoints — two edit models

| Model | Route / MCP tool | Semantics |
|---|---|---|
| Atomic configure | `POST /api/v4/layers` / `postLayer` | Sets `properties` and **replaces the entire `classes` array** |
| Layer properties | `PATCH /api/v4/layers/{layer}` / `patchLayer` | Key-merge on the def JSON only (no classes) |
| Granular create | `POST .../classes`, `.../styles`, `.../labels` / `postLayerClass`, `postStyle`, `postLabel` | Additive; body is one object or an array |
| Granular update | `PATCH .../classes/{id}`, etc. / `patchLayerClass`, `patchStyle`, `patchLabel` | Key-merge on that entry |
| Granular delete | `DELETE .../{id}` / `deleteLayerClass`, `deleteStyle`, `deleteLabel` | `{id}` accepts comma-separated ids |

`POST /api/v4/layers` configures **existing** layers (relations already registered); it does not create tables. Preferred bulk workflow: `getLayer` → edit the document locally → one atomic `postLayer`.

## Id and round-trip rules

- Ids on classes, styles, and labels are fixed, server-assigned (8 hex chars). Send **new** entries *without* `id` — a client-supplied id on class creation is rejected with 400.
- When using atomic `postLayer`, send **existing ids back unchanged**; entries arriving without id are treated as new and get freshly minted ids (identity cannot be guessed).
- Round-trip unknown keys untouched: legacy classes can carry flat label keys (e.g. a top-level `force`). Do not strip them.

## Value conventions

- Numeric fields are **strings**; empty string `''` means unset. `sortid` is a real integer (convention: steps of 10; defaults to highest existing + 10).
- Colors are hex `#RRGGBB`. Opacity is `'0'`–`'100'`.
- Many style/label numeric fields accept a `[column]` reference for data-driven values (size, angle, offsets).

## Class expressions and label text

- Do **not** use the layer properties `theme_column` (CLASSITEM) and `label_column` (LABELITEM). They are the legacy mechanism and must not be combined with class expressions / label `text` — leave both empty (`''`).
- Classify with a standalone logical MapServer `expression` on each class, and label with the label's `text` expression (e.g. `[name]`).
- Quoting in class expressions depends on the column type:
  - **String columns:** quote *both* sides, including the `[column]` reference: `'[Status]'='Forslag'` (`'string'='string'`).
  - **Numeric columns:** no quotes on either side: `[tal]=1` (`1=1`).

## Enum quick reference

| Field | Values |
|---|---|
| style `linecap` | `round` `butt` `square` |
| style `geomtransform` | `bbox` `centroid` `end` `labelpnt` `labelpoly` `start` `vertices` |
| style `symbol` (built-ins) | `circle` `square` `triangle` `hatch1` `dashed1` `dot-dot` `dashed-line-short` `dashed-line-long` `dash-dot` `dash-dot-dot` `arrow` `arrow2` |
| label `position` | `auto` `ul` `uc` `ur` `cl` `cc` `cr` `ll` `lc` `lr` |
| label `angle` keywords | numeric, `auto`, `auto2`, `follow`, or `[column]` |
| label `fontweight` | `normal` `bold` `italic` `bolditalic` |
| layer `geotype` | `Default` `POINT` `LINE` `POLYGON` |
| layer `format` | `PNG` `jpeg_low` `jpeg_medium` `jpeg_high` |
| layer `cache` | `disk` `sqlite` `s3` `memcache` |

## Scale gates (all "Numeric value stored as a string")

`minscaledenom`/`maxscaledenom` exist at layer, class, and label level; layer-level `label_min_scale`/`label_max_scale` gate all labels. Min = most-zoomed-in bound, max = most-zoomed-out bound.

## Common mistakes

| Mistake | Reality |
|---|---|
| Sending map `center`/`extent` in EPSG:3857 | The surface is EPSG:4326 (lon/lat); 3857 in old spec copies is wrong |
| `postLayer` without existing class/style/label ids | Whole `classes` array is replaced; missing ids are re-minted, breaking references |
| Client-generated ids on new entries | Server assigns ids; class creation with an id returns 400 |
| Numeric values as JSON numbers | Most def/class/style/label numerics are strings; `''` = unset |
| Adding a class via `PATCH /layers/{layer}` | That route key-merges layer properties only; use `postLayerClass` or atomic `postLayer` |
| Stripping unrecognized keys before writing back | Legacy flat keys must round-trip unchanged |
| Setting `theme_column`/`label_column` alongside class expressions or label `text` | The two mechanisms must not be combined — leave both properties empty and use expressions/`text` |
| String expression written `[Status]='Forslag'` | Quote the column reference too for string columns: `'[Status]'='Forslag'`; numeric columns stay unquoted: `[tal]=1` |

## WMS preview

Preview rendering with `GET /api/v4/ows/schema/{schema}?SERVICE=WMS&...&LAYERS={schema}.{table}` with a Bearer token. Binary GetMap responses are a documented SDK gap — use raw HTTP there (see `centia-runtime-sdk` for the fallback boundary).

Access control for layers and OWS is covered in `centia-privileges`.
