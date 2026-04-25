import {ATincatPacket, ATincatPacketConnection, ClientType, Crc32, TincatHandles, TincatPacketCustomData, TincatPacketLogOffAccepted, TincatPacketLogOn, TincatPacketLogonAccepted, TincatPacketTimeSync, TincatPacketTypes, TincatPacketV2} from 'sacredbamboo-core';
import {RawClient, RawMessage} from 'figtree';
import net from 'net';
import {GameServer} from '../GameServer.js';
import {GameMessage} from '../Packets/GameMessage.js';
import {logger} from '../Util/Logger.js';
import {ClientState} from './ClientState.js';
/**
 * Per-connection state machine for a Tincat V2 session on the GameServer.
 *
 * Mirrors `SacredClient` from backend_lobbyserver — the Tincat wire layer
 * (LOGMEON/LOGMEOFF/STAYINGALIVE/TIMESYNC + CUSTOMDATA framing) is
 * identical. What differs lives in `_onCustomData`: the sub-packet parsing
 * is GameServer-specific (see `GameMessage` — currently a provisional
 * 2-byte-type layout until the real framing is confirmed against
 * `work/GameServer.c_split/network/*`).
 */
export class GameClient extends RawClient {

    protected _gameServer: GameServer;
    protected _type: ClientType = ClientType.Unknown;
    protected _state: ClientState = ClientState.Connected;
    protected _recvBuffer: Buffer = Buffer.alloc(0);
    protected _connectionId: number = 0;
    protected _username: string = '';
    protected _permId: number = 0;
    protected _lastSeen: number = Date.now();
    protected _peer: string;

