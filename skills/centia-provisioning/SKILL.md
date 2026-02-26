---
name: centia-provisioning
description: Provisioning and schema lifecycle guidance for Centia BaaS, including schema/table/column/index/constraint operations, migration structure, SQL API limits, and destructive-change safety.
---

# Provisioning Rules

Use this skill for schema changes, migrations, seed data, and platform setup.

## Scope

Provisioning includes:

- schemas
- tables
- columns
- indexes
- constraints
- policies
- relations
- relation metadata (titles, descriptions, tags, field aliases)
- seed data
- migrations

Provisioning is not runtime logic.

## Hard rules

- Preferred execution order: MCP tools, then OpenAPI, then docs-backed endpoints.
- Runtime app code must never call provisioning endpoints.
- Schema changes happen only in provisioning/codegen flows.

## SQL dialect and API limits

- SQL dialect is PostgreSQL with PostGIS enabled.
- SQL API accepts only: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`.
- DDL and transaction control are not accepted by SQL API; use provisioning tools.

## Provisioning output structure

Store artifacts in:

- `provision/`
- `migrations/`
- `schema/plan.json`
- `schema/plan.md`

Example runners:

```sh
npx tsx provision/apply.ts
npx tsx migrations/001_create_tables.ts
```

## Safety for destructive operations

Before destructive operations, present:

- method
- MCP tool or endpoint
- purpose

Proceed only with explicit user confirmation.

Destructive includes:

- `DROP TABLE`
- `TRUNCATE`
- column deletion
- policy overwrite
- `DELETE` without safe filter
- `deleteTable`, `deleteColumn`, `deleteSchema`, `deleteConstraint`, `deleteIndex`

## Project structure target

```txt
src/
  baas/
    client.ts
    http.ts
    types.ts
  features/

provision/
schema/
migrations/
docs/

.env.example
openapi/
vendor/
```