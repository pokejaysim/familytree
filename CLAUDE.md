# Sim Family Tree

A private, hosted family-tree app for recording ancestors, relationships, photos, and the sources each fact came from.
Origin: rebuilding and extending the family tree Jason's granddad made in the 1990s.

## Stack
- React 19 + Vite + TypeScript SPA (no separate backend; the browser talks to Supabase directly under RLS)
- Tailwind CSS v4 (`@theme` in `src/index.css`, no tailwind.config). Custom classes: `btn-primary`, `btn-ghost`, `btn-danger`, `input`, `label`, `card`
- Product name: "Sim Family Tree" (header, tab title, login). Visual design: "Kinfolk" (Claude Design project `Family Tree Options.dc.html`, option 7a). Paper #FAF8F3, moss header #2E4A38, brass accent #A8843A / #D9B25C, sage lines #B9C7B9, EB Garamond everywhere. Generation disc tints cycle sage → honey → clay → sky (`TINTS` in `src/components/TreeCanvas.tsx`). Selected card inverts to moss with cream text.
- TanStack Query for all data access (`src/lib/queries.ts`), React Router v7
- d3-hierarchy + d3-zoom + d3-transition for the infinite-canvas map (`src/components/TreeCanvas.tsx`): couples share a node, orthogonal connectors, minimap, `zoomTo` glide. `PersonSpotlight.tsx` is the bottom-left card shown on select.
- Supabase: project `familytree` (ref `nurkbmmacrepftlepizi`, region ca-central-1). Auth = email + password with self-serve sign-up (name + "how are you related" note) and password reset. **Approval queue:** every account gets a `profiles` row (status pending/approved/declined, role admin/editor/viewer, default viewer) via a trigger on `auth.users`; the app shows `PendingPage` until approved. RLS: `members: read` needs `private.is_approved()`, `members: write` needs `private.can_edit()` (admin or editor). Admins manage everyone on `/members` (`MembersPage`); header badge via `pending_member_count()` RPC. `useCanEdit()` from `src/lib/profile.ts` hides every edit control from viewers; the database enforces it regardless. Jason (jsim81@gmail.com) is the admin. Local dev auto-signs-in with `VITE_DEV_EMAIL`/`VITE_DEV_PASSWORD` from `.env.local` (git-ignored, dev builds only) so the login screen never shows on Jason's machine. Storage bucket `media` (private, signed URLs)

## Data model (see `supabase/migrations/`)
- `trees` → `tree_members` (owner / editor / viewer). RLS helpers (schema `private`, not exposed over REST): `can_view_tree(tree_id)`, `can_edit_tree(tree_id)`
- `people` – one row per person. Dates are stored twice: `birth_date` as written ("abt 1921") and `birth_date_sort` (ISO, derived by `toSortDate` in `src/lib/dates.ts`)
- `families` – a union of two partners (either may be null). `family_children` links children to a family. This is the GEDCOM model: parent–child links always go through a family
- `events` – timeline entries for a person or family
- `sources` → `citations` (attach to a person, family, or event; confidence 0–3)
- `media` – photos/scans in the `media` bucket at `<tree_id>/<uuid>.<ext>`. `people.photo_path` is the profile photo
- `src/lib/graph.ts` indexes a tree snapshot for parent/child/sibling/partner lookups

## Hosting
- GitHub Pages at https://pokejaysim.github.io/familytree/ (repo `pokejaysim/familytree`, workflow deploys `main`). Vite `base` comes from `BASE_PATH`; the router uses `import.meta.env.BASE_URL`; `404.html` is a copy of `index.html` for deep links.

## Splash
`src/lib/splash.ts` (from Jason's splash pack, `docs/splash-README.md`): 2-second animated emblem overlay in a shadow-root, pointer-events none, reduced-motion skips. `useLoginSplash` in `src/App.tsx` plays it once per signed-in user per page load (sign-in, or opening the site already signed in), never on route changes.

## Brand assets
From Jason's asset pack (`docs/asset-pack-README.md`): `src/assets/tree-mark*.svg` (header/login mark, `branch-divider.svg`), `public/brand/` (favicons, manifest icons), `public/art/*.webp` (heritage-tree, first-branch, family-archive at 640/1200). Illustrations have an opaque ivory background matching `--color-paper`, so place them on paper, never on white. `EmptyState` and `BrandPanel` components wrap them.

## Site settings
`src/config.ts`: `DONATE_URL` (set it to show the "chip in for hosting" line on the Trees page; empty hides it) and `ADMIN_NAME`.

## Commands
```bash
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build
```
Env: `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).

## Conventions
- Every DB write goes through a hook in `src/lib/queries.ts` that invalidates `['treeData', treeId]`
- Keep genealogy date text verbatim; never overwrite what a source says with a normalised value
- Migrations: add a new file under `supabase/migrations/` AND apply it to the hosted project (Supabase MCP `apply_migration` or `supabase db push`)

## Source material
Granddad's recovered floppy-disk files live at
`~/Documents/Documents - Jason’s MacBook Pro/Grandpa's Files from floppy Disks/` (letters as .doc, scans as .TIF).
`scripts/extract-doc-text.sh` converts the .doc files to plain text for transcription into sources.
The original 1990s tree file has not been found on this Mac (searched for .ged, .ftw, .paf, .wps, .wri, .wpd).
