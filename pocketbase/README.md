# PocketBase backend (in progress)

The family tree is moving from Supabase to a self-hosted [PocketBase](https://pocketbase.io)
(v0.40.6). This folder holds only code: the schema and tools. **Family data never goes in
this repo** (it is public). It lives only in the databases themselves and their backups.

```
pb_migrations/   schema and settings as code; PocketBase applies new files on start
pb_hooks/        server-side logic (phase 2: the review system, sign-up rules)
tools/
  export_supabase.py      Supabase -> JSON + files, into a folder OUTSIDE the repo
  import_supabase.pb.js   one-time console command that imports that export
  verify_import.py        compares an import with its export, field by field and file by file
server/                   reference copies of the server setup (Raspberry Pi, Debian 12 arm64)
  pocketbase.service            systemd service: 127.0.0.1:8090, runs only when its data disk is mounted
  fstab.example                 the data disk: an ext4 image on the data drive, mounted at /srv/pocketbase
  pocketbase-snapshot(.service/.timer)   nightly local snapshot to the second drive, keeps 30
```

## Backups

- **Off-site:** PocketBase's own nightly backup (cron `45 10 * * *` UTC, keep 7) goes to Cloudflare R2 once S3 is enabled under Settings → Backups.
- **Local:** at 4:30 am, `pocketbase-snapshot` writes a zip to the second drive. It doesn't depend on the off-site backups.
  - It uses PocketBase's backup layout, so the dashboard's "Upload backup" can restore it.
  - The database is copied with SQLite's online backup and integrity-checked, and the zip is tested before it replaces anything.
  - Restore was tested on 2026-11-25.

## How it maps from Supabase

- **Names:** the same table and column names, with links losing their `_id` suffix (`people.tree_id` becomes `people.tree`).
- **IDs:** records keep their Supabase UUIDs, so links and URLs don't change.
- **Portraits:** `people.photo` is a link to the person's `media` record, instead of a second copy of the storage path.
- **Profiles:** these became fields on the `users` auth collection: `status`, `role`, `note`, `person`, `person_status`, `reviewed_at` and `reviewed_by`.
- **Access:** approved members read; only an approved admin writes. Contributors' edits go through `change_requests` via hooks (phase 2). Nobody can sign up yet.
- **Files:** media files are protected, so viewing them needs a file token. Thumbnails are `160x160`, `480x0` and `1200x0`.

## Re-importing (e.g. at cutover)

```bash
python3 -I pocketbase/tools/export_supabase.py /some/folder/outside/the/repo
# copy the folder to the server, stop PocketBase, then, as the PocketBase service user:
pocketbase import-supabase <export> replace --dir=<pb_data> --hooksDir=<folder holding only import_supabase.pb.js>
python3 -I verify_import.py <export> <pb_data>      # must print ALL MATCH
# start PocketBase again, then delete every copy of the export
```

Run the import with a hooks folder that contains only `import_supabase.pb.js`. Otherwise the
phase-2 hooks would record the import as edits. `replace` first deletes the previous import,
then re-imports in one transaction.
