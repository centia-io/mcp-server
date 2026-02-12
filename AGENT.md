# AGENT.md — Centia BaaS Agent Guide

> Last updated: 2026-02-12 · v1.5

This repository is designed to be used with AI coding agents such as Claude Code and Junie.

Follow this guide strictly.

---

# 1) Prime Directive

When working with Centia BaaS:

- Prefer MCP tools when available.
- Use the official SDK `@centia-io/sdk` for all TypeScript/JavaScript application runtime code.
- Use raw HTTP only for provisioning tasks not covered by MCP.
- Never re-implement SDK functionality using fetch/axios in JS/TS apps.

---

# 2) Tool Priority (Hard Rule)

Interaction priority order:

1. Centia MCP tools  
2. `@centia-io/sdk`  
3. OpenAPI HTTP calls  
4. Docs-backed HTTP calls  

Never invent endpoints or payloads.

---

# 3) Capability Split

## A) Application Runtime Code

Use ONLY:

`@centia-io/sdk`

Applies to (verify availability against installed SDK version):

- Auth
- Database CRUD (SQL, SQL builder)
- Queries & filtering
- Pagination
- JSON-RPC
- GraphQL
- Client initialization

Forbidden:

- Direct REST calls
- Custom fetch wrappers
- Reverse-engineered payloads

If SDK lacks functionality:

Create fallback in:

`src/baas/http.ts`

Document why it exists.

---

## B) Platform / Schema Provisioning

Provisioning includes:

- Schemas
- Tables
- Columns
- Indexes
- Constraints
- Policies
- Relations
- Seed data
- Migrations

Provisioning must use:

1. MCP tools (preferred)  
2. OpenAPI  
3. Docs-backed endpoints  

Provisioning is NOT runtime logic.

### SQL dialect
Centia.io uses PostgreSQL with the PostGIS extension enabled. All SQL must be valid PostgreSQL syntax. PostGIS spatial functions and types (e.g. `geometry`, `geography`, `ST_Distance`, `ST_Within`) are available.

### Mapping Libraries

Centia.io is well suited for geospatial applications. When building map-based UIs, choose a mapping library based on complexity:

| Library | When to use |
|---------|-------------|
| **MapLibre GL JS** (recommended default) | Simple map apps — displaying data on a map, markers, popups, basic interactivity |
| **Leaflet.js** | Advanced apps — custom layers, complex interactions, plugin ecosystem |
| **OpenLayers** | Advanced apps — heavy GIS workflows, projections, vector tiles, WMS/WFS integration |

Decision flow:

1. Is it a straightforward "show data on a map" app? → Use **MapLibre**
2. Does it need advanced interactivity or a rich plugin ecosystem? → Use **Leaflet.js** or **OpenLayers**

### SQL API limitations
Only select, insert, update, delete and merge statements can be executed through the SQL API.
Any other types of SQL (DDL, transaction control, etc.) will be rejected by the API.
Use MCP tools for these.

### Output Formats (SQL & JSON-RPC)

Both the SQL API (`postSql` / `sql.exec()`) and JSON-RPC methods (`postRpc` `output_format` field) support the following output formats via the `output_format` parameter:

| Format | Type | Row Limit | Description |
|--------|------|-----------|-------------|
| `json` (default) | Standard | 100 000 | JSON with `schema` and `data` array |
| `geojson` | Standard | 100 000 | GeoJSON — geospatial data interchange format |
| `csv` | Standard | 100 000 | Comma-separated values |
| `excel` | Standard | 100 000 | Excel spreadsheet |
| `ogr/[format]` | Standard | 100 000 | GDAL/OGR vector formats (e.g. `ogr/ESRI Shapefile`, `ogr/GPKG`, `ogr/GML`) — always downloaded as a zip file |
| `ndjson` | Streaming | Unlimited | Newline-delimited JSON — suitable for piping and large datasets |
| `ccsv` | Streaming | Unlimited | Streaming comma-separated values |

Key rules:

