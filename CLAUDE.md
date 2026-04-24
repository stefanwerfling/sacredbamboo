# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TypeScript reimplementation of the **Sacred Gold** lobby server. Speaks the original Tincat V2 TCP protocol; a Sacred client can connect unmodified. Status, config, and user-facing setup live in [README.md](./README.md); this file is the architectural brief for code work.

## Repository layout

- `backend_lobbyserver/` — live TypeScript server (the only build target).
- `work/` — reverse-engineering workspace. Contains the raw decompiled `tincat2.c` + `GameServer.c`, plus bucketed per-function splits under `tincat2.c_split/` and `GameServer.c_split/` with `index.json` call-graph databases. Python analysers under `work/analyser/`. **Research input only** — do not import into the backend.
- `notes/samples.txt` — links to the two C# reference lobby servers. The `kryotek777/Sacred-Gold-LobbyServer` repo is cloned into `/tmp/sacred-gold-ref/` during development sessions as the authoritative Sacred Gold protocol reference.
- `frontend/` — empty placeholder.

## Commands
All from `backend_lobbyserver/`:

```bash
npm install
npm run compile     # tsc -> dist/ (alias: npm run build)
node dist/main.js   # default port 0.0.0.0:7066
npx eslint 'src/**/*.ts'  # no script wired, but config is present
```

- E2E tests under `backend_lobbyserver/tests/e2e/` (Python). Run all: `bash tests/e2e/run_all.sh` from `backend_lobbyserver/` — boots a fresh server, runs nine stufe-scoped tests serially, reports pass/fail. Shared helpers live in `tests/e2e/tincat_client.py` (`TincatClient.handshake_and_login(name)` gives you a logged-in session); each test is <100 lines of pure assertions. No unit-test runner is wired.
- TypeScript: NodeNext, ES2022, strict, ESM-only (`"type": "module"`). Local imports **must** use the `.js` suffix even in `.ts` sources. `experimentalDecorators` + `emitDecoratorMetadata` on — typeorm needs them.
- ESLint extends `eslint:all` with 4-space indent, single quotes, semicolons, `padded-blocks` around classes, `prefer-arrow`. Match the existing style when editing.

## Architecture

### Top-level (figtree-based)

Everything runs inside figtree's `BackendApp` framework. Entry: `backend_lobbyserver/src/main.ts` → `new SacredBambooBackend().start()`.

```
SacredBambooBackend   extends figtree.BackendApp
├─ _getConfigInstance() → SacredBambooConfig  (vts-validated, adds `lobby` + `channels` to ConfigBackendOptions)
├─ _getArgSchema()      → SchemaDefaultArgs   (figtree's --config / --envargs)
└─ _initServices()      → picks IAccountRepository (MariaDbAccountRepository if db.mysql.database set, else InMemory)
                          adds MariaDBService (conditional) + LobbyService to figtree's ServiceManager
```

