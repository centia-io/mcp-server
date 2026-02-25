---
name: centia-types-formats
description: PostgreSQL and PostGIS type guidance for Centia BaaS, including SQL parameter casts, type_hints, type_formats, and supported output formats for SQL and JSON-RPC responses.
---

# Types and Formats

Use this skill for SQL typing, RPC type hints, and output format decisions.

## SQL type system baseline

Use PostgreSQL types (including PostGIS-enabled environments).

Common groups:

- Numeric: `smallint`, `integer`, `bigint`, `numeric`, `real`, `double precision`
- Character: `varchar(n)`, `char(n)`, `text`
- Boolean: `boolean`
- JSON: `json`, `jsonb`
- Date/time: `date`, `time`, `timetz`, `timestamp`, `timestamptz`, `interval`
- Range: `int4range`, `int8range`, `numrange`, `daterange`, `tsrange`, `tstzrange`
- Arrays: append `[]` (for example `integer[]`, `text[]`)

## SQL casting rule

Always cast parameters when needed for correctness and inference:

```sql
SELECT :name::text, :age::integer, :joined::date
```

For JSON-RPC type inference, explicit casts are required.

## type_hints

Use `type_hints` when server-side inference is ambiguous.

Example:

```json
{ "date": "timestamptz", "days": "integer" }
```

## type_formats

Use `type_formats` to format temporal output columns.

Example:

```json
{ "date": "D M d Y", "time": "H:i:s T" }
```

## Output formats (SQL and JSON-RPC)

Supported through `output_format`:

- Standard: `json`, `geojson`, `csv`, `excel`, `ogr/[format]`
- Streaming: `ndjson`, `ccsv`

Rules:

- Standard formats are single-response and capped at 100000 rows.
- Streaming formats have no row cap and are suitable for large exports/pipelines.
- Default format is `json` with `schema` and `data` fields.