- **Standard formats** are delivered as a single response and capped at 100 000 rows.
- **Streaming formats** (`ndjson`, `ccsv`) have no row limit and can be piped to other tools, enabling processing of large result sets without memory constraints.
- Default format is `json`, which returns `{ "schema": {...}, "data": [{...}] }`.

Docs: https://centia.io/docs/statement#output-formats

---

# 4) Query Method Selection (Hard Rule)

Three query methods are available at runtime. Choose based on the operation:

| Method | When to use | SDK |
|--------|-------------|-----|
| **GraphQL** | Straightforward CRUD — select, insert, update, delete with filtering, pagination, and nested relations | `Gql` |
| **JSON-RPC** | Complex queries — joins, aggregations, CTEs, or any SQL that goes beyond basic CRUD. Keeps SQL server-side and centralizes changes. | `createApi<T>()` / `Rpc` |
| **SQL** | Last resort — only when GraphQL and JSON-RPC cannot cover the use case (e.g. dynamic query building at runtime) | `Sql` / `createSqlBuilder` |

### Decision flow

1. Can GraphQL handle it (single-table CRUD, filtering, nested relations)? → Use **GraphQL**
2. Is it a reusable query with complex SQL? → Define a **JSON-RPC method** and call it
3. Does it require runtime-dynamic query construction? → Use **SQL builder**

### Why this order

- **GraphQL** is auto-generated from the schema — no SQL to write, no strings in code, nested relations for free
- **JSON-RPC** keeps SQL on the server — one place to update queries, no SQL strings scattered in application code, type-safe via `createApi<T>()`
- **SQL** embeds query strings in client code — harder to maintain, use only when the other two cannot express the operation

### Examples

CRUD operations → GraphQL:
```ts
const gql = new Gql("public");
const res = await gql.request({
  query: `{ getUsers(where: { active: { eq: true } }, limit: 10) { id name email } }`
});
```

Report with joins/aggregation → JSON-RPC:
```ts
// Method defined server-side via postRpc:
//   q: "SELECT d.name, count(e.*) FROM departments d JOIN employees e ON ... GROUP BY d.name"
const api = createApi<Api>();
const report = await api.getDepartmentHeadcount();
```

Dynamic query built at runtime → SQL builder:
```ts
const b = createSqlBuilder(schema);
let q = b.table("logs").select(["id", "message"]);
if (level) q = q.andWhere({ level });
if (since) q = q.andWhere({ created_at: { gte: since } });
const rows = (await sql.exec(q.toSql())).data;
```

---

# 5) Schema Lifecycle Policy (Hard Rule)

Schema changes must occur during code-generation / provisioning — never at app runtime.

Allowed during code-generation:

- Create/alter/drop tables
- Modify columns/indexes/constraints
- Configure policies
- Seed initial data

Forbidden at runtime:

- Creating tables dynamically
- Auto-migrations on startup
- Schema ensure logic
- Policy changes
- Index creation

Runtime apps must assume schema already exists.

---

# 6) Provisioning Output Structure

All provisioning artifacts must be stored locally.

Allowed locations:

provision/  
migrations/  
schema/plan.json  
schema/plan.md  

Example:

```
provision/
  apply.ts

schema/
  plan.json

migrations/
  001_create_tables.ts
```

Runner:

```sh
npx tsx provision/apply.ts
npx tsx migrations/001_create_tables.ts
```

Application runtime code must never call provisioning endpoints.

---

# 7) SDK Usage Standard

All JS/TS apps must initialize SDK centrally.

File:

src/baas/client.ts

Available exports:

```ts
import { CodeFlow, PasswordFlow, SignUp, Sql, Rpc, createApi, createSqlBuilder } from "@centia-io/sdk";
import type { RpcRequest, RpcResponse, PgTypes, DBSchema, RowOfSelect } from "@centia-io/sdk";
```

### SQL execution (server & browser):

```ts
import { Sql } from "@centia-io/sdk";

export const sql = new Sql();

const res = await sql.exec({
  q: "SELECT * FROM users WHERE id = :id::int",
  params: { id: 1 },
});
console.log(res.data);
```

### Type-safe SQL builder:

