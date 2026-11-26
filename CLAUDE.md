# Sim Family Tree

A private, hosted family-tree app for recording ancestors, relationships, photos, and the sources each fact came from.
Origin: rebuilding and extending the family tree Jason's granddad made in the 1990s.

## Stack
- React 19 + Vite + TypeScript SPA on GitHub Pages; the backend is a self-hosted PocketBase on Jason's Raspberry Pi (see "Backend" below)
- Tailwind CSS v4 (`@theme` in `src/index.css`, no tailwind.config). Custom classes: `btn-primary`, `btn-ghost`, `btn-danger`, `input`, `label`, `card`
- Product name: "Sim Family Tree" (header, tab title, login). Visual design: "Kinfolk" (Claude Design project `Family Tree Options.dc.html`, option 7a). Paper #FAF8F3, moss header #2E4A38, brass accent #A8843A / #D9B25C, sage lines #B9C7B9, EB Garamond everywhere. Generation disc tints cycle sage → honey → clay → sky (`TINTS` in `src/components/TreeCanvas.tsx`). Selected card inverts to moss with cream text. Text colours are tuned for contrast (brass #86672A and ink-mute #6F6A5E are 5:1 on paper); no spaced or all-caps small labels anywhere, buttons and labels are sentence case at 14–15px. The button/input/label/card recipes sit in `@layer components` in `src/index.css`, so utilities on an element can adjust them. Line 1 of `src/index.css` is the Hallmark check stamp (keep it at the top).
- TanStack Query for all data access (`src/lib/queries.ts`), React Router v7
- d3-hierarchy + d3-zoom + d3-transition for the infinite-canvas map (`src/components/TreeCanvas.tsx`): couples share a node, orthogonal connectors, minimap, `zoomTo` glide. Branches fold: a − toggle under every couple with children, a `+N` pill while folded (N hidden relatives), folds kept in localStorage `sft-collapsed:<treeId>`, the toggled couple stays put on screen, `zoomTo` unfolds the path to a searched person, and the zoom controls carry fold-all / unfold-all. A spouse's own ancestors (e.g. Teresa's Dusun line) are stacked before the spouse's card at negative depths rather than drawn as a separate tree; the founding couple is the root candidate with the most children. Two orientations (`Orient`): `down` (rows, couples side by side — the book's chart, default on wide screens) and `right` (columns, siblings stacked, couples one above the other — default under 640px); the layout runs on generation/sibling axes and maps to x/y, ChartPage keeps the choice in localStorage `sft-orient` and offers a turn button in the zoom controls. `PersonSpotlight.tsx` is the bottom-left card shown on select. The map opens on the signed-in person (`startId`): their card carries a "You" tag and their line back to the founders is drawn in brass; without a linked person it opens on the founding couple at a readable zoom (never below 0.65 on desktop).
- **Home (`/`):** with one tree it is that family's cover (`TreesPage` `Cover`: the founders' portraits, the description, Open the map, Find a relative, the foreword); with several it lists them.
- **People page:** grouped like the book (`src/lib/kin.ts` `branchesOf`: the founders and anyone above them, then one group per child of the founders, generation by generation). `relationTo` names how anyone is related to the signed-in person ("your cousin", "your uncle’s wife"); it shows on the People list, profiles and the map card.
- **Profiles:** on a laptop the record (family, life events, sources) is on the left and the photos on the right; on a phone the photos are a swipeable strip under the name. Captions are always shown in full under each photo.
- **Onboarding (signed out):** `LoginPage` opens on a welcome for newcomers ("I'm new here: ask to join" / "I already have an account", plus "How joining works" in 3 steps). Devices that have signed in before (`sft-signed-in-before`), `?signin` links (the "You're in" email) and email-link notices go straight to the sign-in form. Sign-up repeats the steps, has an email hint and a Show password button.
- **Onboarding (new member):** after approval, the splash and welcome video play; its last frame's "Get started" goes home, where `GettingStarted` (on the cover) lists: find yourself (This is me), read the foreword (ticked when `IntroPane` opens, `sft-foreword-read:<tree>`), add something (any change request). It hides when all done or closed (`sft-getting-started-closed:<user>`). The foreword no longer pops up on the map by itself.
- **Accounts:** email and password, with self-serve sign-up (just name, email and password; the "how are you related" question was dropped 2026-11-26 because relatives found it confusing) and password reset (`?reset=` link, handled in `App.tsx`). There's no confirm-your-email step (removed 2026-11-25 because relatives got stuck between it and approval): signing up signs you straight in. Old `?confirm=` links still work but aren't needed.
  - **Family news (added 2026-11-26):** `/news` and `/news/:id` (`NewsPage`, `src/lib/news.ts`): admins write posts (title, text in the foreword's light markup via `Letter`, optional photo) and can email them; members read them and can untick "Email me new posts". `pb_hooks/news.pb.js`: `POST /api/sft/news/{id}/send` emails approved members who haven't switched off and haven't had it, 8 per call (the browser loops; the first call sends `again` so earlier failures are retried), each to one address only, Reply-To the sending admin, with a "stop these emails" link `?news-off=<user>.<unsub_key>` (handled in `useEmailLinks`; `POST /api/sft/news/off`, no sign-in needed) also sent as List-Unsubscribe. `POST /api/sft/news/emails {on}` is the member's switch. `news.sent_to`/`failed_to` and `users.unsub_key` are hidden fields (migration 1765500000). The header's News link gets a dot for a post newer than `sft-news-seen:<uid>`; the home page links the newest post if it's under two months old. Server tests use a stand-in mail server (one address always bounces).
  - **Continue with Google (added 2026-11-26):** PocketBase's own OAuth2, off until an admin pastes the Google Cloud client ID and secret on the Admin page ("Sign in with Google" section, `GoogleSetup`; `GET/POST/DELETE /api/sft/google` in `pb_hooks/google.pb.js`, admins only, secret never returned). Done as a full-page redirect, not PocketBase's popup: `src/lib/signin.ts` keeps the state and PKCE verifier in sessionStorage, sends people to Google with redirect URI `https://simfamilytree.com/` (the one registered with Google, so Google's screen names the family site, not the API host), and `useEmailLinks` in `App.tsx` finishes it with `authWithOAuth2Code`. New Google accounts go through the users create hook like the form (pending, viewer; admin email says "with Google"); the "You're in" email tells Google users to tap Continue with Google. An existing account with the same email is joined; if it was never verified, PocketBase also randomises its password (its pre-hijacking guard), so that person uses Google or Forgot password from then on. Guests get 20 Google sign-ins a minute per address (migration 1765300000). Tests use a stand-in OIDC provider on the Pi.
  - **Approval queue:** a hook makes every new account `status` pending and `role` viewer, whatever the form sends. Every family record needs an approved account, so `PendingPage` ("You're on the list") is all a new account sees; it re-checks every 20 s and on focus, so approval lets them in by itself. Approving (pending/declined → approved) emails them "You're in" with a link (`onRecordUpdateRequest` in `pb_hooks/accounts.pb.js`). The users `authRule` is empty (migration 1765200000).
  - **Managing members:** admins manage everyone on `/admin` (`AdminPage`; Approve = editor, "Approve as view only" = viewer; role, linked person, last visit from `users.last_seen`, send a password reset link; approving shows a toast and emails them). `/members` and `/review` redirect there. The Admin page also has Site health (`GET /api/sft/health` in `pocketbase/pb_hooks/health.pb.js`: newest snapshot on PiDrive1 and PocketBase's own backups, disk space, email set up or not plus "sft: couldn't …" / "Failed to send …" log entries from the last 30 days, totals; `POST /api/sft/test-email` emails the signed-in admin) and Tree settings (`TreeSettingsForm`, shared with the About page's Edit). Hooks that fail to send email write a `$app.logger().warn("sft: couldn't …")` so the Admin page can list it. The header's one Admin badge comes from `GET /api/sft/counts`. `useCanEdit()` from `src/lib/profile.ts` hides edit controls from viewers.
  - Jason is the admin.
- **Reviewed contributions:** every data change goes through `POST /api/sft/submit` (`src/lib/changes.ts`, `useSubmit`).
  - **One user action = one request:** each is a `change_requests` record holding ordered inserts, updates and deletes. New rows get client IDs (`newId()`), so a request can create a person and link them in one go.
  - **Who applies what:** editors' requests wait (status pending) for an admin on `/admin` (cards in `src/components/ReviewCards.tsx`: approve or decline with a note, "this is me" links, recent history with Undo). Admins' requests apply immediately but are still recorded.
  - **History and undo:** hooks write every record change to `change_log`, including cascades and dashboard edits. `/api/sft/revert` undoes a request, including cascaded deletes and photo files.
  - **Photos:** contributors upload into `uploads` (waiting for review); approval moves the file into `media`.
  - **Admin-only:** tree-level text (foreword and preface) and creating trees.
  - **"This is me":** `users.person` / `person_status`, via `/api/sft/claim` and `/api/sft/review-claim`; the admin can also set it directly with `/api/sft/link-member {user, person}`. A linked account's avatar opens their profile.
  - **For contributors:** `/contribute` (`ContributePage`: a guide plus their suggestions), a "Help complete …'s profile" box listing gaps, pending notices on profiles, and "Send for review" buttons. Feedback goes through `lib/toast.tsx`.
  - **Rule:** never write family data with direct collection calls in the app. Scripts and the dashboard bypass review; they're logged with no request ID.

## Data model (see `pocketbase/pb_migrations/`)
- `trees` → `tree_members` (owner / editor / viewer). Access is by account status: approved members read; only an approved admin writes.
- `people` – one row per person. Dates are stored twice: `birth_date` as written ("abt 1921") and `birth_date_sort` (ISO, derived by `toSortDate` in `src/lib/dates.ts`)
- `families` – a union of two partners (either may be null). `family_children` links children to a family. This is the GEDCOM model: parent–child links always go through a family
- `events` – timeline entries for a person or family
- `sources` → `citations` (attach to a person, family, or event; confidence 0–3)
- `media` – photos and scans, with the file on the record (protected). `people.photo` links to the person's portrait media record. The app sees both as file refs (`storage_path`, `photo_path`; see `src/lib/pb.ts`).
- `trees.foreword*` (Jason's September 2026 note) and `trees.intro*` (Bernard's 2007 preface): the tree's introduction, foreword first, opened from a "Preface" note on the map (`IntroPane`), and from the home page's Getting started card (it no longer auto-opens); admins edit it at `/trees/:id/about` (`AboutPage`, no nav tab). For the Sim family it is Bernard's 2007 preface, verbatim.
- A person with several marriages is paired on the map with the partner whose family has children; further spouses are drawn as small dashed `MiniCard`s beneath the person's own card.
- Families with no partners are sibling groups whose parents are unknown; the map draws them under an invisible "ghost" root (a bus line, no parent stem) so the tree starts at that generation.
- `src/lib/graph.ts` indexes a tree snapshot for parent/child/sibling/partner lookups

## Backend: PocketBase (see `pocketbase/README.md`)
- PocketBase v0.40.6 runs on Jason's Raspberry Pi 3 (ssh alias `pihole`, which is also the home Pi-hole DNS: never restart Pi-hole). Switched over from Supabase on 2026-11-25.
- **Addresses:**
  - Public API: `https://tree-api.pjscollectibles.ca`, through the Pi's Cloudflare tunnel. `/_/` and `/api/collections/_superusers` are blocked publicly.
  - Admin dashboard: Tailscale only, at `https://raspberrypi.<tailnet>.ts.net/_/`.
  - **Admin side is closed to the internet:** `pb_hooks/public_guard.pb.js` returns 404 for the dashboard, anything under the superusers collection (any spelling, or its id) and any superuser token when the request carries Cloudflare's `Cf-Ray`/`Cf-Connecting-Ip` headers. The tunnel's two path rules only match the lower-case spelling, so the hook is the real block. Superuser work happens over Tailscale or on the Pi.
  - **Email limits (guests, per address):** 5 sign-ups an hour, 5 password-reset and 5 confirmation requests per 15 minutes (migration 1765100000). Signed-in requests (the Admin page's send buttons) aren't limited.
  - PocketBase listens on 127.0.0.1:8090 with `--origins=https://simfamilytree.com,https://pokejaysim.github.io` (the old address redirects to the new one).
- **Data and backups:**
  - Data lives in an ext4 image on a USB drive, mounted at `/srv/pocketbase`.
  - Backups: PocketBase's own nightly, plus a nightly snapshot to the second drive. They are local only, by Jason's choice.
- **Code:**
  - Schema and settings are code in `pocketbase/pb_migrations`; server logic is in `pocketbase/pb_hooks`.
  - Field names match the Supabase columns minus `_id` (`people.tree`), and records kept their Supabase UUIDs.
  - Test hook changes with `pocketbase/tools/run_tests_on_server.sh` (65 checks) before deploying.
- **The app side:**
  - **`src/lib/pb.ts`:** the client plus an adapter. Pages keep the Supabase-era shapes (`person_id`, `photo_path`, `storage_path`), and `toApp`/`toPbFields` translate.
  - **Files:** refs `"media/<id>/<file>"` or `"uploads/<id>/<file>"`. `useSignedUrl(ref, thumb?)` builds URLs from one shared file token (1 h); thumbnails are `160x160` for the map and avatars, `480x0` for galleries. Run `tools/make_thumbs.pb.js` after bulk imports.
  - **Uploads:** `uploadToTree` puts a file in `uploads`. `changes.ts` turns a media insert's upload ref into `data.upload`, and `photo_path` into the `photo` link; `hydrate()` maps stored requests back for the Admin page.
  - **Accounts:** `profile.ts` reads users as profiles. Members' emails show because users `manageRule` = admin.
- **Developing:** use a test copy of PocketBase built from a snapshot (see "Developing against a test copy" in `pocketbase/README.md`; made-up accounts; dev auto sign-in uses `VITE_PB_DEV_EMAIL/PASSWORD`). Never develop against the real server. The copy used for the switchover was deleted on 2026-11-25.
- **Supabase:** the old project `nurkbmmacrepftlepizi` is kept untouched as a fallback for a month after the switchover (it can be un-paused within 90 days). `supabase/migrations/` is history only.

## Hosting
- The published build carries a Content-Security-Policy meta tag (added by a plugin in `vite.config.ts`, build only): own scripts only, connections and images only to the site and `VITE_PB_URL`. Anything new loaded from another origin must be added there. The typeface is self-hosted (`@fontsource/eb-garamond`, imported in `main.tsx`).
- GitHub Pages at https://simfamilytree.com, a custom domain set in the repo's Pages settings, with DNS in Cloudflare (DNS only, not proxied, so GitHub issues the HTTPS certificate). The old https://pokejaysim.github.io/familytree/ redirects there. (Repo `pokejaysim/familytree`, workflow deploys `main`). Vite `base` comes from `BASE_PATH`; the router uses `import.meta.env.BASE_URL`; `404.html` is a copy of `index.html` for deep links.

## Phone layout
Below the `sm` breakpoint the tree tabs move to a bottom tab bar (`BottomTabs` in `AppHeader.tsx`), Contribute / Review / Members / Your profile / Sign out fold into a labelled "Menu" (`PhoneMenu`), the spotlight is a bottom sheet, the minimap hides, and the map opens at a readable zoom on the first generation instead of fitting the whole tree. Keep the header's minimum content width under 375px: if it overflows, mobile browsers widen the layout viewport and everything else looks broken.

## Splash
`src/lib/splash.ts` (from Jason's splash pack, `docs/splash-README.md`): 2-second animated emblem overlay in a shadow-root, pointer-events none, reduced-motion skips. `useLoginSplash` in `src/App.tsx` plays it once per signed-in user per page load (sign-in, or opening the site already signed in), never on route changes.

## Brand assets
From Jason's asset pack (`docs/asset-pack-README.md`): `src/assets/tree-mark*.svg` (header/login mark, `branch-divider.svg`), `public/brand/` (favicons, manifest icons), `public/art/*.webp` (heritage-tree, first-branch, family-archive at 640/1200; coffee-cup at 480/960 from the coffee pack, `docs/coffee-assets/`). Illustrations have an opaque ivory background matching `--color-paper`, so place them on paper, never on white. `EmptyState` and `BrandPanel` components wrap them.

## Site settings
`src/config.ts`: `DONATE_URL` (Buy Me a Coffee page; empty hides every support element). **Voice:** since 2026-11-26 the site and its emails speak as "we" ("We check it's you", "Send us a message", emails signed "The Sim Family Tree"), never naming Jason; Jason asked for this. `ADMIN_NAME` is gone. Only the foreword (tree content) and the admin-only Tree settings placeholders mention him. `SupportLine` renders the illustrated coffee footer on the Trees/People/Sources pages and a compact line at the foot of the intro pane; `/support` (`SupportPage`) explains where donations go, with the pack's journal illustration.

## Commands
```bash
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build
```
Env: `.env.local` with `VITE_PB_URL` (see `.env.example`). The deploy reads the `VITE_PB_URL` repo variable.

## Conventions
- Every data change goes through `useSubmit` (`src/lib/changes.ts`), which refreshes the cached queries
- Keep genealogy date text verbatim; never overwrite what a source says with a normalised value
- Migrations: add a new file under `pocketbase/pb_migrations/` and deploy it to `/srv/pocketbase/pb_migrations/` on the Pi (after a snapshot), then restart `pocketbase`. It applies on start.

## Source material
Granddad's recovered floppy-disk files live at
`~/Documents/Documents - Jason’s MacBook Pro/Grandpa's Files from floppy Disks/` (letters as .doc, scans as .TIF).
`scripts/extract-doc-text.sh` converts the .doc files to plain text for transcription into sources.
The original 1990s tree file has not been found on this Mac (searched for .ged, .ftw, .paf, .wps, .wri, .wpd).
