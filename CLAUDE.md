# Family Tree

A private, hosted family-tree app for recording ancestors, relationships, photos, and the sources each fact came from.
Origin: rebuilding and extending the family tree Jason's granddad made in the 1990s.

## Stack
- React 19 + Vite + TypeScript SPA (no separate backend; the browser talks to Supabase directly under RLS)
- Tailwind CSS v4 (`@theme` in `src/index.css`, no tailwind.config). Custom classes: `btn-primary`, `btn-ghost`, `btn-danger`, `input`, `label`, `card`
- TanStack Query for all data access (`src/lib/queries.ts`), React Router v7
- d3-hierarchy + d3-zoom for the chart (`src/components/TreeChart.tsx`)
- Supabase: project `familytree` (ref `nurkbmmacrepftlepizi`, region ca-central-1). Auth = email + password. Storage bucket `media` (private, signed URLs)

## Data model (see `supabase/migrations/`)
- `trees` → `tree_members` (owner / editor / viewer). RLS helpers (schema `private`, not exposed over REST): `can_view_tree(tree_id)`, `can_edit_tree(tree_id)`
- `people` – one row per person. Dates are stored twice: `birth_date` as written ("abt 1921") and `birth_date_sort` (ISO, derived by `toSortDate` in `src/lib/dates.ts`)
- `families` – a union of two partners (either may be null). `family_children` links children to a family. This is the GEDCOM model: parent–child links always go through a family
- `events` – timeline entries for a person or family
- `sources` → `citations` (attach to a person, family, or event; confidence 0–3)
- `media` – photos/scans in the `media` bucket at `<tree_id>/<uuid>.<ext>`. `people.photo_path` is the profile photo
- `src/lib/graph.ts` indexes a tree snapshot for parent/child/sibling/partner lookups

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