```ts
import { createSqlBuilder, Sql } from "@centia-io/sdk";
import type { DBSchema, RowOfSelect } from "@centia-io/sdk";

const schema = { /* ... */ } as const satisfies DBSchema;
const b = createSqlBuilder(schema);
const sql = new Sql();

// SELECT
const selectReq = b.table("users").select(["id", "name"]).andWhere({ id: [1, 2] }).limit(10);
type Row = RowOfSelect<typeof selectReq>;
const rows: Row[] = (await sql.exec(selectReq.toSql())).data;

// INSERT
const insertReq = b.table("users").insert({ name: "Alice" }).returning(["id"]);

// UPDATE
const updateReq = b.table("users").update({ name: "Bob" }).where({ id: 1 });

// DELETE
const deleteReq = b.table("users").delete().where({ id: 2 });
```

### JSON-RPC:

See Section 9 for the full JSON-RPC workflow (creating methods, dry-run, type inference).

```ts
import { Rpc } from "@centia-io/sdk";

const rpc = new Rpc();

const res = await rpc.call({
  jsonrpc: "2.0",
  method: "myMethod",
  params: { key: "value" },
  id: 1,
});
```

### Typed RPC with createApi:

```ts
import { createApi } from "@centia-io/sdk";

interface MyApi {
  getUserById(params: { user_id: number }): Promise<Array<{ name: string }>>;
}

const api = createApi<MyApi>();
const users = await api.getUserById({ user_id: 1 });
```

### GraphQL:

```ts title="GraphQL query"
import { Gql, type GqlRequest, type GqlResponse } from "@centia-io/sdk"

const query = `
query  {
  getBands {
    band_id
    name
    subgenre
  }
}
`
const req: GqlRequest = {query}
const gql = new Gql('public') // Which schema to use
const res:GqlResponse = await gql.request(req)
```

```ts title="GraphQL mutation"
import { Gql, type GqlRequest, type GqlResponse } from "@centia-io/sdk"

const query = `
mutation UpdateBands($where: JSON, $data: JSON ) {
  updateBands(where: $where, data: $data) {
    band_id
    name
    website
  }
}
`
const variables = {
    "where": {
        "name": {
            "eq": "The Segfaults"
        }
    },
    "data": {
        "website": "https://segfaults.example",
    }
}
const req: GqlRequest = {query, variables}
const gql = new Gql('public') // Which schema to use
const res: GqlResponse = await gql.request(req)
```



### Browser auth — CodeFlow (see Section 12A):

```ts
import { CodeFlow } from "@centia-io/sdk";

export const codeFlow = new CodeFlow({
  host: import.meta.env.VITE_CENTIA_HOST,
  clientId: import.meta.env.VITE_CENTIA_CLIENT_ID,
  redirectUri: window.location.origin + "/auth/callback",
});
```

### Server auth — PasswordFlow (see Section 12B):

```ts
import { PasswordFlow } from "@centia-io/sdk";

export const flow = new PasswordFlow({
  host: process.env.CENTIA_HOST!,
  clientId: process.env.CENTIA_CLIENT_ID!,
  username: process.env.CENTIA_USERNAME!,
  password: process.env.CENTIA_PASSWORD!,
  database: process.env.CENTIA_DATABASE!,
  clientSecret: process.env.CENTIA_CLIENT_SECRET,
});
```

### Browser signup (see Section 12A)

```ts
import { SignUp } from "@centia-io/sdk";

const signUp = new SignUp({
  host: import.meta.env.VITE_CENTIA_HOST,
  clientId: import.meta.env.VITE_CENTIA_CLIENT_ID,
  parentDb: import.meta.env.VITE_CENTIA_DATABASE,
  redirectUri: "https://myapp.com/login"
});
```

Rules:

- Single shared client instances
- No hardcoded credentials
- Env-driven config
- Use `Sql` / `createSqlBuilder` for database queries
- Use `Rpc` / `createApi` for JSON-RPC calls
- Use `Gql` for GraphQL queries and mutations
- Use `CodeFlow` for browser OAuth
- Use `PasswordFlow` for server/CLI auth
- Use `SignUp` for app signup

