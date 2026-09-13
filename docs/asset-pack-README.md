# Sim Family Tree asset pack

A warm botanical companion to your existing forest-green header, ivory canvas, classic typography, and softly coloured generation badges. Created from the screenshot supplied on September 12, 2026. This is an asset handoff; no live website was changed.

## Start here
Open `preview/index.html` in a browser after unzipping. It shows the finished assets at practical sizes. `preview/asset-board.png` is a shareable overview.

## Included
- Three Higgsfield illustrations: heritage tree, first branch, and family archive.
- Original high-resolution PNG generations, including the generated tree-emblem concept.
- Website exports of the three illustrations in PNG and in WebP at 1200px and 640px wide.
- A hand-drawn vector companion to the generated tree-emblem concept: forest/gold, light/gold, and monochrome. It is a simplified redraw, not an exact automatic trace.
- SVG favicon, ICO, PNG icons at 16, 32, 48, 180, 192 and 512 pixels, plus an Apple touch icon.
- Twelve scalable interface icons, a reusable SVG sprite, and fixed forest-colour versions.
- A botanical divider, scoped CSS colour tokens, palette JSON, and an integration example.

## Where to use the artwork
| Asset | Suggested placement | Typical display width |
| --- | --- | --- |
| `brand/tree-mark.svg` | Next to the existing header title | 28–36px |
| `brand/tree-mark-light.svg` | Dark green header | 28–36px |
| `illustrations/heritage-tree-1200.webp` | Welcome or sign-in page | 480–720px |
| `illustrations/first-branch-640.webp` | No family tree yet / add first relative | 180–260px |
| `illustrations/family-archive-640.webp` | Sources page or no records yet | 240–360px |
| `brand/branch-divider.svg` | Introductory page section | 160–240px |
| `icons/` | Map, people, sources, navigation and actions | 20–24px |

Keep the main pannable map on a quiet ivory background; large artwork is best on welcome and empty-state pages. Use the same initial badges for unknown portraits rather than inventing relatives' faces. Colour can reinforce generations, but keep labels and relationship lines available too.

## Image backgrounds and format choices
Illustration web exports have an opaque warm ivory background matched to `#FAF8F4`. They are not transparent cutouts. PNG originals retain the generated background. The vector marks, divider and interface icons have transparent backgrounds; the favicon intentionally has a rounded forest-green tile.

Use WebP on the website, with the matching PNG as a fallback where needed. Use the original PNGs for future editing. Every supplied SVG contains actual vector paths; none embeds a bitmap. No fonts or third-party scripts are needed to view the pack.

## Interface icons
`icons/name.svg` uses `currentColor` when inserted inline. A CSS colour from the parent page does not flow into an SVG loaded via an `img` element; for `img` use `icons/forest/name.svg`. Use a labelled button around action icons. Decorative icons and art beside equivalent text should use `aria-hidden="true"` or `alt=""`. Give meaningful images a short description when they communicate something not already stated.

## CSS
Copy `styles/sim-family-tree.css` and add `class="sft-theme"` to the wrapper you want to style. The styles are scoped to that class. The palette is chosen to visually match the screenshot; it is not an extraction of the website's source CSS. The brass swatch is an accent; the CSS includes a darker brass text colour. Keep the existing site typography unless you intentionally choose a replacement.

## Provenance and verification
Artwork generated through the Higgsfield plugin using GPT Image 2, 2k/high, with the screenshot as a style reference. The SVG companion assets and preview were authored separately. Generated family-archive papers and photographs are blank, with no invented family records or faces. This is a decorative botanical identity, not a historical family coat of arms.

The pack was checked for image decoding, SVG syntax, local preview image loading, desktop/mobile page overflow, and archive integrity. It has not been integrated into or tested on your live website.

See `manifest.json` for file dimensions and sizes, and `provenance/generations.json` for the original prompts and job identifiers.
