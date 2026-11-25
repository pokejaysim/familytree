#!/bin/bash
# Run the review-system tests against a THROWAWAY PocketBase built from this repo's code.
# Run it on the server (it needs /opt/pocketbase/pocketbase) from a copy of the pocketbase/ folder:
#
#   bash pocketbase/tools/run_tests_on_server.sh
#
# It never touches the real PocketBase: it makes a temporary folder, applies the migrations,
# creates a throwaway superuser, serves on 127.0.0.1:8099, runs the tests and deletes everything.
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd)
PB=${PB:-/opt/pocketbase/pocketbase}
T=$(mktemp -d /tmp/sft-test.XXXX)
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$T"' EXIT
chmod 700 "$T"
cp -r "$HERE/pb_migrations" "$HERE/pb_hooks" "$T/"

"$PB" migrate up --dir="$T/pb_data" --migrationsDir="$T/pb_migrations" >"$T/migrate.log" 2>&1 || { cat "$T/migrate.log"; exit 1; }
export SU_EMAIL="test-superuser@example.test" SU_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
"$PB" superuser upsert "$SU_EMAIL" "$SU_PASSWORD" --dir="$T/pb_data" >/dev/null
"$PB" serve --http=127.0.0.1:8099 --dir="$T/pb_data" --migrationsDir="$T/pb_migrations" --hooksDir="$T/pb_hooks" >"$T/serve.log" 2>&1 &
PID=$!
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:8099/api/health >/dev/null && break; sleep 0.5; done

python3 -I "$HERE/tools/test_review_system.py" http://127.0.0.1:8099
STATUS=$?
if grep -qiE "error|panic" "$T/serve.log"; then
  echo "--- server messages:"; grep -iE "error|panic|sft:" "$T/serve.log" | grep -v "couldn't send the confirmation email" | tail -20
fi
exit $STATUS