Framework-provided (don't reinvent): config.json discovery, env-var overlay, winston logger with rotation (under `logs/` by default, see `SacredBambooConfig._applyDefaults`), uncaughtException handlers, graceful shutdown via `async-exit-hook`.

Config singleton is a quirk: figtree's `Config._instance` is a **single static slot across all subclasses**. `SacredBambooConfig.ts` exports a module-level `sacredConfig()` factory that constructs the typed instance once and plants it into figtree's slot via an `any`-cast — call sites use `sacredConfig().get()?.lobby?…` and get full typing; do NOT call `Config.getInstance()` directly.

### Tincat wire layer

Runs inside `LobbyService` (a `ServiceAbstract`). The TCP server is a `figtree.RawServer` subclass (`LobbyServer`); each accepted socket becomes a `SacredClient` (subclass of `figtree.RawClient`).

Wire framing (from `work/tincat2.c_split/unclassified/1000CBC0_sub_1000CBC0.c` & `1000CC50`):

```
[ TincatPacketV2 header: 28 bytes ][ payload: N bytes ]
  +0   u32  magic           0xDABAFBEF
  +4   i32  from            connection id or TincatHandles constant
  +8   i32  to              connection id or TincatHandles constant
  +12  i32  msgType         TincatPacketTypes
  +16  i32  unknown16       not set by known senders
  +20  i32  payloadLength
  +24  u32  checksum        CRC-32 over payload (init=0, no final XOR — NOT zlib's default)
```

Header and payload are sent as **two separate `socket.write`s** to match tincat2.dll's envelope handling. On receive, `SacredClient._drain()` accumulates any chunking and consumes one complete packet at a time.

Key handles (`Util/TincatHandles.ts`): `SERVER = 0xEFFFFFCC`, `CLIENT_ME = 0xEFFFFFEE`, `BROADCAST = 0xEFFFFFDD`.

CRC-32 implementation (`Util/Crc32.ts`): standard IEEE polynomial `0xEDB88320`, **init=0, no final XOR** — differs from Node's zlib CRC in both respects. If a test script uses `zlib.crc32`, it will fail checksum; use `Crc32.compute()` or the manual table-driven loop in the Python E2E scripts.

### CUSTOMDATA sub-protocol

`TincatPacketTypes.CUSTOMDATA = 2` is the opaque carrier for the lobby protocol proper. `SacredClient._onCustomData` parses a `SacredPacket`:

```
[moduleId u16 = 9910][subType i16][PacketSecurityHeader 14B][body N]
  securityHeader = type(u16) + securityKey(u32) + length(i32=14+N) + checksum(u32=0)
```

`SACRED_PACKET_META` (`Packets/SacredPacketMeta.ts`) is the per-sub-type metadata table: expected body length, required `securityKey`, `dynamicSize` flag, and `AllowedClients` bitmask. `SacredPacket.parse()` validates all of them; failures throw `SacredPacketParseError` and the client is dropped.

The reference's C# `PacketDictionary` has a typo — `Alarm` says `Length: 0`; we use `14` (pure security-header, no body), matching every other EmptyMessage entry.

### Handler dispatch

`SacredClient._onCustomData` hands the parsed packet to `LobbyServer.getMessageRegistry().dispatch()`. The registry is a `Map<SacredMsgType, ISacredMessageHandler>`; LobbyService registers all handlers at boot.

Handler interface:
```ts
interface ISacredMessageHandler {
    getType(): SacredMsgType;
    handle(client: SacredClient, packet: SacredPacket): void | Promise<void>;
}
```

Unhandled types are debug-logged and dropped without closing the connection. Exceptions inside a handler are caught by the registry and logged; they never kill the receive loop.

### State stores

All live in `backend_lobbyserver/src/inc/State/`:

- `ChannelRegistry` — id → ChannelInfo + live member Set<SacredClient>. Join/leave is idempotent. Counts (user/game) are derived from live membership at serialize time, not stored.
- `ServerRegistry` — serverId → {SacredClient, ServerInfoMessage}. GameServer lifecycle tracked via `ServerLoginRequest` / `ServerLogout` / socket close.
- `FriendRegistry` — dual-index: forward (owner permId → Set<friend permId>) + reverse (friend permId → Set<owner permId>). The reverse index makes `broadcastFriendStatus` O(|watchers|) on login/logout.
- `ProfileStore` — permId → {mail}. In-memory only.
- `CharacterStore` — permId → Map<blockId, Buffer> for PublicData blocks, plus permId → selectedBlockId. In-memory only.

Persistence (stufe 3b.5): `IAccountRepository` has two implementations — `InMemoryAccountRepository` and `MariaDbAccountRepository`. Wired in `SacredBambooBackend._initServices`. The other stores are RAM-only; adding MariaDB-backed friends/characters would mean new entities under `Db/Entity/` and new repositories behind the same pattern.

### Packet class conventions

In `backend_lobbyserver/src/inc/Packets/`:
- `ATincatPacket` — base with `getType()`/`serialize()`.
- `ATincatPacketConnection` — 52-byte connection-control base (LOGMEON/LOGMEOFF/LOGONACCEPTED/LOGOFFACCEPTED).
- `TincatPacketV2.serializeHeader(payload)` computes the CRC on the fly and returns the 28 header bytes.
- One class per tincat packet type in `Packets/*.ts`; one class per CUSTOMDATA sub-type body in `Packets/Messages/*.ts`. Bodies expose `BODY_SIZE`, `static parse(Buffer)`, and instance `serialize(): Buffer`.

Strings in message bodies are **plain Windows-1252** (handled via `Util/Win1252.ts`, currently implemented as latin1 which agrees everywhere except 0x80-0x9F — note in the Win1252 file). The three password/CD-key fields in `LoginMessage` and `RegistrationMessage` are additionally obfuscated with `TincatCrypto` (stateful XOR against the key `"Sacred"`, `init=63`; matches `Utils.TincatEncrypt` in the C# reference).

### Chat direction naming

Reference convention: `Receive*` is client→server ("please deliver this chat"), `Send*` is server→client ("here's your chat to show"). The handlers are named after the *inbound* type — e.g. `ReceiveChatMessageHandler` handles client→server type 30 and replies by broadcasting `SendChatMessage` (type 31) to the other channel members via `SacredClient.sendChatMessage()`. Same pattern for private (32/33).

This was inverted in an earlier iteration and fixed in Phase 1 of stufe 3b's final pass; any E2E scripts that predate the fix used the opposite convention.

## Adding a new handler (cookbook)

1. Add the `SacredMsgType` enum value if it's missing (`Packets/SacredMsgType.ts`).
2. Add its metadata to `SACRED_PACKET_META` in `Packets/SacredPacketMeta.ts`: `length`, `securityKey`, `dynamicSize`, `allowedClients`. Source values from:
   - `/tmp/sacred-gold-ref/src/Types/PacketSecurityData.cs` (length + securityKey)
   - the C# reference's `AllowedClients` field
3. If the packet has a structured body, add a class under `Packets/Messages/` mirroring the C# `*Data.cs` struct (same field order, same widths, `Pack=1` means no padding). Include the `BODY_SIZE` constant and static `parse` / instance `serialize`. Source layouts from `/tmp/sacred-gold-ref/src/Types/Messages/Data/*.cs`.
4. If the body contains state you want reused, add a sender helper on `SacredClient` (e.g. `sendFoo(...)`). Name it after what the *receiver* sees — e.g. `sendChatMessage` for the outbound `SendChatMessage` packet.
5. Create a handler class under `Handlers/` implementing `ISacredMessageHandler`. Keep handlers thin — the heavy lifting lives in the state stores or sender helpers. **Always** ack with a `LobbyResult(code, action)` where `action` is the inbound type, so the client's state machine can correlate.
6. Register the handler in `Services/LobbyService.start()` in the matching section (Stufe 3a/3b.1/3b.2/3b.3/3b.4a/3b.4b).
7. Add a test under `backend_lobbyserver/tests/e2e/test_<stufe>_<feature>.py` importing `from tincat_client import T, K, TincatClient, ...`. Extend `tincat_client.py`'s `T` / `K` dicts if the new type isn't already listed. Add the test filename to `run_all.sh`. Verify with `bash tests/e2e/run_all.sh`.

## Known gotchas

- **ESM suffixes**: every local import ends in `.js` even in `.ts` sources. TS compile errors if you forget.
- **Config-Singleton quirk**: `Config._instance` is shared across all Config subclasses in figtree. Use `sacredConfig()` from `Config/SacredBambooConfig.ts` rather than `Config.getInstance()`.
- **CRC-32 variant**: init=0, no final XOR. `zlib.crc32` in Python or Node uses init=0xFFFFFFFF and final XOR — will not match.
- **Alarm meta length**: the C# `PacketDictionary` says 0; our table has 14 (consistent with every other EmptyMessage entry). Keep it 14.
- **SacredMessage body padding**: `PublicData` (block uploads) is declared as a fixed 131 090-byte struct in the reference. We emit the full struct even when `length` is much smaller — the client expects field offsets by struct layout.
- **permId spoofing**: `ReceivePublicData` enforces `packet.permId === client.permId`; `ReceiveClientPublicDataFromServer` does not (a GameServer is expected to write on behalf of a user). Mirror this policy when adding similar handlers.
- **Logger config path**: figtree's default log directory is `/var/log/<appname>/`, which needs root. We override to `logs/` (relative to cwd) in `SacredBambooConfig._applyDefaults`.
- **figtree `DBLoader`**: subclasses must re-declare static `loadEntities` / `loadMigrations` (see `Db/SacredBambooDbLoader.ts`) — the base class throws by default.

## Reverse-engineering workspace

Two big decompiled C files under `work/`:
- `tincat2.c` (39k lines, 1081 functions) — the networking DLL. Split by vocabulary buckets under `tincat2.c_split/`. `index.json` has the full call graph (forward + reverse), bucket classifications, string literals per function.
- `GameServer.c` (196k lines, 5274 functions) — the game binary. Same split under `GameServer.c_split/`.

Use the `index.json` files to navigate: filter by bucket (`jq '.[] | select(.bucket=="network")'`), follow `calls` / `called_by` to trace flow, look at `strings` to identify a function by its log messages.

The analyser scripts under `work/analyser/` (`split_gameserver_by_vocab.py`, `propagate_buckets.py`) regenerate these splits from the raw `.c` files; useful when the decompiler output changes.

## Protocol references

When a packet layout is non-obvious:

1. **C# reference** (`/tmp/sacred-gold-ref/`, `notes/samples.txt`): `src/Types/Messages/Data/*.cs` for bytes-on-the-wire, `src/LobbyServer.cs` for handler semantics, `src/Types/SacredClient.cs` for outbound sender patterns. This is the highest-signal source.
2. **Decompiled tincat2** (`work/tincat2.c_split/`): authoritative for the wire layer (CRC, envelope, handshake). Less useful for CUSTOMDATA semantics.
3. **Decompiled GameServer** (`work/GameServer.c_split/`): last-resort when the C# reference omits a code path. Use the bucketed index to find the relevant network functions.