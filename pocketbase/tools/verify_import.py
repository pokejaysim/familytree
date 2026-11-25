#!/usr/bin/env python3
"""Check a PocketBase import against the Supabase export it came from, field by field.

Usage (on the Pi):  python3 -I verify_import.py <exportDir> <pb_data dir>

Compares every row and every column (links, text, dates, timestamps, numbers, flags,
portraits) and every media file byte for byte. Prints counts only, never family details.
Exits non-zero if anything differs.
"""
import hashlib
import json
import pathlib
import re
import sqlite3
import sys

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]00:?00)$")  # Supabase returns UTC

TABLES = ["trees", "people", "families", "family_children", "sources", "events", "citations", "media"]
LINKS = {"tree_id": "tree", "person_id": "person", "family_id": "family", "source_id": "source",
         "event_id": "event", "partner1_id": "partner1", "partner2_id": "partner2"}
SKIPPED = {"owner_id"}  # accounts are linked in phase 2


def norm(sb_value, pb_value):
    """Return (expected, actual) in a comparable form."""
    if sb_value is None:
        return "", ("" if pb_value in (None, "", 0, "0", "[]", "null") else pb_value)
    if isinstance(sb_value, bool):
        return int(sb_value), int(pb_value or 0)
    if isinstance(sb_value, (int, float)):
        return sb_value, pb_value
    s = str(sb_value)
    if DATE.match(s):                                            # date: 1949-02-07
        return s, str(pb_value)[:10]
    if TIMESTAMP.match(s):                                       # timestamp: compare to the millisecond (UTC)
        return s[:19].replace("T", " ") + (s[19:23] if s[19:20] == "." else ".000").ljust(4, "0"), str(pb_value)[:23]
    return s, pb_value


def main():
    export, pb_data = map(pathlib.Path, sys.argv[1:3])
    db = sqlite3.connect(f"file:{pb_data / 'data.db'}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    col_ids = {r["name"]: r["id"] for r in db.execute("select id, name from _collections")}
    problems = 0

    for table in TABLES:
        rows = json.loads((export / f"{table}.json").read_text())
        pb = {r["id"]: dict(r) for r in db.execute(f"select * from {table}")}
        checked = bad = 0
        if table == "family_children":  # no IDs in Supabase: match on (family, person)
            pb = {(r["family"], r["person"]): r for r in pb.values()}
        for row in rows:
            key = (row["family_id"], row["person_id"]) if table == "family_children" else row["id"]
            rec = pb.get(key)
            if rec is None:
                bad += 1
                continue
            for col, val in row.items():
                if col in SKIPPED or (col == "id" and table == "family_children"):
                    continue
                if col == "photo_path":
                    want = "" if not val else next((m["id"] for m in json.loads((export / "media.json").read_text()) if m["storage_path"] == val), "?")
                    got = rec["photo"] or ""
                else:
                    want, got = norm(val, rec[LINKS.get(col, col)])
                checked += 1
                if want != got:
                    bad += 1
        extra = len(pb) - len(rows)
        print(f"  {table:16} rows {len(rows):>4} in export, {len(pb):>4} in PocketBase | {checked:>5} values checked, {bad} different")
        problems += bad + abs(extra)

    files_ok = files_bad = 0
    for m in json.loads((export / "media.json").read_text()):
        rec = db.execute("select file from media where id = ?", (m["id"],)).fetchone()
        stored = pb_data / "storage" / col_ids["media"] / m["id"] / (rec["file"] if rec else "missing")
        src = export / "files" / m["storage_path"]
        same = stored.is_file() and hashlib.sha256(stored.read_bytes()).digest() == hashlib.sha256(src.read_bytes()).digest()
        files_ok += same
        files_bad += not same
    print(f"  files            {files_ok} identical, {files_bad} missing or different")
    problems += files_bad

    print("ALL MATCH" if problems == 0 else f"PROBLEMS: {problems}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
