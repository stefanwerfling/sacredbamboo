import {ExtractSchemaResultType, Vts} from 'vts';

/**
 * One configured lobby channel. Matches the shape of ChannelInfo and is
 * embedded in the top-level lobby config as an array of channels. Counts
 * (userCount, gameCount) are NOT configured — they're derived live.
 */
export const SchemaChannelConfig = Vts.object({
    id: Vts.number(),
    name: Vts.string(),
    flags: Vts.optional(Vts.number()),
    authorizedOnly: Vts.optional(Vts.boolean())
});

/**
 * Static ban entry. `type` decides which login paths are rejected:
 *   - "full"   drop the TCP accept immediately
 *   - "client" allow the connection; reject at ClientLoginRequest
 *   - "server" allow the connection; reject at ServerLoginRequest
 * `ip` is matched as a literal dotted-quad OR prefix (trailing dot).
 */
export const SchemaBanEntry = Vts.object({
    ip: Vts.string(),
    type: Vts.string(),
    reason: Vts.optional(Vts.string())
});

export const SchemaLobbyOptions = Vts.object({
    host: Vts.optional(Vts.string()),
    port: Vts.optional(Vts.number()),
    tincatUser: Vts.optional(Vts.string()),
    tincatPassword: Vts.optional(Vts.string()),
    keepAliveIntervalMs: Vts.optional(Vts.number()),
    clientTimeoutMs: Vts.optional(Vts.number()),
    messageOfTheDay: Vts.optional(Vts.string()),
    allowAnonymousLogin: Vts.optional(Vts.boolean()),
     channels: Vts.optional(Vts.array(SchemaChannelConfig)),
    /**
     * When a GameServer logs in, the lobby normally rewrites
     * `ServerInfo.externalIp` to the TCP peer it observes and advertises
     * that to clients. In split networks (e.g. a GameServer container on
     * a Docker bridge) the observed IP may be unreachable for real
     * clients; set this to `false` to keep whatever `externalIp` the
     * GameServer itself reported in its `NETWORK_IP_ADDRESS` config.
     * Default: true (legacy behaviour).
     */
    useObservedGameServerIp: Vts.optional(Vts.boolean()),
    bans: Vts.optional(Vts.array(SchemaBanEntry)),
    chatHistoryLimit: Vts.optional(Vts.number({description: 'Max chat messages kept per channel for replay on join. 0 disables history.'})),
    allowedUsernameRegex: Vts.optional(Vts.string({description: 'Registration usernames must match this regex. Empty disables the check.'})),
    adminApiKey: Vts.optional(Vts.string({description: 'If non-empty, HTTP admin routes require X-Admin-Key header with this value.'}))
});

export type LobbyOptions = ExtractSchemaResultType<typeof SchemaLobbyOptions>;