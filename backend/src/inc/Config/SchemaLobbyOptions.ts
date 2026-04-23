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

export const SchemaLobbyOptions = Vts.object({
    host: Vts.optional(Vts.string()),
    port: Vts.optional(Vts.number()),
    tincatUser: Vts.optional(Vts.string()),
    tincatPassword: Vts.optional(Vts.string()),
    keepAliveIntervalMs: Vts.optional(Vts.number()),
    clientTimeoutMs: Vts.optional(Vts.number()),
    messageOfTheDay: Vts.optional(Vts.string()),
    allowAnonymousLogin: Vts.optional(Vts.boolean()),
    channels: Vts.optional(Vts.array(SchemaChannelConfig))
});

export type LobbyOptions = ExtractSchemaResultType<typeof SchemaLobbyOptions>;