    public constructor(gameServer: GameServer, socket: net.Socket) {
        super(gameServer, socket);
        this._gameServer = gameServer;
        this._peer = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? 0}`;
        socket.on('error', (err) => {
            logger.warn(`client ${this._peer} socket error: ${err.message}`);
        });
        socket.on('close', () => {
            this._gameServer.onClientClosed(this);
        });
        logger.info(`client connected: ${this._peer}`);
    }

    public getState(): ClientState {
        return this._state;
    }

    public getType(): ClientType {
        return this._type;
    }

    public getConnectionId(): number {
        return this._connectionId;
    }

    public getUsername(): string {
        return this._username;
    }

    public getPermId(): number {
        return this._permId;
    }

    public getLastSeen(): number {
        return this._lastSeen;
    }

    public getPeer(): string {
        return this._peer;
    }

    public getGameServer(): GameServer {
        return this._gameServer;
    }

    public setClientType(type: ClientType): void {
        this._type = type;
    }

    public setIdentity(username: string, permId: number): void {
        this._username = username;
        this._permId = permId;
    }

    /**
     * Best-effort IP-address of the peer as a [a,b,c,d] tuple. Mirrors
     * SacredClient's helper — same fallback semantics.
     */
    public getPeerIp(): [number, number, number, number] {
        const remote = this._socket.remoteAddress ?? '';
        const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(remote);
        if (!m) {
            return [0, 0, 0, 0];
        }
        return [Number(m[1]) & 0xFF, Number(m[2]) & 0xFF, Number(m[3]) & 0xFF, Number(m[4]) & 0xFF];
    }

    public override receiveMessage(msg: RawMessage): void {
        this._recvBuffer = Buffer.concat([this._recvBuffer, msg.getBuffer()]);
        this._lastSeen = Date.now();
        this._drain();
    }

    /** Consume as many complete packets as are buffered. */
    protected _drain(): void {
        while (this._recvBuffer.length >= TincatPacketV2.SIZE) {
            const headerBuf = this._recvBuffer.subarray(0, TincatPacketV2.SIZE);
            const header = new TincatPacketV2(new RawMessage(Buffer.from(headerBuf)));

            if (header.getMagic() !== TincatPacketV2.MAGIC) {
                logger.warn(
                    `${this._peer}: bad header magic 0x${header.getMagic().toString(16)}, closing`
                );
                this.close();
                return;
            }

            const payloadSize = header.getPayloadSize();
            if (payloadSize < 0 || payloadSize > 0x100000) {
                logger.warn(`${this._peer}: implausible payload size ${payloadSize}, closing`);
                this.close();
                return;
            }

            const needed = TincatPacketV2.SIZE + payloadSize;
            if (this._recvBuffer.length < needed) {
                return; // wait for more data
            }

            const payload = Buffer.from(this._recvBuffer.subarray(TincatPacketV2.SIZE, needed));
            this._recvBuffer = this._recvBuffer.subarray(needed);

            if (!Crc32.verify(payload, header.getChecksum())) {
                logger.warn(`${this._peer}: payload checksum mismatch, closing`);
                this.close();
                return;
            }

            this._dispatch(header, payload);
        }
    }

    protected _dispatch(header: TincatPacketV2, payload: Buffer): void {
        const type = header.getType();
        logger.debug(
            `${this._peer}: rx type=${TincatPacketTypes[type] ?? type} size=${payload.length}`
        );

        switch (type) {
            case TincatPacketTypes.LOGMEON:
                this._onLogOn(payload);
                break;
            case TincatPacketTypes.LOGMEOFF:
                this._onLogOff(payload);
                break;
            case TincatPacketTypes.STAYINGALIVE:
                // Liveness tracked via `_lastSeen` in receiveMessage().
                break;
            case TincatPacketTypes.TIMESYNC:
                this._onTimeSync(new TincatPacketTimeSync(payload));
                break;
            case TincatPacketTypes.CUSTOMDATA:
                this._onCustomData(header, new TincatPacketCustomData(payload));
                break;
            default:
                logger.warn(`${this._peer}: unhandled packet type ${type}`);
        }
    }

    protected _onLogOn(payload: Buffer): void {
        if (this._state !== ClientState.Connected) {
            logger.warn(`${this._peer}: LOGMEON in state ${ClientState[this._state]}, closing`);
            this.close();
            return;
        }
        if (payload.length !== ATincatPacketConnection.SIZE) {
            logger.warn(`${this._peer}: LOGMEON payload size ${payload.length} != 52, closing`);
            this.close();
            return;
        }

        const packet = new TincatPacketLogOn(new RawMessage(payload));
        if (packet.getMagic() !== ATincatPacketConnection.SUB_MAGIC) {
            logger.warn(`${this._peer}: LOGMEON sub-magic mismatch, closing`);
            this.close();
            return;
        }

        if (!this._gameServer.authenticate(packet.getUsername(), packet.getPassword())) {
            logger.warn(
                `${this._peer}: LOGMEON rejected for user=${JSON.stringify(packet.getUsername())}`
            );
            this.close();
            return;
        }

        this._connectionId = this._gameServer.allocateConnectionId();
        this._username = packet.getUsername();
        this._state = ClientState.LoggedIn;
        this._gameServer.onClientLoggedIn(this);

        const accepted = new TincatPacketLogonAccepted();
        accepted.setConnectionId(this._connectionId);
        accepted.setUsername(this._username);
        this.sendPacket(accepted, TincatHandles.SERVER, this._connectionId);

        logger.info(
            `${this._peer}: LOGMEON ok, user=${this._username} connId=0x${this._connectionId.toString(16)}`
        );
    }

    protected _onLogOff(_payload: Buffer): void {
        if (this._state !== ClientState.LoggedIn) {
            logger.warn(`${this._peer}: LOGMEOFF in state ${ClientState[this._state]}, closing`);
            this.close();
            return;
        }

        const accepted = new TincatPacketLogOffAccepted();
        this.sendPacket(accepted, TincatHandles.SERVER, this._connectionId);

        this._state = ClientState.LoggedOff;
        logger.info(`${this._peer}: LOGMEOFF ok, user=${this._username}`);
        this.close();
    }

    protected _onTimeSync(packet: TincatPacketTimeSync): void {
        // Echo back until the concrete layout is confirmed — same policy
        // as the lobby. `_onTimeSync` is the obvious hook to enrich later.
        this.sendPacket(packet, TincatHandles.SERVER, this._connectionId);
    }

    /**
     * CUSTOMDATA carries the GameServer sub-protocol. We parse it with the
     * provisional `GameMessage.parseRaw` and dispatch via the
     * GameServer's registry. Unknown types are logged by the registry and
     * dropped — that matches the lobby's tolerant-receive policy.
     */
    protected _onCustomData(_header: TincatPacketV2, packet: TincatPacketCustomData): void {
        const msg = GameMessage.parseRaw(packet.getPayload());
        void this._gameServer.getMessageRegistry().dispatch(this, msg);
    }

    /**
     * Build a CUSTOMDATA Tincat frame carrying the provisional
     * `GameMessage` encoding and send it. Once the real framing is in
     * place this helper collapses into a one-liner around `serialize()`.
     */
    public sendGameMessage(msg: GameMessage): void {
        const wire = new TincatPacketCustomData(msg.serialize());
        this.sendPacket(wire, TincatHandles.SERVER, this._connectionId);
    }

    /** Consumed by GameServer's keep-alive sweeper. */
    public sendKeepAlive(): void {
        const payload = Buffer.alloc(2);
        const header = new TincatPacketV2();
        header.setType(TincatPacketTypes.STAYINGALIVE);
        header.setFrom(TincatHandles.SERVER);
        header.setTo(this._state === ClientState.LoggedIn
            ? this._connectionId : TincatHandles.BROADCAST);
        this._writeFrame(header.serializeHeader(payload), payload);
    }

    /**
     * Build and transmit a fully-framed Tincat packet. The header's type
     * comes from the packet itself; caller supplies the addressing fields.
     */
    public sendPacket(packet: ATincatPacket, from: number, to: number): void {
        const payload = packet.serialize();
        const header = new TincatPacketV2();
        header.setType(packet.getType());
        header.setFrom(from);
        header.setTo(to);
        this._writeFrame(header.serializeHeader(payload), payload);
        logger.debug(
            `${this._peer}: tx type=${TincatPacketTypes[packet.getType()] ?? packet.getType()} size=${payload.length}`
        );
    }

    protected _writeFrame(headerBuf: Buffer, payload: Buffer): void {
        // Two separate writes to mirror sub_1000CBC0's behavior.
        this._socket.write(headerBuf);
        if (payload.length > 0) {
            this._socket.write(payload);
        }
    }

}