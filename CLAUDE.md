# Sim Family Tree

A private, hosted family-tree app for recording ancestors, relationships, photos, and the sources each fact came from.
Origin: rebuilding and extending the family tree Jason's granddad made in the 1990s.

## Stack
- React 19 + Vite + TypeScript SPA on GitHub Pages; the backend is a self-hosted PocketBase on Jason's Raspberry Pi (see "Backend" below)
- Tailwind CSS v4 (`@theme` in `src/index.css`, no tailwind.config). Custom classes: `btn-primary`, `btn-ghost`, `btn-danger`, `input`, `label`, `card`
- Product name: "Sim Family Tree" (header, tab title, login). Visual design: "Kinfolk" (Claude Design project `Family Tree Options.dc.html`, option 7a). Paper #FAF8F3, moss header #2E4A38, brass accent #A8843A / #D9B25C, sage lines #B9C7B9, EB Garamond everywhere. Generation disc tints cycle sage → honey → clay → sky (`TINTS` in `src/components/TreeCanvas.tsx`). Selected card inverts to moss with cream text.
- TanStack Query for all data access (`src/lib/queries.ts`), React Router v7
- d3-hierarchy + d3-zoom + d3-transition for the infinite-canvas map (`src/components/TreeCanvas.tsx`): couples share a node, orthogonal connectors, minimap, `zoomTo` glide. Branches fold: a − toggle under every couple with children, a `+N` pill while folded (N hidden relatives), folds kept in localStorage `sft-collapsed:<treeId>`, the toggled couple stays put on screen, `zoomTo` unfolds the path to a searched person, and the zoom controls carry fold-all / unfold-all. A spouse's own ancestors (e.g. Teresa's Dusun line) are stacked before the spouse's card at negative depths rather than drawn as a separate tree; the founding couple is the root candidate with the most children. Two orientations (`Orient`): `down` (rows, couples side by side — the book's chart, default on wide screens) and `right` (columns, siblings stacked, couples one above the other — default under 640px); the layout runs on generation/sibling axes and maps to x/y, ChartPage keeps the choice in localStorage `sft-orient` and offers a turn button in the zoom controls. `PersonSpotlight.tsx` is the bottom-left card shown on select.
- **Accounts:** email and password, with self-serve sign-up (name plus a "how are you related" note), email confirmation (`?confirm=` link) and password reset (`?reset=` link), both handled in `App.tsx`.
  - **Approval queue:** a hook makes every new account `status` pending and `role` viewer, whatever the form sends. Only confirmed emails can sign in, and the app shows `PendingPage` until approval.
  - **Managing members:** admins manage everyone on `/members` (`MembersPage`; Approve = editor, "View only" = viewer). The header badges come from `GET /api/sft/counts`. `useCanEdit()` from `src/lib/profile.ts` hides edit controls from viewers.
  - Jason is the admin.
- **Reviewed contributions:** every data change goes through `POST /api/sft/submit` (`src/lib/changes.ts`, `useSubmit`).
  - **One user action = one request:** each is a `change_requests` record holding ordered inserts, updates and deletes. New rows get client IDs (`newId()`), so a request can create a person and link them in one go.
  - **Who applies what:** editors' requests wait (status pending) for an admin on `/review` (`ReviewPage`: approve or decline with a note, "this is me" links, recent history with Undo). Admins' requests apply immediately but are still recorded.
  - **History and undo:** hooks write every record change to `change_log`, including cascades and dashboard edits. `/api/sft/revert` undoes a request, including cascaded deletes and photo files.
  - **Photos:** contributors upload into `uploads` (waiting for review); approval moves the file into `media`.
  - **Admin-only:** tree-level text (foreword and preface) and creating trees.
  - **"This is me":** `users.person` / `person_status`, via `/api/sft/claim` and `/api/sft/review-claim`. A linked account's avatar opens their profile.
  - **For contributors:** `/contribute` (`ContributePage`: a guide plus their suggestions), a "Help complete …'s profile" box listing gaps, pending notices on profiles, and "Send for review" buttons. Feedback goes through `lib/toast.tsx`.
  - **Rule:** never write family data with direct collection calls in the app. Scripts and the dashboard bypass review; they're logged with no request ID.

