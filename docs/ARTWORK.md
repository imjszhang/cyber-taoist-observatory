# Artwork and motion · v0.3.0

This release reuses all eleven local WebP card illustrations and all three SVG decorations from v0.2.1 byte-for-byte. No new generative artwork was required. The existing artwork originated in earlier generated material for this conversation. Card frames, labels, navigation and interactions are live HTML/CSS, not a flattened concept image.

No font binaries, external font services or downloaded third-party graphics are included. The redesigned pine/ink background, warm gold accents and typography use CSS and system fonts.

`home-preview.png`, `table-preview.png`, `lenses-preview.png`, `reading-preview.png` and mobile previews are captures of the actual implemented UI. In this restricted environment Chromium was rendered through the documented render bridge: original app HTML/CSS/JS, embedded local assets, requests forwarded to the actual Node server. These are not generated mockups. The original v0.2 GIF has been removed to avoid representing it as the v0.3 interface.

Card selection is a fixed reasoning direction. Animation, particles and optional synthesized sound do not choose an answer, score an insight or trigger a model call. `effects.js` is unchanged; reduced-motion handling is preserved and supported by the new CSS.

References for browser primitives:
- https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
