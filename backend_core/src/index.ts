/**
 * Public surface of `sacredbamboo-core`.
 *
 * Both `backend_lobbyserver` and `backend_gameserver` consume the same
 * Tincat V2 wire layer and Sacred lobby protocol — this barrel is the one
 * place where we declare what's shared. Anything missing from this file
 * is private to backend_core.
 *
 * Layout intent:
 *   - Util       wire-layer primitives (CRC, codec, magic constants)
 *   - Client     enums shared between the two backends (ClientType)
 *   - Packets    Tincat envelopes + Sacred CUSTOMDATA framing classes
 *   - Messages   body-layout classes whose shape both backends need
 *
 * Lobby/gameserver-specific Message bodies stay in their respective
 * project — only the bodies used by both surfaces (server-login flow,
 * lobby-result acks) live here.
 */

// Util
export {Crc32} from './Util/Crc32.js';
export {TincatHandles} from './Util/TincatHandles.js';
export {TincatCrypto} from './Util/TincatCrypto.js';
export {Win1252} from './Util/Win1252.js';

// Client
export {ClientType} from './Client/ClientType.js';

// Tincat packets
export {ATincatPacket} from './Packets/ATincatPacket.js';
export {ATincatPacketConnection} from './Packets/ATincatPacketConnection.js';
export {TincatPacketTypes} from './Packets/TincatPacketTypes.js';
export {TincatPacketV2} from './Packets/TincatPacketV2.js';
export {TincatPacketLogOn} from './Packets/TincatPacketLogOn.js';
export {TincatPacketLogonAccepted} from './Packets/TincatPacketLogonAccepted.js';
export {TincatPacketLogOff} from './Packets/TincatPacketLogOff.js';
export {TincatPacketLogOffAccepted} from './Packets/TincatPacketLogOffAccepted.js';
export {TincatPacketStayingAlive} from './Packets/TincatPacketStayingAlive.js';
export {TincatPacketTimeSync} from './Packets/TincatPacketTimeSync.js';
export {TincatPacketCustomData} from './Packets/TincatPacketCustomData.js';

// Sacred protocol
export {SacredMsgType} from './Packets/SacredMsgType.js';
export {SacredPacketSecurityHeader} from './Packets/SacredPacketSecurityHeader.js';
export {
    AllowedClients,
    SACRED_PACKET_META,
    clientTypeToFlag
} from './Packets/SacredPacketMeta.js';
export type {SacredPacketMetaEntry} from './Packets/SacredPacketMeta.js';
export {SacredPacket, SacredPacketParseError} from './Packets/SacredPacket.js';

// Shared message bodies (server-login flow)
export {ServerInfoMessage} from './Packets/Messages/ServerInfoMessage.js';
export {LobbyResultMessage} from './Packets/Messages/LobbyResultMessage.js';
export {LobbyResults} from './Packets/Messages/LobbyResults.js';
export {ServerLoginInfoMessage} from './Packets/Messages/ServerLoginInfoMessage.js';