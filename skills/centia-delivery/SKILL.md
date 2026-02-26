---
name: centia-delivery
description: Delivery and validation checklist for Centia tasks, including required output sections, MCP tool reference, geospatial mapping library selection, and final self-check criteria.
---

# Delivery Checklist

Use this skill before finalizing Centia-related implementation work.

## Required delivery content

Include:

- setup steps
- env vars used
- install and run commands
- SDK usage explanation
- provisioning steps (if applicable)
- validation steps
- HTTP calls made (without secrets)

## MCP tool reference

Schema and tables:

- `getSchema`, `postSchema`, `patchSchema`, `deleteSchema`
- `getTable`, `postTable`, `patchTable`, `deleteTable`
- `getColumn`, `postColumn`, `patchColumn`, `deleteColumn`
- `getConstraint`, `postConstraint`, `deleteConstraint`
- `getIndex`, `postIndex`, `deleteIndex`
- `getSequence`, `postSequence`, `patchSequence`, `deleteSequence`

Query and API:

- `postSql`
- `postGraphQL`
- `getRpc`, `postRpc`, `patchRpc`, `deleteRpc`
- `postCall`, `postCallDry`, `getTypeScript`

Auth and access:

- `postOauth`, `postDevice`
- `getUser`, `postUser`, `patchUser`, `deleteUsers`
- `getRule`, `postRule`, `patchRule`, `deleteRule`
- `getPrivileges`, `patchPrivileges`
- `getClient`, `postClient`, `patchClient`, `deleteClient`

Metadata:

- `getMetaData`, `patchMetaData`

Import and misc:

- `postFileUpload`, `postFileProcess`
- `postCommit`
- `getStats`

## Mapping library selection

For map UIs:

- Default to MapLibre GL JS for straightforward map display and interaction.
- Use Leaflet or OpenLayers for advanced interaction or GIS-heavy needs.
- Prefer current docs lookup (for example Context7 MCP when available) before writing mapping code.

## Final self-check

- Used MCP tools where possible.
- Used SDK for runtime JS/TS.
- Kept provisioning separate from runtime.
- Avoided runtime schema changes.
- Used correct auth flow for context.
- Kept secrets out of source control.
- Followed OpenAPI/docs contract where HTTP was used.