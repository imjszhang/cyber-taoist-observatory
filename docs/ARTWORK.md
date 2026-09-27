# Artwork and motion

The eleven WebP card illustrations were derived from artwork newly generated for this conversation, cropped into separate illustration regions and resized. The full generated interface concept is not used as a functioning screenshot and is not embedded in the product: its decorative sample news and UI labels are not app data.

The card frames, typography, states, buttons and all interaction are live HTML/CSS. `card-back.svg`, `sigil.svg` and `mountains.svg` are locally authored vector decorations. No font binaries or third-party downloaded graphics are bundled.

Meaning is independent of decoration. A card always addresses a fixed operator or concept. Card flip, card order, particles and synthesized sound do not choose an answer, create evidence, improve a score or trigger an extra model request.

The screenshots in this folder are captures of the implemented app. `deal-preview.gif` is a capture of its actual animation, not a rendered mock interface.

Animation implementation references:
- https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion

The app uses native Web Animations, CSS 3D transforms, Canvas 2D and optional Web Audio. Effects stop when the document is hidden and can be reduced by the user. No external animation dependency is required.
