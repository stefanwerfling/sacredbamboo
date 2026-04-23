import {RawClient, RawMessage} from 'figtree';
import net from 'net';
import {LobbyServer} from '../LobbyServer.js';
import {ATincatPacket} from '../Packets/ATincatPacket.js';
import {ATincatPacketConnection} from '../Packets/ATincatPacketConnection.js';
import {BuddyAddedNotificationMessage} from '../Packets/Messages/BuddyAddedNotificationMessage.js';
import {BuddyStatus} from '../Packets/Messages/BuddyStatus.js';
import {ChannelInfoWithCounts, ChannelListMessage} from '../Packets/Messages/ChannelListMessage.js';
import {ChannelUserMessage} from '../Packets/Messages/ChannelUserMessage.js';
import {ChatMessage} from '../Packets/Messages/ChatMessage.js';
import {FriendInfoMessage} from '../Packets/Messages/FriendInfoMessage.js';
import {ImportantMessage} from '../Packets/Messages/ImportantMessage.js';
import {JoinChannelMessage} from '../Packets/Messages/JoinChannelMessage.js';
import {KickMessage} from '../Packets/Messages/KickMessage.js';
import {KickReasons} from '../Packets/Messages/KickReasons.js';
import {LobbyResultMessage} from '../Packets/Messages/LobbyResultMessage.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {LoginResultMessage} from '../Packets/Messages/LoginResultMessage.js';
import {MotdMessage} from '../Packets/Messages/MotdMessage.js';
import {PrivateInfoMessage} from '../Packets/Messages/PrivateInfoMessage.js';
import {PublicDataMessage} from '../Packets/Messages/PublicDataMessage.js';
import {PublicInfoMessage} from '../Packets/Messages/PublicInfoMessage.js';
import {ServerInfoMessage} from '../Packets/Messages/ServerInfoMessage.js';
import {ServerLoginInfoMessage} from '../Packets/Messages/ServerLoginInfoMessage.js';
import {ServerShutdownMessage} from '../Packets/Messages/ServerShutdownMessage.js';
import {UserKickedFromServerMessage} from '../Packets/Messages/UserKickedFromServerMessage.js';
import {SacredPacket, SacredPacketParseError} from '../Packets/SacredPacket.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {TincatPacketCustomData} from '../Packets/TincatPacketCustomData.js';
import {TincatPacketLogOff} from '../Packets/TincatPacketLogOff.js';
import {TincatPacketLogOffAccepted} from '../Packets/TincatPacketLogOffAccepted.js';
import {TincatPacketLogOn} from '../Packets/TincatPacketLogOn.js';
import {TincatPacketLogonAccepted} from '../Packets/TincatPacketLogonAccepted.js';
import {TincatPacketTimeSync} from '../Packets/TincatPacketTimeSync.js';
import {TincatPacketTypes} from '../Packets/TincatPacketTypes.js';
import {TincatPacketV2} from '../Packets/TincatPacketV2.js';
import {Crc32} from '../Util/Crc32.js';
import {logger} from '../Util/Logger.js';
import {TincatHandles} from '../Util/TincatHandles.js';
import {ClientState} from './ClientState.js';
import {ClientType} from './ClientType.js';

/**
 * Per-connection state machine for a Tincat V2 session.
 *
 * Responsibilities:
 *  - Reassemble framed Tincat packets from arbitrary TCP chunks.
 *  - Validate header magic and payload CRC-32.
 *  - Drive the handshake (LOGMEON → LOGONACCEPTED) and shutdown
 *    (LOGMEOFF → LOGOFFACCEPTED).
 *  - Track liveness via STAYINGALIVE timestamps for the server-side
 *    keep-alive sweeper in `LobbyServer`.
 *
 * Wire framing (from sub_1000CBC0 / sub_1000CC50):
 *   28-byte TincatPacketV2 header, then `payloadLength` bytes of payload.
 *   Header and payload are sent as two separate `send()` calls; we
 *   accept any chunking on the receive side.
 */
export class SacredClient extends RawClient {

    protected _lobby: LobbyServer;
    protected _type: ClientType = ClientType.Unknown;
    protected _state: ClientState = ClientState.Connected;
    protected _recvBuffer: Buffer = Buffer.alloc(0);
    protected _connectionId: number = 0;
    protected _username: string = '';
    protected _permId: number = 0;
    protected _channelId: number = 0; // 0 = not in any channel
    protected _lastSeen: number = Date.now();
    protected _peer: string;

