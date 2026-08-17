---
name: centia-privileges
description: Sub-user privileges and rights inheritance for Centia BaaS, including per-table privilege grants, group membership via user_group, transitive inheritance where the highest privilege wins, schema ownership, and layer authentication levels.
---

# Privileges and Rights Inheritance

Use this skill when granting sub-users access to tables/layers, managing groups, or reasoning about which effective privilege a sub-user ends up with.

## Model

- Privileges are **per relation** (per `schema.table`), not schema-wide grants.
- A grant maps a sub-user *or group* name to a level: `none` | `read` | `write` (API values; internally ranked none=0 < read=1 < read/write=2).
- **Groups are themselves sub-users.** There is no separate group entity or membership endpoint — any sub-user name can act as a group.

## Endpoints and MCP tools

| Task | Route | MCP tool |
|---|---|---|
| Read grants for a table | `GET /api/v4/schemas/{s}/tables/{t}/privileges` | `getPrivileges` |
| Set grants | `PATCH .../privileges` with `{subuser, privilege}` (one or array) | `patchPrivileges` |
| Group membership | `user_group` field on `POST/PATCH/GET /api/v4/users` | `postUser` / `patchUser` / `getUser` |

`user_group` is a **JSON array of group names** (e.g. `["editors", "gis_admins"]`). A JSON-array *string* is accepted for back-compat; `null` clears membership; GET returns a decoded array (or null).

## Inheritance — highest privilege wins

Evaluation is fully server-side:

1. The full inheritance chain is resolved: the sub-user plus all ancestor groups, transitively (groups can belong to groups; breadth-first, diamond/cycle-safe).
2. Effective privilege on a table = the **highest** level found among the sub-user's own grant and every group in the chain.

Example: `joe` has `read` directly, is member of `editors` which has `write` → joe's effective privilege is `write`.

This applies to token auth, Basic-auth WFS/OWS, and SQL authorization alike.

## Schema ownership

A sub-user is **owner** of a schema if their own name — or any group in their transitive chain — equals the schema name. Owners bypass all privilege checks (full read/write on every layer in that schema). This is how schema-wide access is inherited: put the sub-user (directly or via intermediate groups) in a group named after the schema.

## Layer authentication levels

Orthogonal to per-user grants, each layer has an `authentication` level (capitalized values) deciding *when* grants are enforced:

| Level | Anonymous | Authenticated sub-user |
|---|---|---|
| `Read/write` | No read, no write (403) | Read requires privilege ≠ `none`; write requires `write` (owner bypasses) |
| `Write` | Read allowed | Read allowed for all; write requires `write` (owner bypasses) |
| `Read` / `None` | Read open | No per-user enforcement on read |

## Common mistakes

| Mistake | Reality |
|---|---|
| Expecting a schema-wide grant endpoint | Grants are per table; schema-wide access only via ownership (group named = schema) |
| `PATCH /users/{name}` without `default_user` | The flag is **reset to false** when omitted — always send it explicitly |
| Promoting a new default user first | Only one default user per parent db (partial unique index) → 23505; demote the old one first |
| Treating groups as a separate concept | Groups are sub-users; membership lives on the member's `user_group` field |
| Assuming grants alone control access | The layer's `authentication` level decides whether grants are even consulted |
| Expecting `200` from `patchPrivileges`/`patchUser` | Provisioning PATCH returns `303 See Other` (see `centia-provisioning`) |

Spec quirk: the `Privilege` schema's `required` list names `privileges` (plural) but the actual property is singular `privilege` — use the singular key.

Auth context selection (tokens, OAuth, service vs browser) is covered in `centia-auth-model`.
