import {RawClient, RawServer} from 'figtree';
import net from 'net';
import {SacredClient} from './Client/SacredClient.js';
import {ISacredMessageHandler} from './Client/ISacredMessageHandler.js';
import {SacredMessageRegistry} from './Client/SacredMessageRegistry.js';
import {sacredConfig} from './Config/SacredBambooConfig.js';
import {BuddyStatus} from './Packets/Messages/BuddyStatus.js';
import {ChannelRegistry} from './State/ChannelRegistry.js';
import {CharacterStore} from './State/CharacterStore.js';
import {FriendRegistry} from './State/FriendRegistry.js';
import {ProfileStore} from './State/ProfileStore.js';
import {ServerRegistry} from './State/ServerRegistry.js';
import {logger} from './Util/Logger.js';

/**
 * Tincat V2 lobby server.
 *
 * Extends figtree's RawServer to accept TCP connections and wrap each in a
 * SacredClient. Adds:
 *   - connection-id allocation for logged-in clients,
 *   - tincat-level credential check (single shared user/password from config;
 *     the real per-account auth happens one layer up in the
 *     `ClientLoginRequest` handler),
 *   - a periodic sweeper that emits STAYINGALIVE packets and closes
 *     clients that have been silent past the configured timeout,
 *   - a `SacredMessageRegistry` for CUSTOMDATA sub-packet dispatch.
 */
export class LobbyServer extends RawServer {

    protected _nextConnectionId: number = 1;
    protected _active: Set<SacredClient> = new Set();
    protected _sweeperTimer: NodeJS.Timeout | null = null;
    protected _messageRegistry: SacredMessageRegistry = new SacredMessageRegistry();
    protected _channelRegistry: ChannelRegistry;
    protected _serverRegistry: ServerRegistry = new ServerRegistry();
    protected _friendRegistry: FriendRegistry = new FriendRegistry();
    protected _profileStore: ProfileStore = new ProfileStore();
    protected _characterStore: CharacterStore = new CharacterStore();

    public constructor(port: number, host: string, channelRegistry: ChannelRegistry) {
        super(port, host);
        this._channelRegistry = channelRegistry;
    }

    public getMessageRegistry(): SacredMessageRegistry {
        return this._messageRegistry;
    }

    public getChannelRegistry(): ChannelRegistry {
        return this._channelRegistry;
    }

    public getServerRegistry(): ServerRegistry {
        return this._serverRegistry;
    }

    public getFriendRegistry(): FriendRegistry {
        return this._friendRegistry;
    }

    public getProfileStore(): ProfileStore {
        return this._profileStore;
    }

    public getCharacterStore(): CharacterStore {
        return this._characterStore;
    }

    /** Case-insensitive username lookup for FindUser. */
    public findByUsername(username: string): SacredClient | null {
        const needle = username.toLowerCase();
        for (const c of this._active) {
            if (c.getUsername().toLowerCase() === needle) {
                return c;
            }
        }
        return null;
    }

    /**
     * Notify all clients who have `subject` in their friends list that
     * the subject's presence changed. Called on login and on disconnect.
     */
    public broadcastFriendStatus(subject: SacredClient, status: BuddyStatus): void {
        const watchers = this._friendRegistry.getWatchersOf(subject.getPermId());
        for (const watcherPermId of watchers) {
            const watcher = this.findByPermId(watcherPermId);
            if (watcher === null) {
                continue;
            }
            watcher.sendUpdateFriendStatus(
                status,
                subject.getUsername(),
                subject.getPermId(),
                subject.getChannelId(),
                this._channelRegistry.get(subject.getChannelId())?.name ?? ''
            );
        }
    }

    public registerHandler(handler: ISacredMessageHandler): void {
        this._messageRegistry.register(handler);
    }

    /**
     * Find a logged-in client by its account permId. Used by private-chat
     * routing in Stufe 3b.2 and already handy for chat-history replay.
     */
    public findByPermId(permId: number): SacredClient | null {
        for (const c of this._active) {
            if (c.getPermId() === permId) {
                return c;
            }
        }
        return null;
    }

    /**
     * Invoke `fn(client)` for every client currently joined to `channelId`,
     * optionally skipping one (typically the sender of a broadcast).
     */
    public broadcastToChannel(
        channelId: number,
        fn: (client: SacredClient) => void,
        exclude?: SacredClient
    ): void {
        for (const c of this._channelRegistry.getMembers(channelId)) {
            if (c === exclude) {
                continue;
            }
            try {
                fn(c);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logger.warn(`broadcastToChannel: ${c.getPeer()} send failed: ${msg}`);
            }
        }
    }

