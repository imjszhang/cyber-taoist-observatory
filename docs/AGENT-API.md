# Agent API v1 / MCP profile — v0.4.0

Implementation: `lab/agent-contract.mjs` (authoritative schemas), `agent-service.mjs`, `agent-client.mjs`, `mcp.mjs`, `agent-cli.mjs`.

## Driver / ownership

Legacy runs remain local until an explicit attach. A controlling session sets `run.driver.kind=external`. Built-in map, insight and recover operations return a driver error while external, including inside the per-run write lock. Explicit local switch revokes writers, cancels queued/leased jobs, and does not invoke a model.

One active writer per run, optional observers. Sessions do not cross run boundaries. `observationId` in a session is an initial UI focus only; permission scope is the run. User selection is enforced by issued jobs in Guided.

## Local owner routes (same trust as existing Web/CLI)

| Method / route | Behavior |
|---|---|
| GET `/api/agent/setup` | Executable paths, real local base URL, contracts and limits |
| GET `/api/agent/sessions?runId=...` | Redacted metadata, no token/code |
| POST `/api/agent/sessions` | `{runId, observationId?, role?, mode?, ttlHours?, maxJobs?}`; returns one-time pairing data |
| POST `/api/agent/sessions/:id/revoke` | Revoke credential + cancel pending jobs |
| POST `/api/runs/:id/driver` | `{kind:"local"}` only; explicit switch |
| POST `/api/runs/:id/agent-jobs` | Human `{observationId,kind,operatorId?,force?}` |
| POST `/api/runs/:id/agent-jobs/:job/cancel` | Cancel task; reject late completion |

These are trusted-local controls, **not user-login protected admin APIs**. Supplying an Agent Bearer on an owner route is rejected; a same-machine shell caller without that header is still a trusted local operator. This is not a sandbox. Host/Origin/JSON checks are defense-in-depth, not remote deployment authentication.

## Scoped routes

POST `/api/agent/connect` with one-time `{code,client?:{name,version,model}}` returns `{accessToken,session,apiVersion}`. Metadata self-reported. Credentials are never passed to a model provider by the Lab.

GET `/api/agent/status`, POST `/api/agent/heartbeat`, POST `/api/agent/tools/:toolName` require `Authorization: Bearer ...`. Tool body is its argument object, not JSON-RPC. Host and Origin checks still apply.

Persistent store: `.tao-lab/agent/sessions.json` contains token hashes; run files contain hashes of active lease tokens. UI exports do not include raw access/claim tokens or pairing codes. Do not consider hash metadata anonymized. Actual credentials live in the client connection file; task claim responses naturally contain a claimToken.

## MCP stdio

`node lab/mcp.mjs --connection PRIVATE_FILE [--url LOCAL_BASE --pair ONE_TIME_CODE] [--name NAME] [--model SELF_REPORTED]`.

UTF-8 newline-delimited JSON-RPC. stdout only protocol; stderr diagnostics. Implements initialize/version negotiation, initialized notification, ping, tools/list + tools/call, resources/list + templates/list + read, prompts/list + get, cancellation notifications. No sampling, no subscriptions, no remote HTTP MCP, no background AI worker.

Supported protocol versions: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05. Unknown version proposes 2025-11-25; the host decides compatibility. Closing stdin shuts down the bridge. Input line limit 1.5 MB. Empty lines ignored; batches unsupported. Result tool errors use `isError:true` with structured error; JSON-RPC dispatch errors use `error`.

Tools (all prefixed `observatory_`):

| Name | Read/write behavior |
|---|---|
| `status` | Read connection/run summary |
| `get_context` | Read theory/observations/schemas; appends context-delivered audit, does not prove compliance |
| `next_task` | Atomically claim one queued/reclaimable task, optional bounded wait |
| `submit_result` | Validate and commit / retain rejected attempt |
| `renew_task` | Extend active claim, bounded by connection expiry |
| `release_task` | Requeue job, invalidate old claim token |
| `request_task` | Autopilot only, bounded by human-issued job quota |
| `events` | Read durable sequence cursor; optional bounded wait |
| `ingest` | Operator: append raw text, no URL fetch |
| `attach_evidence` | Append Agent-labelled evidence relationship |
| `branch_run` | Operator: blank child with same material + frozen theory; requires new authorization |

Resources: `tao://context`, `tao://constitution`, `tao://protocol`; prompt: `observe_with_my_agent`.

## Job lifecycle

```text
queued → claimed → completed
             ↘ needs_revision → completed / failed
queued / claimed / needs_revision → cancelled
claimed / needs_revision --lease expires--> reclaimable
```

Expiry is derived from leaseUntil, not a fake completion event. An expired lease can be reclaimed using next_task; this rotates the token. Multiple calls cannot both claim the same task. Default lease 15 min, optional renewal. Terminal completed jobs are not reclaimed. At most 3 rejected attempts per job; expired/cancelled/scope errors are not analytical attempts.

Limits: pairing 10 min, session 1–24h, total budget 1–50 jobs, bounded waits 0–25s. Cancelled jobs still consume issued budget. Duplicate queued requests reuse the task; existing results are reused unless the human explicitly requests force. New jobs never auto-call the Lab model.

Task context includes full raw source, exact Constitution and Protocol, content hashes, output schema, and prerequisite mapping (for insight) plus its hash. Submission checks current source/theory/mapping still match. Delivering the context is not proof that the model followed it.

Submission envelope:

```json
{
  "jobId": "job_...",
  "claimToken": "temporary secret",
  "contextHash": "sha256...",
  "idempotencyKey": "one-attempt-key",
  "result": {"mapping": {}}
}
```

The empty mapping above is **invalid**, shown only to illustrate envelope nesting. Use the real task schema and generated six-card object.

## Results / errors

Accepted records include session/job/submission/context/protocol provenance. `run.mappingMeta` or insight `provider` is external. `agentSubmissions` retains original structured result + error or commit summary. Normal model `traces` remain separate. Short explanations required by output schema are not a request for hidden reasoning.

Schema validation is structural, evidence validation checks original excerpts, and N cannot be labelled OBSERVED. These do not independently establish facts, causality or full adherence to the theory.

Common codes: `AUTH_REQUIRED`, `AUTH_INVALID`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `PAIR_INVALID`, `PAIR_RATE_LIMIT`, `ROLE_FORBIDDEN`, `DRIVER_MISMATCH`, `HUMAN_REQUEST_REQUIRED`, `JOB_BUDGET_EXCEEDED`, `MAPPING_REQUIRED`, `CLAIM_INVALID`, `LEASE_EXPIRED`, `CONTEXT_MISMATCH`, `STALE_CONTEXT`, `IDEMPOTENCY_CONFLICT`, `SCHEMA_INVALID`. Other quote validation codes come from the existing validator; use returned message/path rather than matching human prose. Failed analytical submissions return HTTP 422 + remainingAttempts. Never silently fall back.

Web uses existing `/api/events` SSE and periodic sync. This is **not MCP SSE**. Receipt playback and page reads do not invoke analysis. Server tracks event ordering, not authentic hidden model computation.
