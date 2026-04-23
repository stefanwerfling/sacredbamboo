# Sacred bamboo

Clean-room reimplementation of the **Sacred Gold / Sacred Underworld** lobby server in TypeScript. Speaks the original "Tincat2" TCP protocol so unmodified game clients and game-servers can connect.

## Status

The wire protocol is feature-complete: all 56 `SacredMsgType` values have wire-format support and around two thirds ship as implemented request handlers covering the full lobby experience — login, channels, server list, public/private chat, friends, find-user, profile info, character blocks. The remaining outbound-only types (Kick, ServerShutdown, UserKickedFromServer, …) are exposed as admin API on `LobbyServer` for a future HTTP/CLI hook-up.

Verified against the [kryotek777/Sacred-Gold-LobbyServer](https://github.com/kryotek777/Sacred-Gold-LobbyServer) C# reference and the decompiled `tincat2.dll` / `GameServer.exe` under `work/`. End-to-end Python clients in `/tmp/sb_e2e_*.py` exercise every major flow (handshake, CUSTOMDATA round-trip, login, channels, chat, friends, private chat, admin alarm, profile, character blobs).

Not yet verified against a real Sacred client — protocol-level testing only.

## Quick start

```bash
cd backend
npm install
npm run compile
node dist/main.js
```

The server listens on `0.0.0.0:7066` by default and logs to `./logs/` + stdout via figtree's winston setup. `SIGINT` / `SIGTERM` shuts it down gracefully.

## Configuration

Put a `config.json` next to the compiled binary (or `backend/config.json` before compile). The file is optional — sensible defaults are applied when it's missing or partial.

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

- `backend/` — the live TypeScript code (the only compiled target).
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