    /**
     * Iterate every connected & logged-in client. Used for server-wide
     * admin broadcasts (ServerImportantMessage, ShutdownNotice).
     */
    public broadcastToAll(fn: (client: SacredClient) => void, exclude?: SacredClient): void {
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

    /**
     * System chat notice to every user currently in a channel. Mirrors
     * the reference's `BroadcastSystemMessage`. Used by admin actions
     * (Kick, user joined/left server etc.) to nudge the channel roster.
     */
    public broadcastSystemChatMessage(text: string): void {
        for (const c of this._active) {
            if (c.isInChannel()) {
                c.sendSystemChatMessage(text);
            }
        }
    }

    /**
     * Admin: send a ServerImportantMessage to every logged-in client.
     * Reachable via public API so an HTTP admin route or CLI can trigger.
     */
    public broadcastServerImportantMessage(message: string): void {
        this.broadcastToAll((c) => c.sendServerImportantMessage(message));
    }

    /**
     * Admin: kick a user by permId. Sends a Kick packet with the
     * supplied reason and then closes the socket so the client has time
     * to show the reason before the TCP drops.
     */
    public kickByPermId(permId: number, reason: string): boolean {
        const target = this.findByPermId(permId);
        if (target === null) {
            return false;
        }
        target.sendKick(reason);
        // Give the framing a moment to flush before tearing down.
        setTimeout(() => target.close(), 50);
        return true;
    }

    /**
     * Admin: graceful shutdown notice. Sends ServerShutdown to everyone,
     * then calls `stop()`. The short delay gives the frames a chance to
     * land before sockets close.
     */
    public initiateServerShutdown(message: string): void {
        this.broadcastToAll((c) => c.sendServerShutdown(message));
        setTimeout(() => this.stop(), 100);
    }

    protected override _createNewClient(socket: net.Socket): RawClient {
        const client = new SacredClient(this, socket);
        this._active.add(client);
        return client;
    }

    public override listen(): void {
        super.listen();

        const interval = sacredConfig().get()?.lobby?.keepAliveIntervalMs ?? 15000;
        this._sweeperTimer = setInterval(() => this._sweep(), interval);
        this._sweeperTimer.unref();

        logger.info(`lobby server listening, keep-alive sweep every ${interval}ms`);
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
     * Tincat-layer credential check (NOT account auth). Validates the
     * fixed lobby user/password from `config.lobby.tincatUser` against
     * the LOGMEON payload. Real account authentication lives in the
     * ClientLoginRequest handler.
     */
    public authenticate(username: string, password: string): boolean {
        const lobby = sacredConfig().get()?.lobby;
        if (!lobby) {
            logger.error('lobby config missing; rejecting all logons');
            return false;
        }
        const expectedUser = lobby.tincatUser ?? '';
        const expectedPassword = lobby.tincatPassword ?? '';
        return username === expectedUser && password === expectedPassword;
    }

    public onClientLoggedIn(client: SacredClient): void {
        logger.info(
            `client ${client.getPeer()} logged in as ${client.getUsername()} ` +
            `(connId=0x${client.getConnectionId().toString(16)})`
        );
    }

    public onClientClosed(client: SacredClient): void {
        // If the client had an account (permId set), tell anyone who had
        // them on their friends list that they just went offline.
        if (client.getPermId() !== 0) {
            this.broadcastFriendStatus(client, BuddyStatus.Offline);
        }

        // Untie any channel membership before removing — otherwise the
        // channel roster keeps a dead reference and a future broadcast
        // would try to write to a closed socket.
        const chId = client.getChannelId();
        if (chId !== 0) {
            this._channelRegistry.leave(chId, client);
            this.broadcastToChannel(chId, (c) => {
                c.sendOtherUserLeft(client.getPermId(), client.getUsername());
            }, client);
            client.setChannelId(0);
        }

        const info = this._serverRegistry.remove(client.getConnectionId());
        if (info !== null) {
            // Tell everyone in that server's channel the server is gone.
            this.broadcastToChannel(info.channelId, (c) => {
                c.sendRemoveServer(info);
            });
        }

        if (this._active.delete(client)) {
            logger.info(`client ${client.getPeer()} disconnected`);
        }
    }

    protected _sweep(): void {
        const now = Date.now();
        const timeout = sacredConfig().get()?.lobby?.clientTimeoutMs ?? 60000;
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