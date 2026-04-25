import {RawClient, RawServer} from 'figtree';
import net from 'net';
import {GameClient} from './Client/GameClient.js';
import {GameMessageRegistry} from './Client/GameMessageRegistry.js';
import {IGameMessageHandler} from './Client/IGameMessageHandler.js';
import {sacredGameServerConfig} from './Config/SacredBambooGameServerConfig.js';
import {logger} from './Util/Logger.js';

/**
 * Tincat V2 server for the Sacred GameServer surface.
 *
 * Mirrors `LobbyServer` from backend_lobbyserver in shape:
 *   - extends figtree's RawServer to accept TCP connections and wrap each
 *     in a `GameClient`,
 *   - allocates connection ids on successful LOGMEON,
 *   - applies a tincat-level credential check (no real auth — auth lands
 *     when we add the GameServer-specific login handler),
 *   - runs a periodic sweeper that emits STAYINGALIVE and times out idle
 *     clients,
 *   - exposes a `GameMessageRegistry` for CUSTOMDATA sub-packet dispatch.
 *
 * State stores (channels, friends, etc. in the lobby) are intentionally
 * absent — the GameServer's domain state lands in later steps once the
 * concrete sub-packet semantics are reverse-engineered from
 * `work/GameServer.c_split/`.
 */
export class GameServer extends RawServer {

    protected _nextConnectionId: number = 1;
    protected _active: Set<GameClient> = new Set();
    protected _sweeperTimer: NodeJS.Timeout | null = null;
    protected _messageRegistry: GameMessageRegistry = new GameMessageRegistry();

    public constructor(port: number, host: string) {
        super(port, host);
    }

    public getMessageRegistry(): GameMessageRegistry {
        return this._messageRegistry;
    }

    /** Snapshot of all currently attached clients — logged-in or not. */
    public getActiveClients(): GameClient[] {
        return Array.from(this._active);
    }

    /** Case-insensitive username lookup. */
    public findByUsername(username: string): GameClient | null {
        const needle = username.toLowerCase();
        for (const c of this._active) {
            if (c.getUsername().toLowerCase() === needle) {
                return c;
            }
        }
        return null;
    }

    public findByPermId(permId: number): GameClient | null {
        for (const c of this._active) {
            if (c.getPermId() === permId) {
                return c;
            }
        }
        return null;
    }

    public registerHandler(handler: IGameMessageHandler): void {
        this._messageRegistry.register(handler);
    }

    /** Iterate every connected & logged-in client. */
    public broadcastToAll(fn: (client: GameClient) => void, exclude?: GameClient): void {
        for (const c of this._active) {
            if (c === exclude || c.getPermId() === 0) {
                continue;
            }
            try {
                fn(c);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logger.warn(`broadcastToAll: ${c.getPeer()} send failed: ${msg}`);
            }
        }
    }

    protected override _createNewClient(socket: net.Socket): RawClient {
        const client = new GameClient(this, socket);
        this._active.add(client);
        return client;
    }

    public override listen(): void {
        super.listen();

        const interval = sacredGameServerConfig().get()?.gameserver?.keepAliveIntervalMs ?? 15000;
        this._sweeperTimer = setInterval(() => this._sweep(), interval);
        this._sweeperTimer.unref();

        logger.info(`game server listening, keep-alive sweep every ${interval}ms`);
    }

    public stop(): void {
        if (this._sweeperTimer !== null) {
            clearInterval(this._sweeperTimer);
            this._sweeperTimer = null;
        }
        for (const client of this._active) {
            client.close();
        }
        this._active.clear();
    }

    public allocateConnectionId(): number {
        const id = this._nextConnectionId;
        this._nextConnectionId = (this._nextConnectionId + 1) & 0x7FFFFFFF;
        if (this._nextConnectionId === 0) {
            this._nextConnectionId = 1;
        }
        return id;
    }

    /**
     * Tincat-layer credential check. The GameServer presently accepts any
     * LOGMEON — real per-account validation will be wired in once the
     * GameServer-specific login flow is implemented. Returning `true`
     * unconditionally mirrors how the lobby treats an empty configured
     * password.
     */
    public authenticate(_username: string, _password: string): boolean {
        return true;
    }

    public onClientLoggedIn(client: GameClient): void {
        logger.info(
            `client ${client.getPeer()} logged in as ${client.getUsername()} ` +
            `(connId=0x${client.getConnectionId().toString(16)})`
        );
    }

    public onClientClosed(client: GameClient): void {
        if (this._active.delete(client)) {
            logger.info(`client ${client.getPeer()} disconnected`);
        }
    }

    protected _sweep(): void {
        const now = Date.now();
        const timeout = sacredGameServerConfig().get()?.gameserver?.clientTimeoutMs ?? 60000;
        for (const client of this._active) {
            if (now - client.getLastSeen() > timeout) {
                logger.warn(`client ${client.getPeer()} timed out after ${timeout}ms of silence`);
                client.close();
                continue;
            }
            client.sendKeepAlive();
        }
    }

}