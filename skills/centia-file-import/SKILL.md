---
name: centia-file-import
description: Two-step Centia file import workflow using MCP tools, covering upload, processing options, validation mode, geospatial projection settings, and supported input formats.
---

# File Import Workflow

Use this skill for importing tabular or geospatial files into Centia.

## Hard rule

Use MCP tools first:

1. `postFileUpload`
2. `postFileProcess`

Do not call raw HTTP import endpoints unless MCP is unavailable.

## Step 1: Upload

Call `postFileUpload` and capture returned file id/name.

## Step 2: Process

Call `postFileProcess` with uploaded file and target schema.

Key options:

- `import`: `false` for validation-only, `true` to commit
- `append`: append to existing table
- `truncate`: clear table before append
- `timestamp`: add timestamp column
- `s_srs` and `t_srs`: source/target projection fallback
- `p_multi`: promote single to multipart geometries
- `x_possible_names` and `y_possible_names`: CSV lon/lat hints

## Validation flow

Run with `import: false`, inspect response, then rerun with `import: true`.

## Supported formats

- GeoJSON (`.geojson`)
- Shapefile zip (`.zip` with sidecar files)
- GeoPackage (`.gpkg`)
- GML (`.gml`)
- CSV (`.csv`)

## Typical imported table shape

- primary key `gid`
- geometry column `the_geom`
- GiST index on `the_geom`
- inferred field types