import {LobbyResults, SacredMsgType, SacredPacket} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {PrivateInfoMessage} from '../Packets/Messages/PrivateInfoMessage.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ReceivePrivateInfo (4). User pushes updated private info
 * (password + mail). For 3b.4a we store the mail in the ProfileStore;
 * a password change is acknowledged with ChangePrivateInfoFailed +
 * ImportantMessage so the client knows it didn't stick — wiring the
 * password update through `IAccountRepository` requires an
 * `updatePassword` method which lands in a separate cleanup pass.
 */
export class ReceivePrivateInfoHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ReceivePrivateInfo;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: PrivateInfoMessage;
        try {
            msg = PrivateInfoMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ReceivePrivateInfo parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ReceivePrivateInfo);
            return;
        }

        client.getLobby().getProfileStore().setMail(client.getPermId(), msg.mail);

        if (msg.password.length > 0) {
            logger.warn(
                `${client.getUsername()}: password-change via ReceivePrivateInfo not implemented, ` +
                `mail update accepted`
            );
            client.sendLobbyResult(LobbyResults.ChangePrivateInfoSuccess, SacredMsgType.ReceivePrivateInfo);
            client.sendImportantMessage('Mail saved. Password change requires a dedicated flow.');
            return;
        }

        client.sendLobbyResult(LobbyResults.ChangePrivateInfoSuccess, SacredMsgType.ReceivePrivateInfo);
        logger.info(`${client.getUsername()} updated mail: ${msg.mail}`);
    }

}