---

# 8) Type System

Centia uses PostgreSQL types. These apply to column definitions (`postColumn`, `postTable`), SQL type casting, and RPC `type_hints`.

Docs: https://centia.io/docs/types

---

## Supported Types

### Numeric

| Type | Size | Notes |
|------|------|-------|
| `smallint` | 2 bytes | -32768 to 32767 |
| `integer` | 4 bytes | -2147483648 to 2147483647 |
| `bigint` | 8 bytes | Large integers |
| `decimal` / `numeric` | variable | User-defined precision: `decimal(10,2)` |
| `real` | 4 bytes | Floating point |
| `double precision` | 8 bytes | Floating point |

### Character

| Type | Notes |
|------|-------|
| `varchar(n)` | Variable-length, max `n` characters |
| `char(n)` / `bpchar` | Fixed-length, space-padded |
| `text` | Unlimited variable-length |

### Boolean

`boolean` — `true`, `false`, or `null`

### JSON

| Type | Notes |
|------|-------|
| `json` | Text-based JSON storage |
| `jsonb` | Binary format, faster queries and indexing |

### Date / Time

| Type | Example | Notes |
|------|---------|-------|
| `date` | `2025-05-01` | Calendar date |
| `time` | `14:30:00` | Without timezone |
| `timetz` | `14:30:00+02` | With timezone |
| `timestamp` | `2025-05-01 14:30:00` | Without timezone |
| `timestamptz` | `2025-05-01 14:30:00+02` | With timezone |
| `interval` | `1 year 2 months` | Duration |

### Geometric

| Type | Description |
|------|-------------|
| `point` | 2D coordinate (x, y) |
| `line` | Infinite 2D line |
| `lseg` | Line segment (start/end points) |
| `box` | Rectangular box (opposite corners) |
| `path` | Open or closed series of points |
| `polygon` | Closed shape (3+ points) |
| `circle` | Center point and radius |

### Range

| Type | Description |
|------|-------------|
| `int4range` | Integer range |
| `int8range` | Bigint range |
| `numrange` | Numeric range |
| `daterange` | Date range |
| `tsrange` | Timestamp range |
| `tstzrange` | Timestamp with timezone range |

Range values contain `lower`, `upper`, `lowerInclusive`, `upperInclusive`.

---

## Arrays

Append `[]` to any type to make it an array:

`integer[]`, `text[]`, `timestamptz[]`, `jsonb[]`

Used in column definitions and type hints alike.

---

## Type Casting in SQL

Use `:param::type` to cast parameters in SQL queries:

```sql
SELECT :name::text, :age::integer, :joined::date
```

Explicit casts are required for RPC type inference (see Section 9C).

---

## type_hints

Map parameter or column names to PostgreSQL types. Used in `postRpc` and `postSql` when the server cannot infer the type from context alone:

```json
{ "date": "timestamptz", "days": "integer" }
```

Valid values: any type listed above.

---

## type_formats

Map column names to output format patterns. Applies to date/time types in responses:

```json
{ "date": "D M d Y", "time": "H:i:s T" }
```

Common patterns:

| Token | Output | Description |
|-------|--------|-------------|
| `Y` | `2025` | 4-digit year |
| `m` | `05` | Month (zero-padded) |
| `d` | `08` | Day (zero-padded) |
| `D` | `Thu` | Short weekday name |
| `l` | `Thursday` | Full weekday name |
| `F` | `May` | Full month name |
| `H` | `14` | Hour (24h, zero-padded) |
| `i` | `30` | Minutes (zero-padded) |
| `s` | `00` | Seconds (zero-padded) |
| `T` | `UTC` | Timezone abbreviation |
| `jS` | `8th` | Day with ordinal suffix |

---

# 9) JSON-RPC Methods

JSON-RPC methods wrap SQL statements into named, reusable server-side procedures.
Benefits: reusability, consistency (type hints/formats defined once), security (SQL stays server-side), and simplicity (clients call by name).

Docs: https://centia.io/docs/methods

---

## A) Provisioning — Create a Method

Use the `postRpc` MCP tool to define a method.

