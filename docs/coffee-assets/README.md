# Sim Family Tree — Buy Me a Coffee donation assets

A coordinated asset set for the existing “This site is kept online by Jason” footer.

## Start here
Open examples/preview.html to see both footer layouts. Preview controls do not send a payment.
Use ONE layout from examples/footer.html. The illustrated footer is the primary design; the compact line is for the bottom of the family map.

Suggested text:
- Heading: Help keep our family tree online.
- Supporting line: Jason keeps this site online. Optional donations help cover hosting.
- Button: Donate via Buy Me a Coffee
- Compact alternative: Help Jason cover hosting costs. [Donate via Buy Me a Coffee]

## Add to your website
1. Copy styles/coffee-support.css plus the images/icons used by your chosen layout into your website.
2. Copy the chosen aside element from examples/footer.html into your existing page footer.
3. Replace REPLACE_WITH_YOUR_BUY_ME_A_COFFEE_URL with your existing Buy Me a Coffee donation URL.
4. Update relative asset paths to match where you saved the files.

This pack supplies artwork and layout templates. It does not change your site or configure payment processing. The exact payment destination was not supplied.

## Files
- illustrations/coffee-cup-480.webp: lightweight footer artwork (480 × 360).
- illustrations/coffee-cup-960.webp: higher resolution version (960 × 720).
- illustrations/coffee-cup.png: normalized ivory PNG (1600 × 1200).
- illustrations/coffee-and-memories-* and .png: journal still life for a support page or thank-you area.
- originals/: full resolution Higgsfield originals.
- icons/: four SVG designs using currentColor for inline use.
- icons/forest/: fixed forest SVG versions for img elements on ivory.
- icons/light/: fixed ivory SVG versions for img elements on forest.
- brand/: the matching tree mark and a small botanical divider.
- examples/preview.html: portable interactive design preview.
- examples/footer.html: copyable markup for both variants.
- preview-desktop.png / preview-mobile.png: rendered layout previews.
- provenance.json: generation IDs, references and prompts.
- manifest.json: file sizes, dimensions where applicable, and SHA-256 hashes.

These are custom illustrations and icons matched to your site, rather than official Buy Me a Coffee brand artwork.

## Visual use
Forest #2F4B3A, ivory #FAF8F4, decorative brass #AF8C45.
Use #785D23 for small gold link text on ivory, #353B33 for headings, and #686D62 for supporting text.
Illustration PNG and WebP files have opaque ivory backgrounds (#FAF8F4). They are NOT transparent; place them on that colour. Do not use multiply blending.
SVG icons have transparent backgrounds. currentColor versions inherit colour when inserted inline; choose the forest or light folder for ordinary img elements.
The footer uses Georgia/Times New Roman and works without a font download. You can substitute your site's existing serif font.

## Behaviour
The layout wraps for smaller screens. The button has a minimum 46px height, visible keyboard focus, and reduced-motion support.
Keep the footer unobtrusive and voluntary. No donation amount, deadline, or recurring payment is assumed. Use your existing Buy Me a Coffee page.

Created for Jason's Sim Family Tree, 2026-09-13.
