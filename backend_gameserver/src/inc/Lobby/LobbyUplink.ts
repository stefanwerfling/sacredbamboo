import {ATincatPacket, ATincatPacketConnection, ClientType, Crc32, LobbyResultMessage, LobbyResults, SacredMsgType, SacredPacket, SacredPacketParseError, ServerInfoMessage, ServerLoginInfoMessage, TincatHandles, TincatPacketCustomData, TincatPacketLogOn, TincatPacketTypes, TincatPacketV2} from 'sacredbamboo-core';
import {RawMessage} from 'figtree';
import net from 'net';
import {sacredGameServerConfig} from '../Config/SacredBambooGameServerConfig.js';
import {logger} from '../Util/Logger.js';
import {LobbyUplinkState} from './LobbyUplinkState.js';

/**
 * Outbound TCP uplink from the GameServer to the Lobby.
 *
 * Flow (drives `LobbyUplinkState`):
 *   1. open TCP to `lobbyHost:lobbyPort`
 *   2. send tincat LOGMEON with the tincat-layer credentials
 *   3. await LOGONACCEPTED → capture connectionId from the lobby
 *   4. wrap a `ServerInfoMessage` in a CUSTOMDATA(ServerLoginRequest) and
 *      send it
 *   5. await BOTH `ServerLoginResult` (38, lobby reports our observed IP)
 *      AND `LobbyResult` echoing action=ServerLoginRequest with result=Ok
 *   6. transition to Established and start emitting STAYINGALIVE so the
 *      lobby's idle-sweeper doesn't drop us
 *
 * Reconnect: any close in any non-Established state triggers a backoff
 * retry; from Established a close also retries but logs at warn level.
 *
 * Inbound CUSTOMDATA other than the two expected acks is currently
 * logged and dropped — chat broadcasts, friend-status updates etc. land
 * as their own handlers in later steps.
 */
export class LobbyUplink {

    private static readonly RECONNECT_INITIAL_MS = 1000;
    private static readonly RECONNECT_MAX_MS = 30000;

    private _state: LobbyUplinkState = LobbyUplinkState.Disconnected;
    private _socket: net.Socket | null = null;
    private _recvBuffer: Buffer = Buffer.alloc(0);
    private _connectionId: number = 0;
    private _reconnectMs: number = LobbyUplink.RECONNECT_INITIAL_MS;
    private _reconnectTimer: NodeJS.Timeout | null = null;
    private _keepAliveTimer: NodeJS.Timeout | null = null;
    private _stopped: boolean = false;
    private _gotServerLoginResult: boolean = false;
    private _gotServerLoginAck: boolean = false;
    private _observedExternalIp: [number, number, number, number] = [0, 0, 0, 0];

    public constructor() {
        // Configuration is read lazily from sacredGameServerConfig() so a
        // user-provided override at runtime is picked up on the next
        // reconnect cycle.
    }

    public getState(): LobbyUplinkState {
        return this._state;
    }

    public getObservedExternalIp(): [number, number, number, number] {
        return this._observedExternalIp;
    }

    /** Begin the connect-then-login cycle. Idempotent. */
    public start(): void {
        if (this._stopped) {
            this._stopped = false;
        }
        if (this._state !== LobbyUplinkState.Disconnected) {
            return;
        }
        this._connect();
    }