Parameters in SQL use named placeholders with optional type casts:

- `:param` — basic placeholder
- `:param::type` — with explicit type cast (required for type inference)

```
postRpc({
  method: "getDate",
  q: "select now() as date",
  type_formats: { date: "D M d Y" }
})
```

```
postRpc({
  method: "addDays",
  q: "select date(:date) + :days::int as result",
  type_hints: { date: "timestamptz" },
  type_formats: { result: "l jS F Y", date: "D M d Y" }
})
```

Fields:

| Field | Required | Description |
|-------|----------|-------------|
| `method` | Yes | Name of the method |
| `q` | Yes | SQL statement (SELECT, INSERT, UPDATE, DELETE, MERGE) |
| `type_hints` | No | Map of parameter/column names to PostgreSQL types (e.g. `{ "date": "timestamptz" }`) |
| `type_formats` | No | Map of column names to output format patterns (e.g. `{ "date": "D M d Y" }`) |
| `output_format` | No | Response format — see Section 3B "Output Formats" for all options (default: `json`) |
| `srs` | No | EPSG code for PostGIS geometry columns (default: 4326) |

Use `patchRpc` to update an existing method. Use `deleteRpc` to remove one. Use `getRpc` to inspect definitions.

---

## B) Calling a Method

Use the `postCall` MCP tool. Follows the JSON-RPC 2.0 protocol.

```
postCall({
  jsonrpc: "2.0",
  method: "addDays",
  params: { date: "2025-05-01", days: 7 },
  id: "1"
})
```

Fields:

| Field | Required | Description |
|-------|----------|-------------|
| `jsonrpc` | Yes | Must be `"2.0"` |
| `method` | Yes | Name of the method to invoke |
| `params` | No | Object with parameter names as keys. For batch params, use an array of objects (see below). |
| `id` | No | Request identifier. Omit for notifications (fire-and-forget, no response). |

### Response structure

```json
{
  "jsonrpc": "2.0",
  "result": {
    "schema": {
      "result": { "type": "date", "array": false }
    },
    "data": [
      { "result": "Thursday 8th May 2025" }
    ]
  },
  "id": "1"
}
```

### Notifications

Omit `id` to send a notification — the server executes the method but returns no response:

```
postCall({
  jsonrpc: "2.0",
  method: "logEvent",
  params: { event: "user_signup", userId: 123 }
})
```

### Batch params (same method, multiple parameter sets)

Pass an array of objects to `params` to execute the same method with different parameters efficiently:

```
postCall({
  jsonrpc: "2.0",
  method: "insertUser",
  params: [
    { name: "Alice", email: "alice@example.com" },
    { name: "Bob", email: "bob@example.com" }
  ],
  id: "1"
})
```

### Error codes

| Code | Meaning |
|------|---------|
| `-32600` | Invalid Request — malformed JSON-RPC |
| `-32601` | Method Not Found — method does not exist |
| `-32602` | Invalid Params — missing or wrong parameters |
| `-32603` | Internal Error — server-side failure |

---

## C) Dry-Run and TypeScript Type Inference

Docs: https://centia.io/docs/sdk#json-rpc-typescript-interfaces

Use `postCallDry` to test a method without side effects and to infer types.
Then use `getTypeScript` to retrieve generated TypeScript interfaces.

**Important**: Parameters must have explicit type casts (`:param::type`) in the SQL definition for type inference to work.

### Step 1 — Dry-run the method

```
postCallDry({
  jsonrpc: "2.0",
  method: "getX",
  params: { x: 1 },
  id: "1"
})
```

This executes the method in a dry-run (no database changes) and caches inferred types on the server.

### Step 2 — Retrieve TypeScript interfaces

```
getTypeScript()
```

Returns generated interfaces for all methods that have been dry-run:

```ts
export interface Api {
  getX(params: { x: number }): Promise<{ my_int: number }[]>;
}
```

### Step 3 — Use in application code with createApi

```ts
import { createApi } from "@centia-io/sdk";
import type { Api } from "./api"; // generated file

const api = createApi<Api>();
const res = await api.getX({ x: 1 });
```

