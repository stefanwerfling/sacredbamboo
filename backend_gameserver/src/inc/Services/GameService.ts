import {ServiceAbstract, ServiceImportance} from 'figtree';
import {sacredGameServerConfig} from '../Config/SacredBambooGameServerConfig.js';
import {GameServer} from '../GameServer.js';
import {LobbyUplink} from '../Lobby/LobbyUplink.js';
import {logger} from '../Util/Logger.js';

/**
 * Figtree `ServiceAbstract` wrapper around the Tincat GameServer. Mirrors
 * `LobbyService` from backend_lobbyserver in shape — ServiceManager calls
 * `start()` on boot and `stop()` on graceful shutdown.
 *
 * Currently registers no CUSTOMDATA handlers. Each GameServer feature
 * (login, world tick, character sync, …) lands as its own handler in a
 * later step, registered here in the same place `LobbyService.start()`
 * registers its lobby handlers.
 */
export class GameService extends ServiceAbstract {

    public static NAME = 'game_service';

    protected override readonly _importance: ServiceImportance = ServiceImportance.Critical;

    private _gameServer: GameServer | null = null;
    private _lobbyUplink: LobbyUplink | null = null;

    public constructor() {
        super(GameService.NAME);
    }

    /** Returns the underlying GameServer once start() has run. */
    public getGameServer(): GameServer | null {
        return this._gameServer;
    }

    /** Returns the lobby uplink once start() has run. */
    public getLobbyUplink(): LobbyUplink | null {
        return this._lobbyUplink;
    }

    public override async start(): Promise<void> {
        const cfg = sacredGameServerConfig().get()?.gameserver;
        const host = cfg?.host ?? '0.0.0.0';
        const port = cfg?.port ?? 7080;

        const server = new GameServer(port, host);

        // Inbound CUSTOMDATA handlers are registered here in later steps,
        // e.g.:
        //   server.registerHandler(new GameClientLoginHandler());

        server.listen();
        this._gameServer = server;
        logger.info(`GameService started on ${host}:${port}`);

        // Outbound: register this GameServer with the configured lobby so
        // it shows up in the lobby's server list. Failures retry with
        // backoff; the inbound listener is independent and stays up.
        const uplink = new LobbyUplink();
        uplink.start();
        this._lobbyUplink = uplink;
    }

    public override async stop(): Promise<void> {
        if (this._lobbyUplink !== null) {
            this._lobbyUplink.stop();
            this._lobbyUplink = null;
        }
        if (this._gameServer !== null) {
            this._gameServer.stop();
            this._gameServer = null;
        }
        logger.info('GameService stopped');
    }

}