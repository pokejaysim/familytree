#!/usr/bin/env bash
# Convert Grandpa's old Word .doc files to plain text using macOS textutil,
# so they can be read and transcribed into Sources in the app.
# Usage: scripts/extract-doc-text.sh [source-dir] [out-dir]
set -euo pipefail
SRC="${1:-$HOME/Documents/Documents - Jason’s MacBook Pro/Grandpa's Files from floppy Disks}"
OUT="${2:-docs/grandpa-text}"
mkdir -p "$OUT"
find "$SRC" -iname '*.doc' -print0 | while IFS= read -r -d '' f; do
  name="$(basename "${f%.*}")"
  textutil -convert txt -output "$OUT/$name.txt" "$f" && echo "→ $OUT/$name.txt"
done
echo "TIF scans (view with Preview, upload as photos/documents in the app):"
find "$SRC" -iname '*.tif' -o -iname '*.tiff'
