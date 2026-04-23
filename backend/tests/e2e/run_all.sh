#!/usr/bin/env bash
# Boot a fresh lobby, run every e2e test in order, tear it down.
# Expects `npm run compile` to have been run (so `dist/main.js` is current).
#
# Usage (from backend/):
#   bash tests/e2e/run_all.sh
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="$BACKEND_DIR/tests/e2e"
LOG=$(mktemp)

cd "$BACKEND_DIR"
node dist/main.js >"$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill -TERM $SERVER_PID 2>/dev/null || true; wait $SERVER_PID 2>/dev/null || true' EXIT

sleep 1.2

cd "$E2E_DIR"
fail=0
for t in \
    test_stufe1_handshake.py \
    test_stufe2_customdata.py \
    test_stufe3a_login.py \
    test_stufe3b1_channels_chat.py \
    test_stufe3b2_social.py \
    test_stufe3b3_admin.py \
    test_stufe3b4a_profile.py \
    test_stufe3b4b_character.py \
    test_chat_direction.py; do
    printf '\n--- %s ---\n' "$t"
    if python3 "$t"; then
        :
    else
        fail=1
        echo "FAIL: $t"
    fi
done

if [ $fail -ne 0 ]; then
    echo ""
    echo "Some tests failed. Server log tail:"
    tail -40 "$LOG"
    exit 1
fi

echo ""
echo "ALL E2E TESTS PASSED"