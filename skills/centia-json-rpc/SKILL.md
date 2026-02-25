---
name: centia-json-rpc
description: JSON-RPC method lifecycle for Centia BaaS, including method creation, invocation, dry-run type inference, TypeScript interface generation, and runtime usage with createApi or Rpc.
---

# JSON-RPC Workflow

Use this skill when creating, updating, testing, or calling Centia JSON-RPC methods.

## Purpose

JSON-RPC wraps SQL in named server-side methods for reuse, consistency, and central control.

## Define method (provisioning)

Use `postRpc`.

Parameter style:

- `:param`
- `:param::type` (required for type inference)

Example:

```txt
postRpc({
  method: "addDays",
  q: "select date(:date) + :days::int as result",
  type_hints: { date: "timestamptz" },
  type_formats: { result: "l jS F Y" }
})
```

Manage definitions with:

- `getRpc`
- `postRpc`
- `patchRpc`
- `deleteRpc`

## Call method

Use `postCall` with JSON-RPC 2.0 envelope.

```txt
postCall({
  jsonrpc: "2.0",
  method: "addDays",
  params: { date: "2025-05-01", days: 7 },
  id: "1"
})
```

- Omit `id` for notification mode.
- `params` can be object or array of objects for batch calls.

## Dry-run and TypeScript inference

1. Dry-run method with `postCallDry`.
2. Fetch generated interfaces with `getTypeScript`.
3. Save interface (for example `src/baas/api.ts`).
4. Use at runtime with `createApi<Api>()`.

Important: SQL params must include explicit casts (`:param::type`) to infer method signatures reliably.

## Runtime usage

Preferred typed call:

```ts
const api = createApi<Api>();
const rows = await api.getX({ x: 1 });
```

Fallback generic call:

```ts
await rpc.call({ jsonrpc: "2.0", method: "getX", params: { x: 1 }, id: 1 });
```

## Error codes to recognize

- `-32600` invalid request
- `-32601` method not found
- `-32602` invalid params
- `-32603` internal error