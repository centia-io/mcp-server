---
name: centia-realtime
description: Realtime events via WebSocket for Centia BaaS using @centia-io/sdk, including broadcast connections, subscriptions with shapes, event handling, and enabling table-level change events.
---

# Realtime Events

Use this skill for WebSocket-based realtime database change events.

## Hard rules

- Use `Ws` from `@centia-io/sdk` for all realtime connections.
- Do not implement raw WebSocket connections in runtime app code.
- Never hardcode tokens in connection URLs.
- Always use `encodeURIComponent` if building URLs manually (the SDK handles this).

## Architecture

- WebSocket endpoint: `wss://event.centia.io/`
- Auth: JWT token passed as query parameter.
- Server validates the token and enforces per-relation access for sub-users.
- Events are batched (10 notifications or 2 seconds, whichever comes first).

## SDK bootstrap

```ts
import { Ws } from '@centia-io/sdk';

const ws = new Ws({
    host: 'wss://event.centia.io',
    rels: 'schema.table1,schema.table2',  // optional: broadcast filter
    reconnect: true,                       // default: true
    reconnectInterval: 3000,               // default: 3000ms
});

ws.connect();
```

### Options

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `host` | string | yes | - | WebSocket endpoint URL |
| `rels` | string | no | - | Comma-separated relations for broadcast filtering |
| `wsClient` | unknown | no | `WebSocket` | Custom WebSocket implementation (e.g. `ws` for Node) |
| `reconnect` | boolean | no | `true` | Auto-reconnect on disconnect |
| `reconnectInterval` | number | no | `3000` | Reconnect delay in ms |

## Event listeners

The `Ws` class uses a typed event system. `on()` returns an unsubscribe function.

```ts
ws.on('open', () => { /* connected */ });

ws.on('batch', (msg) => {
    // msg.db, msg.batch
    for (const [rel, data] of Object.entries(msg.batch[msg.db])) {
        if (data.INSERT) { /* handle inserts */ }
        if (data.UPDATE) { /* handle updates */ }
        if (data.DELETE) { /* handle deletes */ }
        if (data.full_data) { /* full row data */ }
    }
});

ws.on('subscription_ack', (msg) => {
    // msg.id — matches the subscription id
});

ws.on('error', (msg) => {
    // msg.error: 'missing_token' | 'invalid_token' | 'not_allowed'
    // msg.message: human-readable
});

ws.on('close', ({ code, reason }) => { /* disconnected */ });

// Unsubscribe
const unsub = ws.on('batch', handler);
unsub(); // removes listener
```

## Subscriptions with shapes

Subscriptions provide server-side filtering so the client only receives matching events. Send after the connection is open.

```ts
ws.on('open', () => {
    ws.subscribe({
        id: 'active-users',
        schema: 'public',
        rel: 'users',
        where: "status = 'active' AND age >= 18",
        columns: 'id,name,email',
        op: 'UPDATE',
    });
});
```

### Subscription fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Client-chosen identifier |
| `schema` | string | yes | Database schema name |
| `rel` | string | yes | Table name |
| `where` | string | no | SQL-like filter on `full_data` rows |
| `columns` | string | no | Comma-separated column projection |
| `op` | string | no | Limit to `INSERT`, `UPDATE`, or `DELETE` |

### Where syntax

Supports: `=`, `!=`, `<>`, `>`, `<`, `>=`, `<=`, `AND`, `OR`, parentheses, `IN`/`NOT IN`, `LIKE`/`ILIKE`.

### Multiple subscriptions

A single client can register multiple subscriptions:

```ts
ws.subscribe({ id: 'sub1', schema: 'public', rel: 'orders' });
ws.subscribe({ id: 'sub2', schema: 'public', rel: 'users', op: 'INSERT' });
```

## Enabling table events (provisioning)

To emit change events for a table, enable `emit_events` via the events endpoint. This is a provisioning operation.

Use MCP tool `postEvents` or HTTP:

```http
PATCH https://api.centia.io/api/v4/schemas/{schema}/tables/{table}/events
Content-Type: application/json
Authorization: Bearer <token>

{
  "emit_events": true
}
```

## Broadcast vs subscriptions

| Feature | Broadcast (legacy) | Subscriptions |
|---|---|---|
| Setup | Pass `rels` in constructor | Call `ws.subscribe()` after connect |
| Filtering | Client-side only | Server-side (where, columns, op) |
| Use case | Simple monitoring | Production apps needing efficiency |

Prefer subscriptions for new code. Broadcast is supported but sends all events for matched relations.

## Node.js usage

Pass a WebSocket implementation for non-browser environments:

```ts
import WebSocket from 'ws';
import { Ws } from '@centia-io/sdk';

const ws = new Ws({
    host: 'wss://event.centia.io',
    wsClient: WebSocket,
});
```

## Lifecycle

```ts
ws.connect();           // start connection
ws.connected;           // boolean — check state
ws.send('SELECT 1');    // send raw message
ws.disconnect();        // close and stop reconnecting
```

## Exported types

All types are available from `@centia-io/sdk`:

```ts
import type {
    WsOptions,
    WsMessage,
    BatchMessage,
    TableBatch,
    SubscriptionAckMessage,
    WsErrorMessage,
    SubscriptionRequest,
} from '@centia-io/sdk';
```
