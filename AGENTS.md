# Agent operator contract · 观天局 v0.3.0

## Roles

You operate experiments. You do not secretly replace the configured analysis mechanism, submit invented model outputs, or equate a human rating with factual verification. The server is authoritative; browser animation is read-only presentation.

Run `node lab/cli.mjs capabilities` first. Default origin is `http://127.0.0.1:4174`; override with `TAO_LAB_URL`.

## Commands

```bash
node lab/cli.mjs --help
node lab/cli.mjs list
node lab/cli.mjs create --title "Protocol experiment" --protocol v0.1
node lab/cli.mjs ingest RUN --file input.md --source "origin"
node lab/cli.mjs ingest RUN --file - < input.md
node lab/cli.mjs map RUN OBS
node lab/cli.mjs recover RUN TRACE --observation OBS
node lab/cli.mjs insight RUN OBS --operator gap
node lab/cli.mjs insight RUN OBS --operator all
node lab/cli.mjs status RUN
node lab/cli.mjs events RUN
node lab/cli.mjs feedback RUN INS --rating insightful --note "Reason"
node lab/cli.mjs evidence RUN H --text "New observed consequence" --source "origin" --stance unclear
node lab/cli.mjs branch RUN --protocol v0.1 --title "Blank comparison"
node lab/cli.mjs export RUN --out result.json
```

The `demo` command creates one fictional observation, without mapping it. It is suitable for interface smoke tests, not for evaluating model insight quality.

All commands return JSON. On failure the CLI prints `{"error":"...","code":"...","traceId":"...","details":{...}}` (optional diagnostic fields) to stderr and exits 2. Keep IDs from actual responses. The `create` and `demo` responses include `viewerUrl`; give that URL to the human to watch the same run.

## Live calls

Passing `--allow-live` is explicit permission to call the server-configured model and send the selected information to that endpoint. The server must separately have `TAO_LLM_ENABLED=1`. Never bypass that gate.

A mapping is one call. An insight is one call after a mapping exists. A request for all five lenses can be five calls; without a mapping it first maps. Existing results are reused. `--force` requests a fresh result and may incur a new call.

Do not retry an ambiguous timeout automatically. Inspect `status` and `events` first: the server may have retained completed work. HTTP errors and schema failures do not generate mock fallback answers. Trace records contain prompts, returned JSON, model, elapsed time and usage when available; no private chain-of-thought is requested.

## Local recovery (no model call)

Read the failed trace first. `recover RUN TRACE [--observation OBS]` revalidates only the saved final JSON against the original input. It does not ask the external agent to invent or edit model output. Recovery works while LLM access is disabled, keeps the historical `invalid` / `failed` status unchanged, and appends a result event with `recoveredFrom` and `modelCalled:false`.

An existing result is not overwritten unless `--force` is explicit; forcing a mapping does not regenerate old insights. A prior recovery is reused. Missing final content, truncated output, missing original input, or mismatched observation bindings cannot be recovered. A validation failure appends `operation.recovery.failed` without rewriting the old trace.

Errors distinguish `EVIDENCE_MISMATCH`, `LLM_TIMEOUT`, `LLM_OUTPUT_TRUNCATED`, `LLM_EMPTY_CONTENT`, `LLM_INVALID_JSON`, `LLM_HTTP_ERROR`, and recovery conflicts. Don't retry a charged call just because the browser has not flipped its cards. GET and refresh never initiate recovery or another call.

## Routes

- `GET /api/capabilities`, `GET /api/runs`
- `POST /api/runs` → `{title,protocol}`
- `POST /api/demo` → fictional demo run
- `GET /api/runs/:id`
- `POST /api/runs/:id/observations` → `{content,title?,source?}`
- `POST /api/runs/:id/observations/:obs/map` → `{allowLive?:boolean,force?:boolean}`
- `POST /api/runs/:id/observations/:obs/insight` → `{operatorId,allowLive?:boolean,force?:boolean}`
- `POST /api/runs/:id/traces/:trace/recover` → `{observationId?:string,force?:boolean}`
- `POST /api/runs/:id/feedback` → `{targetId,rating,note?}`
- `POST /api/runs/:id/hypotheses/:hyp/evidence` → `{content,source?,stance}`
- `POST /api/runs/:id/branch` → `{protocol?,title?}`
- `GET /api/runs/:id/export`
- `GET /api/events` → SSE `{type,runId,version,...}`; connect before acting to observe updates.

POST requests require `Content-Type: application/json`. Ratings: `insightful | known | stretch`. Evidence stance: `supports | challenges | unclear`; this is a human/operator assessment, not automatic confirmation. Operators: `gap | migration | scale | endgame | absence | all`.

## Comparison discipline

The branch endpoint copies only immutable observation records and captures a new prompt snapshot. It does not clone the old answers as new results. The requested protocol file must actually exist. Compare adapterVersion, validatorVersion, requestHash and effective parameters as well as protocolHash. The citation contract changed in 0.2.1 even though the Protocol text did not. Keep the model, input, exposure and cost conditions comparable when investigating a protocol change.

GET and animation replay never modify the run. Do not manipulate local files to produce an apparently valid score. Data is local JSON, not a multiprocess database: one server per data directory.


## v0.3 presentation

UI routes `view`, `stage`, `obs`, `note`, and `lens` select presentation only. They do not request model work. The web interface separates Home, a four-stage Table, Reading, Journal, Library, History, and Settings. CLI commands and the API remain unchanged. Reading an old trace, selecting a card, changing stage or replaying animation must not advance an experiment.
