import {Router} from 'express';
import {DefaultRoute, StatusCodes} from 'figtree';
import {ClientState} from '../../Client/ClientState.js';
import {ClientType} from '../../Client/ClientType.js';
import {SacredClient} from '../../Client/SacredClient.js';
import {sacredConfig} from '../../Config/SacredBambooConfig.js';
import {LobbyService} from '../../Services/LobbyService.js';
import {
    ChannelEntry,
    ChannelListResponse,
    ClientEntry,
    ClientListResponse,
    SchemaChannelListResponse,
    SchemaClientListResponse,
    SchemaServerListResponse,
    SchemaStatusResponse,
    ServerEntry,
    ServerListResponse,
    StatusResponse
} from '../Schemas/LobbyIntrospectionSchemas.js';

/**
 * Read-only introspection endpoints. All routes derive their answers
 * from the LobbyServer's live state — no separate bookkeeping.
 *
 *   GET /json/v1/server/list   — active game servers
 *   GET /json/v1/channel/list  — configured channels + live counts
 *   GET /json/v1/client/list   — currently attached TCP clients
 *   GET /json/v1/status        — summary + uptime
 */
export class LobbyRoute extends DefaultRoute {

    public static readonly BASE_SERVER = 'server';
    public static readonly BASE_CHANNEL = 'channel';
    public static readonly BASE_CLIENT = 'client';
    public static readonly BASE_STATUS = 'status';

    private readonly _lobbyService: LobbyService;
    private readonly _startedAt: number;

    public constructor(lobbyService: LobbyService) {
        super();
        this._lobbyService = lobbyService;
        this._startedAt = Date.now();
    }

    public override getExpressRouter(): Router {
        this._get(
            this._getUrl('v1', LobbyRoute.BASE_SERVER, 'list'),
            false,
            async(): Promise<ServerListResponse> => {
                const lobby = this._lobbyService.getLobbyServer();
                if (lobby === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'lobby not running'};
                }

                const items: ServerEntry[] = [];
                for (const c of lobby.getActiveClients()) {
                    if (c.getType() !== ClientType.GameServer) {
                        continue;
                    }
                    const info = lobby.getServerRegistry().get(c.getConnectionId());
                    if (info === null) {
                        continue;
                    }
                    items.push({
                        serverId: info.serverId,
                        name: info.name,
                        channelId: info.channelId,
                        playerCount: info.playerCount,
                        playerMax: info.playerMax,
                        flags: info.flags,
                        port: info.port,
                        lanIp: info.lanIp.join('.'),
                        externalIp: info.externalIp.join('.'),
                        networkVersion: info.networkVersion,
                        clientGameVersion: info.clientGameVersion,
                        peer: c.getPeer()
                    });
                }
                return {statusCode: StatusCodes.OK, items};
            },
            {
                description: 'List all active GameServers currently registered with the lobby.',
                tags: ['lobby'],
                responseBodySchema: SchemaServerListResponse
            }
        );

        this._get(
            this._getUrl('v1', LobbyRoute.BASE_CHANNEL, 'list'),
            false,
            async(): Promise<ChannelListResponse> => {
                const lobby = this._lobbyService.getLobbyServer();
                if (lobby === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'lobby not running'};
                }

                const registry = lobby.getChannelRegistry();
                const items: ChannelEntry[] = registry.getAll().map((ch) => ({
                    id: ch.id,
                    name: ch.name,
                    flags: ch.flags,
                    authorizedOnly: ch.authorizedOnly,
                    userCount: registry.count(ch.id, ClientType.GameClient),
                    gameCount: registry.count(ch.id, ClientType.GameServer)
                }));
                return {statusCode: StatusCodes.OK, items};
            },
            {
                description: 'List configured channels with live member counts.',
                tags: ['lobby'],
                responseBodySchema: SchemaChannelListResponse
            }
        );

        this._get(
            this._getUrl('v1', LobbyRoute.BASE_CLIENT, 'list'),
            false,
            async(): Promise<ClientListResponse> => {
                const lobby = this._lobbyService.getLobbyServer();
                if (lobby === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'lobby not running'};
                }

                const now = Date.now();
                const items: ClientEntry[] = lobby.getActiveClients().map((c: SacredClient) => ({
                    peer: c.getPeer(),
                    connectionId: c.getConnectionId(),
                    state: ClientState[c.getState()] ?? String(c.getState()),
                    type: ClientType[c.getType()] ?? String(c.getType()),
                    username: c.getUsername(),
                    permId: c.getPermId(),
                    channelId: c.getChannelId(),
                    lastSeenMs: Math.max(0, now - c.getLastSeen())
                }));
                return {statusCode: StatusCodes.OK, items};
            },
            {
                description: 'List currently attached clients (game clients and servers).',
                tags: ['lobby'],
                responseBodySchema: SchemaClientListResponse
            }
        );

        this._get(
            this._getUrl('v1', LobbyRoute.BASE_STATUS, ''),
            false,
            async(): Promise<StatusResponse> => {
                const lobby = this._lobbyService.getLobbyServer();
                const cfg = sacredConfig().get()?.lobby;
                const host = cfg?.host ?? '0.0.0.0';
                const port = cfg?.port ?? 7066;

                if (lobby === null) {
                    return {
                        statusCode: StatusCodes.OK,
                        uptimeSeconds: Math.floor((Date.now() - this._startedAt) / 1000),
                        lobby: {host, port, running: false},
                        counts: {connectedClients: 0, loggedInUsers: 0, gameServers: 0, channels: 0}
                    };
                }

                let loggedIn = 0;
                let gameServers = 0;
                for (const c of lobby.getActiveClients()) {
                    if (c.getType() === ClientType.GameServer) {
                        gameServers++;
                    } else if (c.getPermId() !== 0) {
                        loggedIn++;
                    }
                }

                return {
                    statusCode: StatusCodes.OK,
                    uptimeSeconds: Math.floor((Date.now() - this._startedAt) / 1000),
                    lobby: {host, port, running: true},
                    counts: {
                        connectedClients: lobby.getActiveClients().length,
                        loggedInUsers: loggedIn,
                        gameServers: gameServers,
                        channels: lobby.getChannelRegistry().getAll().length
                    }
                };
            },
            {
                description: 'Lobby summary with uptime, host/port, and live counts.',
                tags: ['lobby'],
                responseBodySchema: SchemaStatusResponse
            }
        );

        return super.getExpressRouter();
    }

}