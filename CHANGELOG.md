# v0.2.0 · 观天牌桌

## Visual and interaction

11 illustrated cards, one shared illustrated back, gold/ink styling, orbit layout, card dealing and 3D flips, pointer tilt and foil, selected-card elevation, ambient stars, particle feedback and opt-in synthesized audio. Added four-step guidance, evidence-side card inspection, result reveals, library, journal and timeline. Responsive desktop/mobile layout and reduced-motion support. No randomness is used to determine conclusions.

## Functional corrections and preservation

Preserved the original Protocol v0.1 without edits. Included verified Constitution v1.0.1 snapshot and actually assembled both into live requests. Added explicit demo/template/live mode labels and a live-model switch, rather than hard-coding `allowLive:false` in the UI. Added a specific fictional teaching case, while keeping generic baseline output visibly limited.

Added actual browser updates through SSE plus fallback reads, atomic JSON writes, per-run write serialization, result reuse, strict schemas and error traces, source quote checks for OBSERVED mappings, evidence attachments, and branches with clean analysis state. Old v0.1 records remain readable. Removed package scripts pointing to absent `tools/` files in the v0.1 standalone ZIP.

## Still intentionally out of scope

No automatic web scraping, OCR/PDF ingestion, auto-verification of hypotheses, scientific quality scores, hidden reasoning extraction, background agents, comprehensive blind A/B scoring, or production deployment. A live provider has not been exercised with real credentials in this build; mock adapter tests cover its HTTP/JSON contract.