## Data model (see `pocketbase/pb_migrations/`)
- `trees` → `tree_members` (owner / editor / viewer). Access is by account status: approved members read; only an approved admin writes.
- `people` – one row per person. Dates are stored twice: `birth_date` as written ("abt 1921") and `birth_date_sort` (ISO, derived by `toSortDate` in `src/lib/dates.ts`)
- `families` – a union of two partners (either may be null). `family_children` links children to a family. This is the GEDCOM model: parent–child links always go through a family
- `events` – timeline entries for a person or family
- `sources` → `citations` (attach to a person, family, or event; confidence 0–3)
- `media` – photos and scans, with the file on the record (protected). `people.photo` links to the person's portrait media record. The app sees both as file refs (`storage_path`, `photo_path`; see `src/lib/pb.ts`).
- `trees.foreword*` (Jason's September 2026 note) and `trees.intro*` (Bernard's 2007 preface): the tree's introduction, foreword first, opened from a "Preface" note on the map (`IntroPane`), auto-opened once per device (localStorage `sft-intro-seen:<treeId>`); admins edit it at `/trees/:id/about` (`AboutPage`, no nav tab). For the Sim family it is Bernard's 2007 preface, verbatim.
- A person with several marriages is paired on the map with the partner whose family has children; further spouses are drawn as small dashed `MiniCard`s beneath the person's own card.
- Families with no partners are sibling groups whose parents are unknown; the map draws them under an invisible "ghost" root (a bus line, no parent stem) so the tree starts at that generation.
- `src/lib/graph.ts` indexes a tree snapshot for parent/child/sibling/partner lookups

## Backend: PocketBase (see `pocketbase/README.md`)
- PocketBase v0.40.6 runs on Jason's Raspberry Pi 3 (ssh alias `pihole`, which is also the home Pi-hole DNS: never restart Pi-hole). Switched over from Supabase on 2026-11-25.
- **Addresses:**
  - Public API: `https://tree-api.pjscollectibles.ca`, through the Pi's Cloudflare tunnel. `/_/` and `/api/collections/_superusers` are blocked publicly.
  - Admin dashboard: Tailscale only, at `https://raspberrypi.<tailnet>.ts.net/_/`.
  - PocketBase listens on 127.0.0.1:8090 with `--origins=https://pokejaysim.github.io`.
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
  - **Uploads:** `uploadToTree` puts a file in `uploads`. `changes.ts` turns a media insert's upload ref into `data.upload`, and `photo_path` into the `photo` link; `hydrate()` maps stored requests back for the Review page.
  - **Accounts:** `profile.ts` reads users as profiles. Members' emails show because users `manageRule` = admin.
- **Developing:** use a test copy of PocketBase built from a snapshot (made-up accounts; dev auto sign-in uses `VITE_PB_DEV_EMAIL/PASSWORD`). Never develop against the real server.
- **Supabase:** the old project `nurkbmmacrepftlepizi` is kept untouched as a fallback for a month after the switchover (it can be un-paused within 90 days). `supabase/migrations/` is history only.

## Hosting
- GitHub Pages at https://pokejaysim.github.io/familytree/ (repo `pokejaysim/familytree`, workflow deploys `main`). Vite `base` comes from `BASE_PATH`; the router uses `import.meta.env.BASE_URL`; `404.html` is a copy of `index.html` for deep links.

## Phone layout
Below the `sm` breakpoint the tree tabs move to a bottom tab bar (`BottomTabs` in `AppHeader.tsx`), Members becomes an icon, the spotlight is a bottom sheet, the minimap hides, and the map opens at a readable zoom on the first generation instead of fitting the whole tree. Keep the header's minimum content width under 375px: if it overflows, mobile browsers widen the layout viewport and everything else looks broken.

## Splash
`src/lib/splash.ts` (from Jason's splash pack, `docs/splash-README.md`): 2-second animated emblem overlay in a shadow-root, pointer-events none, reduced-motion skips. `useLoginSplash` in `src/App.tsx` plays it once per signed-in user per page load (sign-in, or opening the site already signed in), never on route changes.

## Brand assets
From Jason's asset pack (`docs/asset-pack-README.md`): `src/assets/tree-mark*.svg` (header/login mark, `branch-divider.svg`), `public/brand/` (favicons, manifest icons), `public/art/*.webp` (heritage-tree, first-branch, family-archive at 640/1200; coffee-cup at 480/960 from the coffee pack, `docs/coffee-assets/`). Illustrations have an opaque ivory background matching `--color-paper`, so place them on paper, never on white. `EmptyState` and `BrandPanel` components wrap them.

## Site settings
`src/config.ts`: `DONATE_URL` (Buy Me a Coffee page; empty hides every support element) and `ADMIN_NAME`. `SupportLine` renders the illustrated coffee footer on the Trees/People/Sources pages and a compact line at the foot of the intro pane; `/support` (`SupportPage`) explains where donations go, with the pack's journal illustration.

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
