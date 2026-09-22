---
name: centia-scheduler
description: Use when creating or managing automated data imports in Centia BaaS — /api/v4/scheduler jobs and runs, the SchedulerJob/SchedulerRun tools, five-field cron schedules, WFS/file import jobs, starting or stopping runs manually, monitoring run status/heartbeat/stale, or queueing snapshots after imports.
---

# Scheduler (automated imports)

Use this skill for the v4 Scheduler API: cron-scheduled import jobs (`/api/v4/scheduler/jobs`) that a worker executes with ogr2ogr, and the runs that track each execution (`/api/v4/scheduler/runs`).

## Availability and access

On GC2 local master as of 2026-09 — **not** on production `api.centia.io`. MCP tools ship with `@centia-io/mcp-server` >= 1.0.25 (restart the server after upgrading the spec). No `@centia-io/sdk` class as of 0.2.16 — use the MCP tools or spec-backed HTTP. **Super-user only** (`Scope::SUPER_USER_ONLY` on both jobs and runs): a sub-user token gets 403.

## Jobs

| Operation | Route / MCP tool | Result |
|---|---|---|
| List / get | `GET /api/v4/scheduler/jobs/{id}` / `getSchedulerJob` — omit `id` to list all jobs of the database (bare array); one id or a comma list (`5497,5498`) | `200`; `404` `JOB_NOT_FOUND` |
| Create | `POST .../jobs`, body = one job **or an array** / `postSchedulerJob` | `201` + `Location: .../jobs/{id[,id…]}` (empty body — parse Location for ids). Arrays are **all-or-nothing** |
| Update | `PATCH .../jobs/{id}` (single id), partial body / `patchSchedulerJob` | `303` + `Location` |
| Delete | `DELETE .../jobs/{id[,id…]}` / `deleteSchedulerJob` — **all ids are checked before anything is deleted** | `204`; `404`; `409` `JOB_RUNNING` while any listed job has a running run |

Required on create: `name`, `schema`, `url`, `schedule` (five-field cron `min hour dom month dow`, e.g. `0 3 * * *`; bad field → 400 `INVALID_CRON_FIELD`). Defaults: `epsg` 4326, `type` "AUTO", `encoding` "UTF8", `delete_append` false, `download_schema` true, `active` true, `snapshot` false. **The imported table is named after the job, and the name is normalised on write** (ASCII, lower-case, separator runs → `_`; "Bygninger 2026-09" → `bygninger_2026_09`) — read the job back to see the stored name. `snapshot: true` queues a snapshot of the table after each successful import; `snapshot_formats` (array of `parquet`/`flatgeobuf`, nullable) picks its formats, `null`/omitted = server default, and an explicit `null` on PATCH resets it (see `centia-snapshots`). Read-only fields: `id`, `lastcheck`, `lasttimestamp`, `lastrun`, `report`.

## Runs

| Operation | Route / MCP tool | Result |
|---|---|---|
| List / get | `GET /api/v4/scheduler/runs/{uuid}` / `getSchedulerRun` — omit `uuid` to list (running first, then the newest 50 finished); filters `?job=` and `?status=` | `200`; `404` `RUN_NOT_FOUND` |
| Start now | `POST .../runs`, body `{job, force?}` / `postSchedulerRun` | `202` `{job, status: "starting", _links.runs}` — **asynchronous**: poll the runs list for the new run; `404` `JOB_NOT_FOUND`; `409` `JOB_RUNNING` |
| Stop | `DELETE .../runs/{uuid}` / `deleteSchedulerRun` | `200` `{uuid, signal: "SIGINT"}` — SIGINT, escalated to SIGKILL after 30 s (the call can take ~30 s; mind timeouts); `404` (only *running* runs can be stopped); `409` `RUN_ON_OTHER_HOST` (multi-host: the request must land on the host running it — retry) |

Run fields: `uuid`, `job`, `name`, `pid`, `host`, `slot`, `status` (`running`/`succeeded`/`failed`/`skipped`/`lost`), `stale` (true = running with no heartbeat or start signal for 5 minutes — candidate for stopping), `started_at`, `heartbeat`, `finished_at`, `exit_reason`.

**Cooldown:** cron-scheduled runs respect the server's `gc2scheduler.minInterval` (a job that ran more recently is skipped by the picker). A manual `postSchedulerRun` **bypasses** the cooldown — the only guard is the 409 while a run is in flight. `force: true` makes the run **ignore `delete_append` and overwrite** the target table (full reload) — data a normal append run would preserve is replaced.

## Common mistakes

| Mistake | Reality |
|---|---|
| Assuming production availability | GC2 local master only as of 2026-09; MCP tools need spec >= 1.0.25 + server restart |
| Using a sub-user token | Both jobs and runs are super-user only → `403` |
| Expecting the job object from POST | `201` with empty body; ids are only in the `Location` header (comma list for arrays) |
| Treating the `202` from a manual start as "import done" | It means "starting" — poll `getSchedulerRun` until the run leaves `running` |
| Assuming the stored job name equals what was sent | Normalised on write; the imported table is named after the normalised name |
| "There is no cooldown" / "manual runs are throttled" | Cron runs respect `gc2scheduler.minInterval`; manual starts bypass it |
| Casual `force: true` | It overrides `delete_append` and overwrites the table |
| Deleting jobs while one is importing | `409` `JOB_RUNNING`, nothing deleted — stop the run or wait |
