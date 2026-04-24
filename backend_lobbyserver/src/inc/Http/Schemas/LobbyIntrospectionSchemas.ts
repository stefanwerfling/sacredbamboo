import {SchemaDefaultReturn} from 'figtree';
import {ExtractSchemaResultType, Vts} from 'vts';

/**
 * Shared response wrappers for the read-only introspection routes.
 * Each list endpoint returns `{statusCode, items}` so clients can
 * differentiate an empty list from an error.
 */

export const SchemaServerEntry = Vts.object({
    serverId: Vts.number({description: 'Lobby-assigned id (= tincat connection id)'}),
    name: Vts.string(),
    channelId: Vts.number(),
    playerCount: Vts.number(),
    playerMax: Vts.number(),
    flags: Vts.number(),
    port: Vts.number(),
    lanIp: Vts.string({description: 'Dotted-quad IP the server advertised'}),
    externalIp: Vts.string({description: 'Peer IP observed by the lobby'}),
    networkVersion: Vts.number(),
    clientGameVersion: Vts.number(),
    peer: Vts.string({description: 'host:port of the TCP connection'})
});

export type ServerEntry = ExtractSchemaResultType<typeof SchemaServerEntry>;

export const SchemaServerListResponse = SchemaDefaultReturn.extend({
    items: Vts.optional(Vts.array(SchemaServerEntry))
});

export type ServerListResponse = ExtractSchemaResultType<typeof SchemaServerListResponse>;

export const SchemaChannelEntry = Vts.object({
    id: Vts.number(),
    name: Vts.string(),
    flags: Vts.number(),
    authorizedOnly: Vts.boolean(),
    userCount: Vts.number({description: 'Live count of joined GameClients'}),
    gameCount: Vts.number({description: 'Live count of joined GameServers'})
});

export type ChannelEntry = ExtractSchemaResultType<typeof SchemaChannelEntry>;

export const SchemaChannelListResponse = SchemaDefaultReturn.extend({
    items: Vts.optional(Vts.array(SchemaChannelEntry))
});

export type ChannelListResponse = ExtractSchemaResultType<typeof SchemaChannelListResponse>;

export const SchemaClientEntry = Vts.object({
    peer: Vts.string(),
    connectionId: Vts.number(),
    state: Vts.string({description: 'Connected | LoggedIn | Disconnected'}),
    type: Vts.string({description: 'Unknown | GameClient | GameServer'}),
    username: Vts.string(),
    permId: Vts.number({description: '0 while not yet account-authenticated'}),
    channelId: Vts.number({description: '0 when not joined to any channel'}),
    lastSeenMs: Vts.number({description: 'Milliseconds since last inbound packet'})
});

export type ClientEntry = ExtractSchemaResultType<typeof SchemaClientEntry>;

export const SchemaClientListResponse = SchemaDefaultReturn.extend({
    items: Vts.optional(Vts.array(SchemaClientEntry))
});

export type ClientListResponse = ExtractSchemaResultType<typeof SchemaClientListResponse>;

export const SchemaStatusResponse = SchemaDefaultReturn.extend({
    uptimeSeconds: Vts.optional(Vts.number()),
    lobby: Vts.optional(Vts.object({
        host: Vts.string(),
        port: Vts.number(),
        running: Vts.boolean()
    })),
    counts: Vts.optional(Vts.object({
        connectedClients: Vts.number(),
        loggedInUsers: Vts.number(),
        gameServers: Vts.number(),
        channels: Vts.number()
    }))
});

export type StatusResponse = ExtractSchemaResultType<typeof SchemaStatusResponse>;