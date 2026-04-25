# Sacred bamboo

Clean-room reimplementation of the **Sacred Gold / Sacred Underworld** lobby server in TypeScript. Speaks the original "Tincat2" TCP protocol so unmodified game clients and game-servers can connect.

## Status

The wire protocol is feature-complete: all 56 `SacredMsgType` values have wire-format support and around two thirds ship as implemented request handlers covering the full lobby experience — login, channels, server list, public/private chat, friends, find-user, profile info, character blocks. The remaining outbound-only types (Kick, ServerShutdown, UserKickedFromServer, …) are exposed as admin API on `LobbyServer` for a future HTTP/CLI hook-up.

Verified against the [kryotek777/Sacred-Gold-LobbyServer](https://github.com/kryotek777/Sacred-Gold-LobbyServer) C# reference and the decompiled `tincat2.dll` / `GameServer.exe` under `work/`. An end-to-end test suite under `backend_lobbyserver/tests/e2e/` exercises every major flow (handshake, CUSTOMDATA, login, channels, chat, friends, private chat, admin alarm, profile, character blobs) — run `bash tests/e2e/run_all.sh` from `backend_lobbyserver/`.

Not yet verified against a real Sacred client — protocol-level testing only.

## Quick start

The repo is an npm workspaces monorepo with three packages: `backend_core` (shared protocol), `backend_lobbyserver`, `backend_gameserver`. Install everything once at the top, build per workspace.

```bash
npm install                  # installs all three workspaces
npm run build                # build everything in dependency order
npm run build:core           # or just backend_core
npm run build:lobby          # backend_lobbyserver
npm run build:gameserver     # backend_gameserver
```

To run the lobby:

```bash
cd backend_lobbyserver
node dist/main.js
```

The lobby listens on `0.0.0.0:7066` by default and logs to `./logs/` + stdout via figtree's winston setup. `SIGINT` / `SIGTERM` shuts it down gracefully.

To run the gameserver against a running lobby:

```bash
cd backend_gameserver
node dist/main.js            # listens on 0.0.0.0:7080, registers itself with the lobby on 127.0.0.1:7066
```

To run the lobby's E2E suite:

```bash
cd backend_lobbyserver
bash tests/e2e/run_all.sh   # boots a fresh server, runs all tests, tears it down
```

## Configuration

Put a `config.json` next to the compiled binary (or `backend_lobbyserver/config.json` before compile). The file is optional — sensible defaults are applied when it's missing or partial.

```jsonc
{
  "lobby": {
    "host": "0.0.0.0",
    "port": 7066,
    "tincatUser": "user",        // outer Tincat-layer credentials
    "tincatPassword": "",        // (per-account auth is separate)
    "keepAliveIntervalMs": 15000,
    "clientTimeoutMs": 60000,
    "messageOfTheDay": "Welcome!",
    "allowAnonymousLogin": true,
    "channels": [
      {"id": 1, "name": "General", "flags": 0}
    ]
  },
  "logging": {
    "dirname": "logs",
    "level": "info"
  },
  "db": {
    "mysql": {                   // OPTIONAL: enables persistent accounts
      "host": "127.0.0.1",
      "port": 3306,
      "username": "sacredbamboo",
      "password": "...",
      "database": "sacredbamboo"
    }
  }
}
```

- If `db.mysql.database` is a non-empty string, accounts persist in MariaDB (figtree's `MariaDBService` + typeorm, table `sacred_account` auto-created). Otherwise an in-memory repository is used, pre-seeded with the configured `tincatUser`.
- Override the config path with `SACREDBAMBOO_CONFIG=/path/to/config.json` or the `--config` CLI arg.

## Repository layout

- `backend_core/` — shared library: the Tincat V2 wire layer (CRC, envelope, handshake) plus the Sacred lobby CUSTOMDATA framing (`SacredPacket`, `SacredMsgType`, `SACRED_PACKET_META`) and the message bodies used on both sides of the lobby↔gameserver handshake (`ServerInfoMessage`, `LobbyResultMessage`, …). Built to `dist/` and consumed by the two backends as `sacredbamboo-core` (file:`../backend_core` workspace dep).
- `backend_lobbyserver/` — the live lobby TypeScript code (feature-complete).
- `backend_gameserver/` — early skeleton of the GameServer reimplementation. Boots a Tincat V2 listener (default `0.0.0.0:7080`) with the same handshake the lobby implements, plus an outbound `LobbyUplink` that registers this server with the configured lobby. Inbound CUSTOMDATA handlers for actual game-clients still pending — they get added as their wire layout is reverse-engineered from `work/GameServer.c_split/`.
- `work/` — reverse-engineering artefacts: the decompiled `tincat2.c` / `GameServer.c`, a per-function split with semantic bucketing in `tincat2.c_split/` and `GameServer.c_split/`, plus Python analysers under `work/analyser/`. These are research inputs, not build inputs.
- `notes/samples.txt` — links to the C# reference implementations that informed the protocol work.
- `frontend/` — empty placeholder.

See [CLAUDE.md](./CLAUDE.md) for the architecture deep-dive aimed at future contributors (and at Claude Code when it edits this repo).

## References

- **kryotek777/Sacred-Gold-LobbyServer** (C#) — primary protocol reference for CUSTOMDATA sub-packet layouts and handler semantics.
- **pnxr/sacred2-lobby-emulator** (C#) — secondary reference.
- `work/tincat2.c` — decompiled tincat2.dll, source of the Tincat V2 wire-layer details (CRC-32, envelope format, login handshake).
- `work/GameServer.c` — decompiled game binary, source of the higher-level lobby semantics.

## License

See `LICENSE`.