The `RowOfApiMethod` helper extracts a single row type:

```ts
import type { RowOfApiMethod } from "@centia-io/sdk";
type Row = RowOfApiMethod<Api, "getX">;
```

---

## D) Full Workflow Summary

```
1. Define method         →  postRpc     (provisioning)
2. Dry-run to infer types →  postCallDry (provisioning)
3. Get TypeScript types   →  getTypeScript (provisioning)
4. Save interface to       src/baas/api.ts
5. Call at runtime        →  SDK createApi<Api>() or Rpc.call()
6. Update method          →  patchRpc    (provisioning)
7. Delete method          →  deleteRpc   (provisioning)
```

Runtime SDK usage: see Section 7 (`Rpc` and `createApi`).

---

# 10) GraphQL API

The Centia GraphQL API is auto-generated from your database schema.

### Query naming convention:

Query and mutation names are auto-generated from table names in camelCase:

| Operation | Pattern | Example |
|-----------|---------|---------|
| Select | `get[TableName]` | `getArtists` |
| Insert | `insert[TableName]` | `insertArtists` |
| Update | `update[TableName]` | `updateArtists` |
| Delete | `delete[TableName]` | `deleteArtists` |

### Filtering operators:

Comparison: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `like`, `ilike`

Logical: `and`, `or`, `not`

```graphql
{
  getArtists(where: {
    and: [
      { legal_name: { ilike: "%Linus%" } }
      { instrument: { eq: "guitar" } }
    ]
  }) {
    artist_id
    legal_name
  }
}
```

### Pagination:

```graphql
{ getArtists(limit: 10, offset: 20) { artist_id } }
```

### Mutations:

```graphql
# Insert (single or batch via objects array)
mutation {
  insertArtists(objects: [{ legal_name: "Alice", instrument: "drums" }]) {
    artist_id
  }
}

# Update
mutation {
  updateArtists(where: { artist_id: { eq: 1 } }, data: { instrument: "bass" }) {
    artist_id
  }
}

# Delete
mutation {
  deleteArtists(where: { artist_id: { eq: 1 } }) {
    artist_id
  }
}
```

### Nested queries (via foreign keys):

```graphql
{
  getAlbums {
    title
    bands {
      name
      subgenre
    }
  }
}
```

**Introspection** is supported via standard `__schema` queries.

---

# 11) HTTP Fallback Layer

If needed, create:

src/baas/http.ts

Purpose:

- SDK gaps
- Docs-backed endpoints
- Provisioning helpers

Rules:

- Centralize headers
- Typed payloads
- No token leakage
- Document source

Comment example:

Fallback to HTTP: not supported in @centia-io/sdk yet  
Source: https://centia.io/docs/…

---

# 12) Authentication Model Policy

Authentication depends on runtime environment.

Agents must detect whether the app is:

- Browser / SPA
- Server / Backend
- Provisioning script

---

## A) Browser Applications (SPA / Frontend)

Examples:

- React
- Next.js (client)
- Vue
- Vite
- Svelte

Hard rules:

- Do NOT use `CENTIA_ACCESS_TOKEN`
- Do NOT embed service tokens
- Do NOT store long-lived tokens in source
- Do NOT call provisioning APIs

Browser apps must use OAuth Authorization Code Flow (PKCE) via SDK.

Required implementation:

Use `CodeFlow` from `@centia-io/sdk`.

Agents must NOT implement OAuth manually.

Example pattern:

```ts
import { CodeFlow } from "@centia-io/sdk";

const codeFlow = new CodeFlow({
  host: import.meta.env.VITE_CENTIA_HOST,
  clientId: import.meta.env.VITE_CENTIA_CLIENT_ID,
  redirectUri: window.location.origin + "/auth/callback",
});

// Handle redirect callback (call on page load)
codeFlow.redirectHandle().then((signedIn) => {
  if (signedIn) console.log("User signed in");
});

// Trigger login
function onLoginClick() {
  codeFlow.signIn();
}

// Trigger logout
function onLogoutClick() {
  codeFlow.signOut();
}
```

