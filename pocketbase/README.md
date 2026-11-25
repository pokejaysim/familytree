# PocketBase backend

The family tree moved from Supabase to a self-hosted [PocketBase](https://pocketbase.io)
(v0.40.6) on 2026-11-25. This folder holds only code: the schema and tools. **Family data never goes in
this repo** (it is public). It lives only in the databases themselves and their backups.

```
pb_migrations/   schema and settings as code; PocketBase applies new files on start
pb_hooks/        server-side logic
  review.pb.js            /api/sft/* endpoints: submit, review, withdraw, revert, claim, review-claim, counts
  change_log.pb.js        logs every change to the family records (cascades and dashboard edits too);
                          keeps a copy of deleted photos so undo can restore the file
  accounts.pb.js          sign-ups become pending + view-only; confirmation email, note to admins;
                          uploads belong to their uploader; nightly tidy-up of old uploads
  sft_lib.js              shared helpers (a port of the Supabase reviewed_contributions functions)
tools/
  export_supabase.py      Supabase -> JSON + files, into a folder OUTSIDE the repo
  import_supabase.pb.js   one-time console command that imports that export
  verify_import.py        compares an import with its export, field by field and file by file
  test_review_system.py   65 end-to-end checks of the review system (made-up data, throwaway server)
  run_tests_on_server.sh  builds a throwaway PocketBase from this folder, runs the checks, deletes it
  make_thumbs.pb.js       console command `make-thumbs`: pre-makes photo thumbnails (run after bulk imports)
  make_owner.pb.js        console command `make-owner <email> [personId]`: admin + tree owner (used at switchover)
server/                   reference copies of the server setup (Raspberry Pi, Debian 12 arm64)
  pocketbase.service            systemd service: 127.0.0.1:8090, runs only when its data disk is mounted
  fstab.example                 the data disk: an ext4 image on the data drive, mounted at /srv/pocketbase
  pocketbase-snapshot(.service/.timer)   nightly local snapshot to the second drive, keeps 30
```

## Backups

Everything stays local, on the server's drives. Jason decided against an off-site copy.

- **Same drive:** PocketBase's own nightly backup (cron `45 10 * * *` UTC, keep 7) is the dashboard's one-click restore.
- **Second drive:** at 4:30 am, `pocketbase-snapshot` writes a zip to the second drive.
  - It uses PocketBase's backup layout, so the dashboard's "Upload backup" can restore it.
  - The database is copied with SQLite's online backup and integrity-checked, and the zip is tested before it replaces anything.
  - Restore was tested on 2026-11-25.

## How it maps from Supabase

- **Names:** the same table and column names, with links losing their `_id` suffix (`people.tree_id` becomes `people.tree`).
- **IDs:** records keep their Supabase UUIDs, so links and URLs don't change.
- **Portraits:** `people.photo` is a link to the person's `media` record, instead of a second copy of the storage path.
- **Profiles:** these became fields on the `users` auth collection: `status`, `role`, `note`, `person`, `person_status`, `reviewed_at` and `reviewed_by`.
- **Access:** approved members read; only an approved admin writes. Everyone else's edits go through `change_requests`. Anyone may sign up, but new accounts are pending and view-only, and only confirmed emails can sign in.
- **Files:** media files are protected, so viewing them needs a file token. Thumbnails are `160x160`, `480x0` and `1200x0`.

## The review system (`pb_hooks`)

Same behaviour as the Supabase version.

- **Changes:** a change is `{table, op: insert|update|delete, key, data}` using PocketBase field names (`person`, `family`, `tree`).
  - Keys are `{id}` (`family_children` may also use `{family, person}`).
  - New rows can carry a client-made UUID, so one request can create a person and link them.
- **Who applies what:**
  - `POST /api/sft/submit` stores the request with a "before" snapshot of each touched row. An admin's request applies at once.
  - `/api/sft/review` approves or declines.
  - `/api/sft/withdraw` is for the author.
  - `/api/sft/revert` undoes an approved request from `change_log`, including cascaded deletes and photo files.
- **New photos:**
  1. The contributor creates an `uploads` record. It's always theirs and `pending`.
  2. They submit a `media` insert with `data.upload = <upload id>`.
  3. Approving moves the file into `media`; declining or withdrawing deletes the upload.
- **"This is me":**
  - `/api/sft/claim {person}` links your account; an admin's link applies at once, everyone else's waits.
  - `/api/sft/review-claim {user, approve}` is for the admin.
  - `GET /api/sft/counts` gives the admin's badges.

To test changes to the hooks:

```bash
scp -r pocketbase/pb_migrations pocketbase/pb_hooks pocketbase/tools <server>:/tmp/sft-code/
ssh <server> bash /tmp/sft-code/tools/run_tests_on_server.sh    # must end "65 passed, 0 failed"
```

To deploy:
1. Take a snapshot (`systemctl start pocketbase-snapshot`).
2. Copy `pb_hooks/` and any new `pb_migrations/` files to `/srv/pocketbase/`, owned by `pocketbase`.
3. Run `systemctl restart pocketbase`. New migrations apply on start.

## Developing against a test copy

Never point a local dev server at the real PocketBase. Instead:
1. Restore the latest snapshot zip into a folder on the server.
2. Run it as a second PocketBase on `127.0.0.1:8091`, then reach it from the Mac with `ssh -L 8091:127.0.0.1:8091`.
3. In the copy's settings, turn off email and set the app URL to `http://localhost:5173`, so it never emails real people.
4. Use made-up accounts only.
5. Delete the copy when you're done. It holds the family's data.

## Importing from Supabase (history: done at the switchover)

**Don't re-import now.** The site has run on PocketBase since 2026-11-25. `replace` would wipe
every change made since, including accounts. The steps are kept for reference:

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
