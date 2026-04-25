import {ExtractSchemaResultType, Vts} from 'vts';

/**
 * Top-level configuration for the Sacred GameServer. Mirrors the shape of
 * `SchemaLobbyOptions` in backend_lobbyserver — keep the two close so
 * operators moving between the two backends have a consistent feel.
 *
 * `lobbyHost` / `lobbyPort` are where this GameServer will register itself
 * with the Lobby (the ServerLogin flow). They default to 127.0.0.1:7066
 * which matches `backend_lobbyserver`'s own default port.
 */
export const SchemaGameServerOptions = Vts.object({
    host: Vts.optional(Vts.string()),
    port: Vts.optional(Vts.number()),
    serverName: Vts.optional(Vts.string()),
    lobbyHost: Vts.optional(Vts.string()),
    lobbyPort: Vts.optional(Vts.number()),
    /** Username for the tincat-layer LOGMEON when uplinking to the lobby. */
    lobbyTincatUser: Vts.optional(Vts.string()),
    /** Password for the tincat-layer LOGMEON when uplinking to the lobby. */
    lobbyTincatPassword: Vts.optional(Vts.string()),
    /** Channel id this server registers itself in (matches a `channels[].id` on the lobby). */
    lobbyChannelId: Vts.optional(Vts.number()),
    /** NetworkVersion field in ServerInfo — the lobby has no policy on this; mirror the client. */
    networkVersion: Vts.optional(Vts.number()),
    /** ClientGameVersion field in ServerInfo — the lobby has no policy on this; mirror the client. */
    clientGameVersion: Vts.optional(Vts.number()),
    maxUsers: Vts.optional(Vts.number()),
    keepAliveIntervalMs: Vts.optional(Vts.number()),
    clientTimeoutMs: Vts.optional(Vts.number())
});

export type GameServerOptions = ExtractSchemaResultType<typeof SchemaGameServerOptions>;