```ts
import { SignUp } from "@centia-io/sdk";

const signUp = new SignUp({
    host: import.meta.env.VITE_CENTIA_HOST,
    clientId: import.meta.env.VITE_CENTIA_CLIENT_ID,
    parentDb: import.meta.env.VITE_CENTIA_DATABASE,
    redirectUri: "https://myapp.com/login"
});

// Start sign-up when the user clicks "Create account"
function onSignUpClick() {
    signUp.signUp(); // Redirects to Centia.io sign-up page
}
```

Token storage is SDK-managed via `CodeFlow`.

Forbidden:

- Hardcoded tokens
- Tokens in frontend `.env`
- Tokens committed to repo

---

## B) Server / Backend Applications

Examples:

- Node.js
- Serverless
- CLI
- MCP servers
- Provisioning scripts

Allowed auth methods:

- `PasswordFlow` from `@centia-io/sdk`
- `CENTIA_ACCESS_TOKEN` env var (for MCP / HTTP fallback)

Example:

```ts
import { PasswordFlow } from "@centia-io/sdk";

const flow = new PasswordFlow({
  host: process.env.CENTIA_HOST!,
  clientId: process.env.CENTIA_CLIENT_ID!,
  username: process.env.CENTIA_USERNAME!,
  password: process.env.CENTIA_PASSWORD!,
  database: process.env.CENTIA_DATABASE!, 
  clientSecret: process.env.CENTIA_CLIENT_SECRET,
});

await flow.signIn();
```

Credentials stored in:

.env

Used for:

- Provisioning
- Admin operations
- Service-to-service calls

`clientSecret` is only required for confidential clients.

---

## C) Provisioning Scripts

Provisioning always runs server-side.

Allowed:

- Access tokens
- MCP tools
- OpenAPI calls

Forbidden:

- OAuth flows
- Browser auth patterns

---

# 13) Auth Responsibility Split

| Context | Auth Method | SDK Class |
|--------|--------------|-----------|
| Browser app | OAuth Code Flow (PKCE) | `CodeFlow` |
| Browser signup | OAuth redirect | `SignUp` |
| Backend app | Username/password | `PasswordFlow` |
| Provisioning | Access token / password | `PasswordFlow` / MCP / HTTP |
| CLI tools | Username/password | `PasswordFlow` |

---

# 14) OpenAPI Access Policy

Preferred sources:

1. Local file: openapi/openapi.json  
2. URL: CENTIA_OPENAPI_URL  
3. User-provided JSON  

If allowed, fetch automatically:

```sh
mkdir -p openapi
if [ -n "$CENTIA_OPENAPI_URL" ] && [ ! -f "openapi/openapi.fetched.json" ]; then
  curl -fsSL \
    -H "Authorization: Bearer $CENTIA_ACCESS_TOKEN" \
    "$CENTIA_OPENAPI_URL" -o openapi/openapi.fetched.json
fi
```

OpenAPI is the contract for all endpoints it describes.

---

# 15) Documentation Access Policy

Primary docs:

https://centia.io/docs/intro

GitHub docs:

https://github.com/centia-io/website/tree/main/docs

If terminal + internet access is allowed:

```sh
mkdir -p vendor
if [ ! -d "vendor/centia-docs/docs" ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/centia-io/website.git vendor/centia-docs
  cd vendor/centia-docs
  git sparse-checkout set docs
  cd ../..
fi
```

Note: This assumes the repository is public. If the clone fails due to authentication, fall back to the web docs at https://centia.io/docs/intro.

Docs-backed endpoints allowed only when fully specified.

---

# 16) Safety Rules (Provisioning)

Before destructive changes, present plan:

- Method
- MCP tool / endpoint
- Purpose

Destructive includes:

- DROP TABLE
- TRUNCATE
- Column deletion
- Policy overwrite
- MCP `postSql` calls containing destructive SQL (DROP, TRUNCATE, DELETE without WHERE)
- MCP `deleteTable`, `deleteColumn`, `deleteSchema`, `deleteConstraint`, `deleteIndex`

Proceed only if explicitly requested.

