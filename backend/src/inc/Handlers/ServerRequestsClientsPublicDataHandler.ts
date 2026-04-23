import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {PublicDataRequestMessage} from '../Packets/Messages/PublicDataRequestMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ServerRequestsClientsPublicData (19). Same wire format and
 * same semantics as PublicDataRequest (9); the only difference is that
 * the sender is a GameServer rather than a player, and the packet
 * metadata enforces the role. We share the actual delivery logic by
 * reading from CharacterStore and sending SendPublicData.
 */
export class ServerRequestsClientsPublicDataHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ServerRequestsClientsPublicData;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let req: PublicDataRequestMessage;
        try {
            req = PublicDataRequestMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ServerRequestsClientsPublicData parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ServerRequestsClientsPublicData);
            return;
        }

        const block = client.getLobby().getCharacterStore().getBlock(req.permId, req.blockId);
        const data = block ?? Buffer.alloc(0);
        const offset = Math.min(Math.max(req.offset, 0), data.length);
        const requested = req.length > 0 ? req.length : data.length - offset;
        const slice = data.subarray(offset, Math.min(offset + requested, data.length));

        client.sendPublicData(req.permId, req.blockId, data.length, offset, slice.length, Buffer.from(slice));
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ServerRequestsClientsPublicData);
    }

}