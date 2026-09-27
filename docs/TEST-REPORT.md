# v0.2 validation report

Date: 2026-09-26. Runtime: Linux, Node.js 22.16.0, Chromium through Playwright.

## Automated server / CLI: 20 passed, 0 failed

Command: `npm test`. No npm dependencies or paid model calls.

Coverage:

- Capabilities, actual eleven illustration files and correct static MIME types.
- Reads do not create runs or change versions.
- Original text is preserved exactly, including whitespace and literal HTML.
- Generic baseline remains visibly limited and uses UNKNOWN.
- Fictional demo completes six mappings, five distinct insights and five hypotheses.
- Existing map/insight reuse does not double-call or duplicate results.
- Invalid operators, ratings and source inputs are rejected.
- Human ratings do not mark hypotheses true.
- Supporting/challenging evidence preserves original hypotheses and prior evidence.
- A branch copies observations only and captures a real prompt snapshot.
- Nonexistent protocol labels are rejected.
- Concurrent writes are serialized within one server process.
- Explicit LLM opt-in; disabled LLM fails rather than falling back silently.
- Mock live endpoint contract, source quotes, context injection, usage and traces.
- Duplicate concurrent live requests do not generate duplicate calls.
- Malformed JSON or unsupported OBSERVED quotes produce visible error records.
- Actual SSE event publication matches the run revision.
- Cross-origin writes, hostile Host headers, unsupported content types and traversal are rejected.
- Old v0.1 records remain readable.
- Actual CLI subprocess produces JSON, returns nonzero errors and exports files.

## Browser interactions: 16 checks passed, 0 uncaught page errors

- Initial deck and card slots.
- Demo start, deal, flip and specific six-part mapping.
- Replaying the animation leaves the run version unchanged.
- Click-to-flip evidence side.
- Lens selection, explicit exploration and result reveal.
- Human feedback selection and persistence.
- Manual reality evidence and challenge display.
- All five operators and journal entries.
- Eleven-card library and explanatory modal.
- Blank comparison run.
- Raw HTML in imported content does not execute.
- Generic imported material remains UNKNOWN in baseline.
- CLI observation appears in the same UI run.
- Reduced-motion preference responds dynamically.
- 390px mobile table has no horizontal overflow.
- Mobile result modal scrolls without horizontal overflow.

## Browser environment limitation

The provided Chromium has an administrator URL blocklist, so direct browser navigation to localhost was unavailable in this execution environment. No policy was modified. The test used `tests/render_bridge.py`: the actual HTML, CSS and JS were rendered in `about:blank`, artwork was inlined, and fetch requests were forwarded to the real local HTTP server. This exercises real state changes and the UI polling fallback. Real SSE behavior is separately covered by the Node integration test.

For a normal browser environment, `python tests/ui_smoke.py --url http://127.0.0.1:4174` navigates directly to the server. The optional `--bridge` mode recreates this report's restricted-environment harness. Playwright is only an optional test dependency, not a product dependency.

The saved screenshots and animated preview show the implemented interface. They are not the generated concept image.

## Not claimed as tested

- No commercial LLM endpoint was exercised with real credentials or billed requests. Success/failure adapter paths were tested with a local mock endpoint. Provider-specific compatibility and output quality still require an actual key and model.
- No macOS or Windows runtime was available for native testing. The product uses Node built-ins and browser APIs, but cross-platform behavior beyond the recorded environment is not asserted as verified.
- No measurement of scientific insight quality, prediction accuracy or general theoretical validity was performed.
- No cross-process shared-storage guarantees, public hosting security audit or long-term automatic evidence collection.

## Content integrity

The bundled `CONSTITUTION.md` exactly matches Git blob `10cbce67155b843800e09af93d7d158a96179b49` from the pinned source commit. `PROTOCOL-v0.1.md` is byte-identical to the supplied v0.1 ZIP. UI/engine version 0.2 does not silently upgrade the theory or protocol.
