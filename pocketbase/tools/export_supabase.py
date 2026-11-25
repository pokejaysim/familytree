#!/usr/bin/env python3
"""Export the family tree from Supabase: every table as JSON, plus every media file.

Usage:  python3 -I pocketbase/tools/export_supabase.py <output-folder>

Signs in as the admin using VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
VITE_DEV_EMAIL and VITE_DEV_PASSWORD from .env.local (never printed), reads through
the normal API (so the same access rules apply), and writes:

    <output-folder>/<table>.json          one file per table
    <output-folder>/files/<storage path>  every media file
    <output-folder>/manifest.json         row counts, file count and bytes

The output is family data: keep it OUT of the repo (it is public) and delete it after use.
Only counts are printed.
"""
import json
import pathlib
import sys
import urllib.parse
import urllib.request

TABLES = ["trees", "people", "families", "family_children", "sources", "events",
          "citations", "media", "tree_members", "profiles", "change_requests", "change_log"]

repo = pathlib.Path(__file__).resolve().parents[2]


def env():
    vals = {}
    for line in (repo / ".env.local").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def request(url, headers, data=None):
    req = urllib.request.Request(url, headers=headers, data=data, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = pathlib.Path(sys.argv[1]).resolve()
    if repo in out.parents or out == repo:
        sys.exit("Refusing to write family data inside the repo. Pick a folder outside it.")
    out.mkdir(parents=True, exist_ok=True)

    e = env()
    base, key = e["VITE_SUPABASE_URL"].rstrip("/"), e["VITE_SUPABASE_PUBLISHABLE_KEY"]
    token = json.loads(request(
        f"{base}/auth/v1/token?grant_type=password",
        {"apikey": key, "Content-Type": "application/json"},
        json.dumps({"email": e["VITE_DEV_EMAIL"], "password": e["VITE_DEV_PASSWORD"]}).encode(),
    ))["access_token"]
    auth = {"apikey": key, "Authorization": f"Bearer {token}"}

    manifest = {"tables": {}, "files": 0, "bytes": 0}
    rows = {}
    for t in TABLES:
        data = json.loads(request(f"{base}/rest/v1/{t}?select=*", {**auth, "Range-Unit": "items", "Range": "0-99999"}))
        rows[t] = data
        (out / f"{t}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
        manifest["tables"][t] = len(data)
        print(f"  {t:16} {len(data):>5} rows")

    for m in rows["media"]:
        path = m["storage_path"]
        dest = out / "files" / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        quoted = "/".join(urllib.parse.quote(p) for p in path.split("/"))
        blob = request(f"{base}/storage/v1/object/authenticated/media/{quoted}", auth)
        if not blob:
            sys.exit(f"Empty download for a media file (row {m['id']})")
        dest.write_bytes(blob)
        manifest["files"] += 1
        manifest["bytes"] += len(blob)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"  files            {manifest['files']:>5} ({manifest['bytes'] / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
