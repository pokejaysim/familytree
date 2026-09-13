# Sim Family Tree — two-second login splash

An animated version of the tree emblem from your existing asset pack: roots reveal, seven leaves open, the title fades in, and everything clears.

Open `web/index.html` after unzipping for a working browser preview. It plays once and has a Replay button.

## Files
- `sim-family-tree-splash-2s.mp4`: silent 1280 × 720, 60 fps, exactly 2.00 seconds.
- `poster.png`: the completed mark and title.
- `web/sim-family-splash.js`: lightweight, responsive website implementation with the exact approved vector mark inline. No image fetch, video player, framework, or external library is needed.
- `native/build.mjs` and `native/project/`: editable Higgsedit composition and source paths.
- `assets/tree-mark.svg`: original emblem from the preceding asset pack.
- `validation.json`: measured export and browser checks.

## Add it to your website
Load `web/sim-family-splash.js`, then call `showSimFamilySplash()` after a successful, approved login, once the destination view is ready underneath. The function returns a Promise that resolves when the splash has been removed.

```html
<script src="/assets/sim-family-splash.js"></script>
```

```js
// In your existing successful-login flow, once the destination view is ready:
await showSimFamilySplash();
```

The splash does not implement authentication, route changes, or account approval. It is a decorative overlay for the existing flow. Do not trigger it on a failed login or repeat it during ordinary navigation. Start data loading before the splash, not after waiting for it.

Duplicate calls while it is playing share the same Promise. It never moves keyboard focus. It cleans up on animation completion, with a 2.2-second fallback if the browser fails to emit the completion event, and cleans up immediately if the tab becomes hidden. Reduced-motion users skip it entirely. There is no automatic loop or audio.

The web title uses Georgia/Times/serif by default, matching the website's existing classic direction. Set `--sft-title-font` on the document to your site's existing serif family if desired. The MP4 uses Playfair Display in the native renderer. The emblem and animation timing are shared; font metrics and easing may differ slightly between the web and native renderer.

## Timing
- 0.04–0.48 s: roots and trunk reveal.
- 0.18–0.82 s: leaves unfold; gold leaf finishes the tree.
- 0.58–1.02 s: title fades upward into place.
- 0.82–1.10 s: short gold line appears.
- 1.10–1.65 s: calm hold.
- 1.65–2.00 s: fade away to the website.

The MP4 fades back to ivory; the web implementation removes the overlay to reveal your application. The package is ready for integration; the live website has not been edited.
