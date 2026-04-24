import {Request, Response, Router} from 'express';
import {DefaultRoute, StatusCodes} from 'figtree';
import {sacredConfig} from '../../Config/SacredBambooConfig.js';
import {LobbyService} from '../../Services/LobbyService.js';
import {logger} from '../../Util/Logger.js';
import {
    AdminAck,
    SchemaAdminAck,
    SchemaBroadcastRequest,
    SchemaKickRequest,
    SchemaShutdownRequest
} from '../Schemas/AdminSchemas.js';

/**
 * Admin endpoints. All guarded by the `X-Admin-Key` HTTP header that must
 * match `lobby.adminApiKey` from config. If that key is empty the whole
 * group responds 401 — safer default than leaving kick/shutdown open.
 *
 *   POST /json/v1/admin/kick       { permId, reason? }
 *   POST /json/v1/admin/broadcast  { message }
 *   POST /json/v1/admin/shutdown   { message? }
 */
export class AdminRoute extends DefaultRoute {

    public static readonly BASE = 'admin';

    private readonly _lobbyService: LobbyService;

    public constructor(lobbyService: LobbyService) {
        super();
        this._lobbyService = lobbyService;
    }

    private _checkAdminKey = async(req: Request, res: Response): Promise<boolean> => {
        const configured = sacredConfig().get()?.lobby?.adminApiKey ?? '';
        if (configured === '') {
            res.status(401).json({
                statusCode: StatusCodes.UNAUTHORIZED,
                msg: 'admin routes disabled (lobby.adminApiKey not set)'
            });
            return false;
        }
        const provided = String(req.header('X-Admin-Key') ?? '');
        if (provided !== configured) {
            res.status(401).json({
                statusCode: StatusCodes.UNAUTHORIZED,
                msg: 'invalid or missing X-Admin-Key header'
            });
            return false;
        }
        return true;
    };

    public override getExpressRouter(): Router {
        this._post(
            this._getUrl('v1', AdminRoute.BASE, 'kick'),
            this._checkAdminKey,
            async(req, _res, data): Promise<AdminAck> => {
                const lobby = this._lobbyService.getLobbyServer();
                if (lobby === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'lobby not running'};
                }
                const body = data.body!;
                const reason = body.reason ?? 'Kicked by administrator';
                const ok = lobby.kickByPermId(body.permId, reason);
                if (!ok) {
                    return {
                        statusCode: StatusCodes.INTERNAL_ERROR,
                        msg: `no logged-in client with permId=${body.permId}`
                    };
                }
                logger.info(`http admin: kick permId=${body.permId} reason="${reason}" from=${req.ip}`);
                return {statusCode: StatusCodes.OK, action: 'kick', target: String(body.permId)};
            },
            {
                description: 'Kick a logged-in client by permId. Requires X-Admin-Key.',
                tags: ['admin'],
                bodySchema: SchemaKickRequest,
                responseBodySchema: SchemaAdminAck
            }
        );

        this._post(
            this._getUrl('v1', AdminRoute.BASE, 'broadcast'),
            this._checkAdminKey,
            async(req, _res, data): Promise<AdminAck> => {
                const lobby = this._lobbyService.getLobbyServer();
                if (lobby === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'lobby not running'};
                }
                const body = data.body!;
                lobby.broadcastServerImportantMessage(body.message);
                logger.info(`http admin: broadcast from=${req.ip} text=${JSON.stringify(body.message)}`);
                return {statusCode: StatusCodes.OK, action: 'broadcast'};
            },
            {
                description: 'Broadcast a server-important message to every logged-in client.',
                tags: ['admin'],
                bodySchema: SchemaBroadcastRequest,
                responseBodySchema: SchemaAdminAck
            }
        );

        this._post(
            this._getUrl('v1', AdminRoute.BASE, 'shutdown'),
            this._checkAdminKey,
            async(req, _res, data): Promise<AdminAck> => {
                const lobby = this._lobbyService.getLobbyServer();
                if (lobby === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'lobby not running'};
                }
                const body = data.body!;
                const message = body.message ?? 'Server is shutting down';
                logger.warn(`http admin: shutdown requested from=${req.ip} message=${JSON.stringify(message)}`);
                lobby.initiateServerShutdown(message);
                return {statusCode: StatusCodes.OK, action: 'shutdown'};
            },
            {
                description: 'Broadcast a shutdown notice and stop the lobby server.',
                tags: ['admin'],
                bodySchema: SchemaShutdownRequest,
                responseBodySchema: SchemaAdminAck
            }
        );

        return super.getExpressRouter();
    }

}