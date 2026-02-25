---
name: centia-runtime-sdk
description: Runtime application guidance for Centia BaaS using @centia-io/sdk, including SDK client initialization, GraphQL/JSON-RPC/SQL method selection, HTTP fallback boundaries, and frontend tooling defaults.
---

# Runtime SDK Rules

Use this skill for JS/TS runtime application work.

## Hard rules

- Use `@centia-io/sdk` for runtime access.
- Do not use direct REST calls in runtime app code.
- If SDK lacks needed functionality, implement a documented fallback in `src/baas/http.ts`.

## Query method selection

Choose in this order:

1. GraphQL (`Gql`) for straightforward CRUD, filtering, pagination, nested relations.
2. JSON-RPC (`createApi<T>()` or `Rpc`) for reusable complex SQL (joins, CTEs, aggregations).
3. SQL (`Sql` and `createSqlBuilder`) as last resort for runtime-dynamic queries.

## SDK bootstrap

Create shared clients in `src/baas/client.ts`.

Prefer exports:

- `Sql`
- `Rpc`
- `Gql`
- `createApi`
- `createSqlBuilder`
- `CodeFlow`, `PasswordFlow`, `SignUp` (by runtime context)

## GraphQL notes

Auto-generated naming conventions by table:

- Select: `get[TableName]`
- Insert: `insert[TableName]`
- Update: `update[TableName]`
- Delete: `delete[TableName]`

Filtering operators:

- Comparison: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `like`, `ilike`
- Logical: `and`, `or`, `not`

## SQL builder pattern

Prefer typed SQL builder for dynamic conditions:

```ts
const b = createSqlBuilder(schema);
let req = b.table("logs").select(["id", "message"]);
if (level) req = req.andWhere({ level });
if (since) req = req.andWhere({ created_at: { gte: since } });
const rows = (await sql.exec(req.toSql())).data;
```

## HTTP fallback layer

File: `src/baas/http.ts`

Rules:

- Centralize headers.
- Use typed payloads.
- Prevent token leakage.
- Add source comments for each fallback endpoint.

Comment template:

```ts
// Fallback to HTTP: not supported in @centia-io/sdk yet
// Source: https://centia.io/docs/...
```

## Web app defaults when scaffolding

Use these defaults only if project has no existing conventions:

- Package manager: `pnpm`
- Build tool: `Vite`
- Framework: React + TypeScript
- Styling: Tailwind CSS
- Routing: React Router

Do not mix package managers.

## Code quality

- Prefer TypeScript strict mode.
- Centralize schema and table names.
- Avoid magic strings.
- Handle API errors explicitly.