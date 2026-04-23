# TODO

Open items surfaced during the stufe-by-stufe build, grouped by scope.

## Before testing against a real Sacred client

- [ ] **Test against the original game** — so far everything is verified protocol-level against Python clients and the C# reference. Edge cases (endianness corners, string padding, alignment) will only surface with a real `sacred.exe`.
- [ ] **Win-1252 codec** — currently implemented via Node's `latin1`, which agrees with Windows-1252 everywhere except 0x80–0x9F. If Euro signs / smart quotes / TM symbols show up in chat or usernames, swap `Util/Win1252.ts` to `iconv-lite`.
- [ ] **PacketSecurityHeader.checksum** — always written as `0` and not validated (matches the Sacred-Gold-LobbyServer's TODO comment). If a real client rejects this, reverse-engineer the algorithm from `work/GameServer.c_split/`.

## Persistence (3b.5 follow-ups)

Everything except Accounts lives in RAM. Pick up by adding a typeorm entity + repository behind the existing interface pattern.

- [ ] `FriendRegistry` → `FriendEntity` (owner_perm_id, friend_perm_id) + `MariaDbFriendRepository`. Load on account login, persist on Add/RemoveFriend.
- [ ] `ProfileStore` → extend `AccountEntity` with `mail` column (or separate `ProfileEntity`). ReceivePrivateInfo currently logs and drops password-change because `IAccountRepository` has no `updatePassword` — add that method when entities land.
- [ ] `CharacterStore` → `CharacterBlockEntity` (perm_id, block_id, data blob, size). Block uploads up to 131 KB; pick `LONGBLOB` column type.
- [ ] `ChatHistory` replay — the C# reference replays recent channel chat to a new joiner. We don't; adding it means a bounded deque per channel persisted optionally.
- [ ] Password hashing — `AccountEntity.password` is plaintext. Swap to bcrypt (dep is already present in `package.json`) with a one-shot migration that re-hashes existing rows or flags them for next-login rehash.

## Handler stubs that are not feature-complete

- [ ] `ReceivePrivateInfoHandler` — password change acks `ChangePrivateInfoSuccess` + ImportantMessage explaining the no-op. Wire to `IAccountRepository.updatePassword` once that exists.
- [ ] `ReceivePublicInfoHandler` — accepts + acks a username change, then does nothing. Either reject or actually rename (broadcast UpdateFriendStatus to watchers).
- [ ] `ClosedNetNewCharacterHandler` — logs + acks Ok. The reference calls `Database.InitSaveFile(permId, blockId, templateId, charName)` to allocate a persistent save slot. Needs the CharacterStore persistence first.
- [ ] `TIMESYNC` — currently echoed back without parsing. Reference server doesn't handle it either, so low priority — but if a real client depends on a timestamp answer, this will stall sync.
- [ ] `ServerListRequestHandler` — we skip the "separator server" pseudo-entries the C# reference adds for client-side UI grouping. Consider adding via config.

## Admin / operations

The outbound-only admin packets have sender helpers on `LobbyServer` but no trigger:

- [ ] HTTP admin endpoint via figtree's `HttpService` with POST routes: `/admin/kick`, `/admin/broadcast`, `/admin/shutdown`. Will also need auth middleware.
- [ ] CLI admin tool (alt to HTTP) — a small Node CLI that opens a local socket into the running service and invokes `broadcastServerImportantMessage` / `kickByPermId` / `initiateServerShutdown`.
- [ ] **Ban lists** — reference checks `Config.IsBanned(ip, BanType.ClientOnly | .ServerOnly | .Full)` on every accept. We don't. Add `lobby.bans: {ip, type}[]` to config + a helper in `LobbyServer`.
- [ ] **Alarm routing** — `AlarmHandler` currently only logs. Consider routing to an admin chat / webhook / email.

## Reverse-engineering follow-ups

- [ ] `GameServer.c_split/`: the `items_weapons` and `game_world` buckets are empty because domain keywords (`EWT_*`, `Campaign`, `Bronze Difficulty`, …) live in the data section (`00_data.c`) as global tables, not in function bodies. A second-pass analyser should follow `off_XXXXXX`/`unk_XXXXXX` global references from functions to the string-table addresses and tag the callers accordingly.
- [ ] `GameServer.c_split/unclassified/`: 1355 functions are still unreachable from any seed bucket because they hang on super-hubs like `sub_50F7F0` (555 callers, 1-line wrapper around `free`) that the CRT regex didn't match. An in-degree-based heuristic pass (`called_by > 50 && line_count ≤ 3 && no strings` → `crt_stl`) would absorb them.

## Known cosmetic / low-priority

- [ ] `frontend/` directory is empty — remove or actually build something.
- [ ] `ClientType` enum only has `Unknown / GameClient / GameServer` — the C# reference also has a `None` sentinel for outbound-only allowed-clients checks. We folded that into the `AllowedClients` bitmask which is cleaner; nothing to change unless the `ClientType` enum ends up needing a `None` case too.
- [ ] Logger: figtree's `DailyRotateFile` tries to `scandir` the log directory at boot; if the directory doesn't exist yet it logs a one-time ENOENT error and then recreates it. Harmless but ugly on first run — could pre-create via the Logger defaults.
- [ ] `work/analyser/split_gameserver_by_vocab.py` — the script name still says "gameserver" even though it's generic now (takes any `.c` file as argv). Rename to `split_c_by_vocab.py` for clarity.