# E2E tests

Black-box protocol tests that speak the real Tincat V2 wire format to a
running `dist/main.js`. Written in Python so they exercise the server
without any TypeScript in the test path.

## Running

From `backend_lobbyserver/`:

```bash
npm run compile                    # if src changed since last run
bash tests/e2e/run_all.sh          # spins up a fresh server, runs all tests, tears down
```

Or run a single test against a server you started manually:

```bash
node dist/main.js &                # in another terminal
cd tests/e2e
python3 test_stufe3b1_channels_chat.py
```

Each test creates fresh users (the default `InMemoryAccountRepository`
fills from scratch on boot), so tests are not re-runnable against the
same long-running server without a restart — `run_all.sh` does the right
thing.

## Layout

- `tincat_client.py` — shared helpers: CRC-32, frame/packet builders,
  Tincat string obfuscation, `TincatClient` wrapper with
  `handshake_and_login()` / `send()` / `drain_lobby_result()` etc.
- `test_stufe*_*.py` — one test per stufe in the build order:
  - **stufe1** handshake (LOGMEON → LOGONACCEPTED)
  - **stufe2** CUSTOMDATA parse + securityKey rejection
  - **stufe3a** full login chain + MOTD round-trip
  - **stufe3b1** channels + server list + public chat
  - **stufe3b2** registration + friends + private chat + find-user
  - **stufe3b3** alarm + UserJoined/Left/ClosedNet
  - **stufe3b4a** PrivateInfo/PublicInfo
  - **stufe3b4b** PublicData (character blocks) + CharacterSelect
- `test_chat_direction.py` — regression guard so nobody re-inverts the
  `Receive*` (inbound) / `Send*` (outbound) chat typing again.

## Notes

- CRC uses init=0, no final XOR — don't reach for Python's `zlib.crc32`,
  it's a different variant (init=0xFFFFFFFF + XOR on output).
- Tincat's password/CD-key obfuscation (key `"Sacred"`, init=63) is
  implemented in `tincat_client.tincat_encrypt`.
- Chat direction convention: **client sends `Receive*`, server sends
  `Send*`**. Type IDs in `tincat_client.T` make the intent explicit.