---

# 17) Project Structure Standard

```
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

---

# 18) Code Quality Rules

- TypeScript strict mode preferred
- Centralize schema/table names
- Avoid magic strings
- Provide runnable examples
- Handle API errors clearly

Error handling pattern:

```ts
const { data, error } = await sql.from("users").select();
if (error) throw new Error(`Query failed: ${error.message}`);
```

---

# 19) Delivery Requirements

Every generated solution must include:

- Setup steps
- Env vars
- Install + run commands
- SDK usage explanation
- Provisioning steps
- Validation steps
- HTTP calls made (no secrets)

---

# 20) Available MCP Tools Reference

Schema management:

- `getSchema`, `postSchema`, `patchSchema`, `deleteSchema`

Table management:

- `getTable`, `postTable`, `patchTable`, `deleteTable`

Column management:

- `getColumn`, `postColumn`, `patchColumn`, `deleteColumn`

Constraints:

- `getConstraint`, `postConstraint`, `deleteConstraint`

Indexes:

- `getIndex`, `postIndex`, `deleteIndex`

Sequences:

- `getSequence`, `postSequence`, `patchSequence`, `deleteSequence`

Query execution:

- `postSql` — Execute arbitrary SQL (SELECT, INSERT, UPDATE, DELETE, MERGE)
- `postGraphQL` — Run GraphQL queries/mutations

RPC (see Section 9 for full workflow):

- `getRpc`, `postRpc`, `patchRpc`, `deleteRpc` — Manage method definitions
- `postCall` — Call an RPC method
- `postCallDry` — Dry-run a call (infer types, no side effects)
- `getTypeScript` — Get TypeScript interfaces for all dry-run methods

Auth & users:

- `postOauth`, `postDevice`
- `getUser`, `postUser`, `patchUser`, `deleteUsers`

Access control:

- `getRule`, `postRule`, `patchRule`, `deleteRule`
- `getPrivileges`, `patchPrivileges`

Clients:

- `getClient`, `postClient`, `patchClient`, `deleteClient`

File import:

- `postFileUpload`, `postFileProcess`

Other:

- `postCommit` — Commit schema changes to Git
- `getStats` — Get database statistics

---

# 21) Environment Variables

| Variable                | Context | Required | Description                                             |
|-------------------------|---------|----------|---------------------------------------------------------|
| `CENTIA_HOST`           | Server / provisioning | Yes | Centia API host (e.g. `https://api.centia.io`)          |
| `CENTIA_CLIENT_ID`      | Server / provisioning | Yes | OAuth client ID                                         |
| `CENTIA_CLIENT_SECRET`  | Server / provisioning | Yes | OAuth client secret                                     |
| `CENTIA_USERNAME`       | Server / provisioning | Yes | Database username for `PasswordFlow`                    |
| `CENTIA_PASSWORD`       | Server / provisioning | Yes | Database password for `PasswordFlow`                    |
| `CENTIA_DATABASE`       | Server / provisioning | Yes | Parent database name                                    |
| `CENTIA_ACCESS_TOKEN`   | MCP / HTTP fallback | No | Pre-issued access token (alternative to `PasswordFlow`) |
| `CENTIA_OPENAPI_URL`    | Development | No | URL to fetch OpenAPI spec from                          |
| `VITE_CENTIA_HOST`      | Browser apps (Vite) | Yes | Centia API host for frontend                            |
| `VITE_CENTIA_CLIENT_ID` | Browser apps (Vite) | Yes | OAuth client ID for frontend                            |
| `VITE_CENTIA_DATABASE`  | Browser apps (Vite) | Yes | Parent database name for frontend                       |

Never commit `.env` files containing secrets. Provide a `.env.example` with placeholder values.

---

# 22) Agent Self-Check

Before finishing:

- MCP tools used when available
- SDK used for JS/TS runtime code
- Provisioning separated from runtime
- No schema changes at startup
- OAuth used in browser apps
- No access token embedded in frontend
- Secrets protected
- OpenAPI followed where applicable
- Docs-backed endpoints fully specified
- Run instructions included