    /** Tear down the uplink and cancel any pending reconnect. */
    public stop(): void {
        this._stopped = true;
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._keepAliveTimer !== null) {
            clearInterval(this._keepAliveTimer);
            this._keepAliveTimer = null;
        }
        if (this._socket !== null) {
            try {
                this._socket.destroy();
            } catch {
                // ignore — we're tearing down
            }
            this._socket = null;
        }
        this._state = LobbyUplinkState.Disconnected;
    }

    private _connect(): void {
        const cfg = sacredGameServerConfig().get()?.gameserver;
        const host = cfg?.lobbyHost ?? '127.0.0.1';
        const port = cfg?.lobbyPort ?? 7066;

        this._state = LobbyUplinkState.Connecting;
        this._recvBuffer = Buffer.alloc(0);
        this._connectionId = 0;
        this._gotServerLoginResult = false;
        this._gotServerLoginAck = false;

        logger.info(`uplink: connecting to lobby ${host}:${port}`);

        const socket = net.createConnection({host, port});
        this._socket = socket;

        socket.on('connect', () => this._onConnect());
        socket.on('data', (chunk) => this._onData(chunk));
        socket.on('error', (err) => {
            logger.warn(`uplink: socket error: ${err.message}`);
        });
        socket.on('close', () => this._onClose());
    }

    private _onConnect(): void {
        const cfg = sacredGameServerConfig().get();
        const tincatUser = cfg?.gameserver?.lobbyTincatUser ?? 'user';
        const tincatPassword = cfg?.gameserver?.lobbyTincatPassword ?? '';

        const logon = new TincatPacketLogOn();
        logon.setUsername(tincatUser);
        logon.setPassword(tincatPassword);
        this._sendPacket(logon, TincatHandles.CLIENT_ME, TincatHandles.SERVER);

        this._state = LobbyUplinkState.AwaitingLogonAccepted;
        logger.info(`uplink: tincat LOGMEON sent (user=${tincatUser})`);
    }

    private _onData(chunk: Buffer): void {
        this._recvBuffer = Buffer.concat([this._recvBuffer, chunk]);
        this._drain();
    }

    private _onClose(): void {
        if (this._keepAliveTimer !== null) {
            clearInterval(this._keepAliveTimer);
            this._keepAliveTimer = null;
        }
        const wasEstablished = this._state === LobbyUplinkState.Established;
        this._state = LobbyUplinkState.Disconnected;
        this._socket = null;

        if (this._stopped) {
            logger.info('uplink: closed (stopped)');
            return;
        }

        const level = wasEstablished ? 'warn' : 'info';
        const delay = this._reconnectMs;
        logger[level](`uplink: closed; reconnecting in ${delay}ms`);

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            // Exponential backoff up to RECONNECT_MAX_MS. Reset on a
            // fully-established uplink (see _onEstablished).
            this._reconnectMs = Math.min(this._reconnectMs * 2, LobbyUplink.RECONNECT_MAX_MS);
            this._connect();
        }, delay);
    }

    private _drain(): void {
        while (this._recvBuffer.length >= TincatPacketV2.SIZE) {
            const headerBuf = Buffer.from(this._recvBuffer.subarray(0, TincatPacketV2.SIZE));
            const header = new TincatPacketV2(new RawMessage(headerBuf));

            if (header.getMagic() !== TincatPacketV2.MAGIC) {
                logger.warn(`uplink: bad header magic 0x${header.getMagic().toString(16)}, dropping`);
                this._socket?.destroy();
                return;
            }

            const payloadSize = header.getPayloadSize();
            if (payloadSize < 0 || payloadSize > 0x100000) {
                logger.warn(`uplink: implausible payload size ${payloadSize}, dropping`);
                this._socket?.destroy();
                return;
            }

            const needed = TincatPacketV2.SIZE + payloadSize;
            if (this._recvBuffer.length < needed) {
                return; // wait for more data
            }

            const payload = Buffer.from(this._recvBuffer.subarray(TincatPacketV2.SIZE, needed));
            this._recvBuffer = this._recvBuffer.subarray(needed);

            if (!Crc32.verify(payload, header.getChecksum())) {
                logger.warn('uplink: payload checksum mismatch, dropping');
                this._socket?.destroy();
                return;
            }

            this._dispatch(header.getType(), payload);
        }
    }

    private _dispatch(type: number, payload: Buffer): void {
        switch (type) {
            case TincatPacketTypes.LOGONACCEPTED:
                this._onLogonAccepted(payload);
                break;
            case TincatPacketTypes.STAYINGALIVE:
                // Lobby keep-alive — already counted as "alive" by the
                // socket having data. Nothing to do.
                break;
            case TincatPacketTypes.CUSTOMDATA:
                this._onCustomData(payload);
                break;
            default:
                logger.debug(`uplink: ignoring tincat packet type ${type}`);
        }
    }

    private _onLogonAccepted(payload: Buffer): void {
        if (this._state !== LobbyUplinkState.AwaitingLogonAccepted) {
            logger.warn(`uplink: LOGONACCEPTED in state ${LobbyUplinkState[this._state]}, dropping`);
            this._socket?.destroy();
            return;
        }
        if (payload.length !== ATincatPacketConnection.SIZE) {
            logger.warn(`uplink: LOGONACCEPTED size ${payload.length} != 52, dropping`);
            this._socket?.destroy();
            return;
        }
        // The 52-byte connection-control envelope is documented in
        // ATincatPacketConnection: magic@0, connId@4, username@8 (32),
        // password@40 (8), flags@48. We only need connId — read it
        // directly to keep the parse path simple.
        const subMagic = payload.readUInt32LE(0);
        if (subMagic !== ATincatPacketConnection.SUB_MAGIC) {
            logger.warn(`uplink: LOGONACCEPTED sub-magic 0x${subMagic.toString(16)} mismatch, dropping`);
            this._socket?.destroy();
            return;
        }
        this._connectionId = payload.readInt32LE(4);
        logger.info(`uplink: LOGONACCEPTED, connId=0x${this._connectionId.toString(16)}`);

        this._sendServerLoginRequest();
    }

    private _sendServerLoginRequest(): void {
        const cfg = sacredGameServerConfig().get()?.gameserver;
        const info = new ServerInfoMessage();
        info.name = cfg?.serverName ?? 'SacredBamboo GameServer';
        info.lanIp = [127, 0, 0, 1]; // overridden by lobby's externalIp on accept
        info.externalIp = [0, 0, 0, 0];
        info.port = cfg?.port ?? 7080;
        info.playerCount = 0;
        info.playerMax = cfg?.maxUsers ?? 16;
        info.flags = 0;
        info.serverId = 0; // assigned by the lobby
        info.networkVersion = cfg?.networkVersion ?? 0;
        info.clientGameVersion = cfg?.clientGameVersion ?? 0;
        info.channelId = cfg?.lobbyChannelId ?? 1;

        const sub = new SacredPacket(SacredMsgType.ServerLoginRequest, info.serialize());
        const wire = new TincatPacketCustomData(sub.serialize());
        this._sendPacket(wire, this._connectionId, TincatHandles.SERVER);

        this._state = LobbyUplinkState.AwaitingServerLogin;
        logger.info(
            `uplink: ServerLoginRequest sent (name="${info.name}" channel=${info.channelId} ` +
            `port=${info.port} slots=${info.playerMax})`
        );
    }

    private _onCustomData(payload: Buffer): void {
        let sub: SacredPacket;
        try {
            // ClientType.Unknown is always safe here: the inbound packets
            // we expect from the lobby (LobbyResult, ServerLoginResult,
            // chat broadcasts, …) all carry `allowedClients: None`, which
            // short-circuits the role check inside SacredPacket.parse.
            sub = SacredPacket.parse(payload, ClientType.Unknown);
        } catch (err) {
            const reason = err instanceof SacredPacketParseError ? err.reason
                : err instanceof Error ? err.message : String(err);
            logger.warn(`uplink: CUSTOMDATA parse failed: ${reason}`);
            return;
        }

        switch (sub.type) {
            case SacredMsgType.ServerLoginResult:
                this._onServerLoginResult(sub);
                break;
            case SacredMsgType.LobbyResult:
                this._onLobbyResult(sub);
                break;
            default:
                logger.debug(
                    `uplink: unhandled CUSTOMDATA ${SacredMsgType[sub.type] ?? sub.type} ` +
                    `(${sub.body.length}B)`
                );
        }
    }

    private _onServerLoginResult(sub: SacredPacket): void {
        const info = ServerLoginInfoMessage.parse(sub.body);
        this._observedExternalIp = info.ip;
        this._gotServerLoginResult = true;
        logger.info(`uplink: ServerLoginResult, lobby observed externalIp=${info.ip.join('.')}`);
        this._maybeEstablished();
    }

    private _onLobbyResult(sub: SacredPacket): void {
        const result = LobbyResultMessage.parse(sub.body);
        if (result.action === SacredMsgType.ServerLoginRequest) {
            if (result.result === LobbyResults.Ok) {
                this._gotServerLoginAck = true;
                logger.info('uplink: LobbyResult(ServerLoginRequest, Ok)');
                this._maybeEstablished();
            } else {
                logger.error(
                    `uplink: ServerLoginRequest rejected by lobby: ` +
                    `${LobbyResults[result.result] ?? result.result}`
                );
                this._socket?.destroy();
            }
            return;
        }
        logger.debug(
            `uplink: LobbyResult action=${SacredMsgType[result.action] ?? result.action} ` +
            `result=${LobbyResults[result.result] ?? result.result}`
        );
    }

    private _maybeEstablished(): void {
        if (!this._gotServerLoginResult || !this._gotServerLoginAck) {
            return;
        }
        if (this._state === LobbyUplinkState.Established) {
            return;
        }
        this._state = LobbyUplinkState.Established;
        this._reconnectMs = LobbyUplink.RECONNECT_INITIAL_MS;

        const interval = sacredGameServerConfig().get()?.gameserver?.keepAliveIntervalMs ?? 15000;
        // Send keep-alive at half the configured interval so we comfortably
        // beat the lobby's idle-sweeper (which uses the same interval but
        // measures last-seen-from-our-side).
        const keepAliveMs = Math.max(2000, Math.floor(interval / 2));
        this._keepAliveTimer = setInterval(() => this._sendKeepAlive(), keepAliveMs);
        this._keepAliveTimer.unref();

        logger.info(
            `uplink: ESTABLISHED (keep-alive every ${keepAliveMs}ms, ` +
            `externalIp=${this._observedExternalIp.join('.')})`
        );
    }

    private _sendKeepAlive(): void {
        if (this._socket === null) {
            return;
        }
        const payload = Buffer.alloc(2);
        const header = new TincatPacketV2();
        header.setType(TincatPacketTypes.STAYINGALIVE);
        header.setFrom(this._connectionId);
        header.setTo(TincatHandles.SERVER);
        this._writeFrame(header.serializeHeader(payload), payload);
    }

    private _sendPacket(packet: ATincatPacket, from: number, to: number): void {
        if (this._socket === null) {
            return;
        }
        const payload = packet.serialize();
        const header = new TincatPacketV2();
        header.setType(packet.getType());
        header.setFrom(from);
        header.setTo(to);
        this._writeFrame(header.serializeHeader(payload), payload);
    }

    private _writeFrame(headerBuf: Buffer, payload: Buffer): void {
        if (this._socket === null) {
            return;
        }
        this._socket.write(headerBuf);
        if (payload.length > 0) {
            this._socket.write(payload);
        }
    }

}