    public constructor(lobby: LobbyServer, socket: net.Socket) {
        super(lobby, socket);
        this._lobby = lobby;
        this._peer = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? 0}`;
        socket.on('error', (err) => {
            logger.warn(`client ${this._peer} socket error: ${err.message}`);
        });
        socket.on('close', () => {
            this._lobby.onClientClosed(this);
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

    public getLastSeen(): number {
        return this._lastSeen;
    }

    public getPeer(): string {
        return this._peer;
    }

    public getLobby(): LobbyServer {
        return this._lobby;
    }

    public getPermId(): number {
        return this._permId;
    }

    public setClientType(type: ClientType): void {
        this._type = type;
    }

    public setIdentity(username: string, permId: number): void {
        this._username = username;
        this._permId = permId;
    }

    public getChannelId(): number {
        return this._channelId;
    }

    public setChannelId(channelId: number): void {
        this._channelId = channelId;
    }

    public isInChannel(): boolean {
        return this._channelId !== 0;
    }

    /**
     * Best-effort IP-address of the peer as a [a,b,c,d] tuple. IPv6
     * addresses come back as 0.0.0.0 — good enough for the handful of
     * payload fields that echo the observed IP back to the client.
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

    /**
     * Consume as many complete packets as are buffered.
     */
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
                // Liveness is tracked via `_lastSeen` in receiveMessage().
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

        if (!this._lobby.authenticate(packet.getUsername(), packet.getPassword())) {
            logger.warn(
                `${this._peer}: LOGMEON rejected for user=${JSON.stringify(packet.getUsername())}`
            );
            this.close();
            return;
        }

        this._connectionId = this._lobby.allocateConnectionId();
        this._username = packet.getUsername();
        this._state = ClientState.LoggedIn;
        this._lobby.onClientLoggedIn(this);

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
        // No concrete semantics reverse-engineered yet; echo back so the
        // client's sync logic doesn't stall.
        this.sendPacket(packet, TincatHandles.SERVER, this._connectionId);
    }

    /**
     * CUSTOMDATA carries the Sacred sub-protocol. We parse the 18-byte
     * framing (moduleId + type + 14-byte security header), validate it
     * against the metadata table, and then hand the packet to the
     * LobbyServer's registered handler for that sub-type. Parse failures
     * are logged and the client is dropped — that's what the reference
     * server does in strict mode and it prevents a malformed stream from
     * leaving us in an ambiguous state.
     */
    protected _onCustomData(header: TincatPacketV2, packet: TincatPacketCustomData): void {
        let sub: SacredPacket;
        try {
            sub = SacredPacket.parse(packet.getPayload(), this._type);
        } catch (err) {
            const reason = err instanceof SacredPacketParseError ? err.reason
                : err instanceof Error ? err.message : String(err);
            logger.warn(`${this._peer}: CUSTOMDATA parse failed: ${reason}`);
            this.close();
            return;
        }

        logger.debug(
            `${this._peer}: CUSTOMDATA ${SacredMsgType[sub.type] ?? sub.type} ` +
            `from=0x${(header.getFrom() >>> 0).toString(16)} body=${sub.body.length}B`
        );

        void this._lobby.getMessageRegistry().dispatch(this, sub);
    }

    /**
     * Build a SacredPacket for the given sub-type + body and send it
     * wrapped in a CUSTOMDATA Tincat frame.
     */
    public sendSacredPacket(type: SacredMsgType, body: Buffer = Buffer.alloc(0)): void {
        const sub = new SacredPacket(type, body);
        const wire = new TincatPacketCustomData(sub.serialize());
        this.sendPacket(wire, TincatHandles.SERVER, this._connectionId);
    }

    /**
     * Send a ClientLoginResult (SacredMsgType 16). Mirrors the reference
     * server's `SendUserLoginResult` — the actual success/failure code is
     * separate from this packet and is conveyed in a subsequent LobbyResult.
     */
    public sendClientLoginResult(message: LoginResultMessage): void {
        this.sendSacredPacket(SacredMsgType.ClientLoginResult, message.serialize());
    }

    /**
     * Send a ServerLoginResult (SacredMsgType 38) carrying the IP the
     * lobby observed on the socket. Counterpart of ClientLoginResult for
     * the game-server role.
     */
    public sendServerLoginResult(ip: [number, number, number, number]): void {
        this.sendSacredPacket(
            SacredMsgType.ServerLoginResult,
            new ServerLoginInfoMessage(ip).serialize()
        );
    }

    /**
     * Send a LobbyResult (SacredMsgType 15). Every incoming request gets
     * one of these as an ack — `action` MUST echo the request's type so
     * the client can correlate result to request.
     */
    public sendLobbyResult(result: LobbyResults, action: SacredMsgType): void {
        this.sendSacredPacket(
            SacredMsgType.LobbyResult,
            new LobbyResultMessage(result, action).serialize()
        );
    }

    /**
     * Send a ClientImportantMessage (SacredMsgType 48) as a human-readable
     * note next to a LobbyResult. Matches the reference server's
     * `SendImportantMessage`; `veryImportant` toggles the client's modal.
     */
    public sendImportantMessage(message: string, veryImportant: boolean = true): void {
        this.sendSacredPacket(
            SacredMsgType.ClientImportantMessage,
            new ImportantMessage(message, veryImportant, this._permId).serialize()
        );
    }

    /**
     * Send SendMessageOfTheDay (SacredMsgType 56) with the configured
     * text. `id` is echoed from the incoming request so the client can
     * pair them up.
     */
    public sendMessageOfTheDay(id: number, text: string): void {
        this.sendSacredPacket(
            SacredMsgType.SendMessageOfTheDay,
            new MotdMessage(id, text).serialize()
        );
    }

    /** SendChannelList (24). */
    public sendChannelList(channels: ChannelInfoWithCounts[]): void {
        this.sendSacredPacket(
            SacredMsgType.SendChannelList,
            new ChannelListMessage(channels).serialize()
        );
    }

    /** UserJoinChannel (26) — confirmation sent to the user who joined. */
    public sendUserJoinChannel(channelId: number): void {
        this.sendSacredPacket(
            SacredMsgType.UserJoinChannel,
            new JoinChannelMessage(channelId).serialize()
        );
    }

    /** OtherUserJoinedChannel (28) — broadcast when someone else joins. */
    public sendOtherUserJoined(permId: number, username: string): void {
        this.sendSacredPacket(
            SacredMsgType.OtherUserJoinedChannel,
            new ChannelUserMessage(permId, username).serialize()
        );
    }

    /** OtherUserLeftChannel (29) — broadcast when someone else leaves. */
    public sendOtherUserLeft(permId: number, username: string): void {
        this.sendSacredPacket(
            SacredMsgType.OtherUserLeftChannel,
            new ChannelUserMessage(permId, username).serialize()
        );
    }

    /** SendServerInfo (21) — tell this client about a game server. */
    public sendServerInfo(info: ServerInfoMessage): void {
        this.sendSacredPacket(SacredMsgType.SendServerInfo, info.serialize());
    }

    /** RemoveServer (22) — tell this client a game server went away. */
    public sendRemoveServer(info: ServerInfoMessage): void {
        this.sendSacredPacket(SacredMsgType.RemoveServer, info.serialize());
    }

    /**
     * SendChatMessage (31) — outbound chat line from server to this
     * client. Sacred Gold naming convention: `Send*` travels server→client,
     * `Receive*` travels client→server.
     */
    public sendChatMessage(
        senderName: string, senderPermId: number, destinationPermId: number, text: string
    ): void {
        this.sendSacredPacket(
            SacredMsgType.SendChatMessage,
            new ChatMessage(senderName, senderPermId, destinationPermId, text).serialize()
        );
    }

    /** SendPrivateChatMessage (33) — outbound PM to this client. */
    public sendPrivateChatMessage(
        senderName: string, senderPermId: number, destinationPermId: number, text: string
    ): void {
        this.sendSacredPacket(
            SacredMsgType.SendPrivateChatMessage,
            new ChatMessage(senderName, senderPermId, destinationPermId, text).serialize()
        );
    }

    /** AddedToFriends (53) — notify the addee that someone added them. */
    public sendAddedToFriends(adderPermId: number, adderName: string): void {
        this.sendSacredPacket(
            SacredMsgType.AddedToFriends,
            new BuddyAddedNotificationMessage(this._permId, adderPermId, adderName).serialize()
        );
    }

    /**
     * UpdateFriendStatus (54) — tell this client that one of their friends
     * changed status. `destinationPermId` is rewritten to the receiver's
     * own permId so the client can route it through its friend list.
     */
    public sendUpdateFriendStatus(
        status: BuddyStatus,
        friendUsername: string,
        friendPermId: number,
        channelId: number = 0,
        channelName: string = ''
    ): void {
        this.sendSacredPacket(
            SacredMsgType.UpdateFriendStatus,
            new FriendInfoMessage(
                this._permId, status, friendUsername, friendPermId,
                0, '', channelId, channelName
            ).serialize()
        );
    }

    /** FoundUser (37) — reply to FindUserRequest with the matched user's info. */
    public sendFoundUser(info: FriendInfoMessage): void {
        info.destinationPermId = this._permId;
        this.sendSacredPacket(SacredMsgType.FoundUser, info.serialize());
    }

    /** Kick (34) — notify this client they are being kicked from the lobby. */
    public sendKick(reason: string): void {
        this.sendSacredPacket(SacredMsgType.Kick, new KickMessage(reason).serialize());
    }

    /** ServerImportantMessage (49) — admin broadcast text to all users. */
    public sendServerImportantMessage(message: string, veryImportant = true): void {
        this.sendSacredPacket(
            SacredMsgType.ServerImportantMessage,
            new ImportantMessage(message, veryImportant, this._permId).serialize()
        );
    }

    /** UserKickedFromServer (47) — notify this client a player was kicked from a game. */
    public sendUserKickedFromServer(permId: number, reason: KickReasons, text: string): void {
        this.sendSacredPacket(
            SacredMsgType.UserKickedFromServer,
            new UserKickedFromServerMessage(permId, reason, text).serialize()
        );
    }

    /** ServerShutdown (50) — tell this client the lobby is going down. */
    public sendServerShutdown(message: string): void {
        this.sendSacredPacket(
            SacredMsgType.ServerShutdown,
            new ServerShutdownMessage(message).serialize()
        );
    }

    /** SendPrivateInfo (5) — reply to PrivateInfoRequest with stored mail. */
    public sendPrivateInfo(password: string, mail: string): void {
        this.sendSacredPacket(
            SacredMsgType.SendPrivateInfo,
            new PrivateInfoMessage(password, mail).serialize()
        );
    }

    /** SendPublicInfo (8) — reply to PublicInfoRequest with (permId, username). */
    public sendPublicInfo(permId: number, username: string): void {
        this.sendSacredPacket(
            SacredMsgType.SendPublicInfo,
            new PublicInfoMessage(permId, username).serialize()
        );
    }

    /**
     * SendPublicData (11) — deliver a character block to this client.
     * The body is always the full 131090-byte struct; `length` inside
     * the message tells the client how many Data bytes are valid.
     */
    public sendPublicData(
        permId: number, blockId: number, size: number,
        offset: number, length: number, data: Buffer
    ): void {
        this.sendSacredPacket(
            SacredMsgType.SendPublicData,
            new PublicDataMessage(permId, blockId, size, offset, length, data).serialize()
        );
    }

    /**
     * Convenience wrapper for system-chat messages. Broadcast helpers in
     * LobbyServer use it to announce channel events. Matches the
     * reference's `SendSystemMessage(text)` which puts an empty sender
     * in a chat packet.
     */
    public sendSystemChatMessage(text: string): void {
        this.sendSacredPacket(
            SacredMsgType.SendChatMessage,
            new ChatMessage('', 0, this._permId, text).serialize()
        );
    }

    /**
     * Consumed by LobbyServer's keep-alive sweeper.
     */
    public sendKeepAlive(): void {
        // The tincat sender allocates a 2-byte payload but never writes to
        // it; two NULs match the on-the-wire behavior and also satisfy the
        // receiver's CRC check (CRC of two zero bytes is deterministic).
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
        // Two separate writes to mirror sub_1000CBC0's behavior. Node will
        // coalesce them on the wire if Nagle is on, which matches how the
        // original client receives them.
        this._socket.write(headerBuf);
        if (payload.length > 0) {
            this._socket.write(payload);
        }
    }

}