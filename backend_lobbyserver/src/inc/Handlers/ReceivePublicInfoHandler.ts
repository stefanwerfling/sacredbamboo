import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';

/**
 * Handles ReceivePublicInfo (7). The spec lets a user push a new
 * username + permId into the server. In practice the username is
 * account-bound and the permId is authoritative, so we accept the
 * packet, ack success and do nothing.
 *
 * A future iteration could honor a username change by updating the
 * Account row and broadcasting UpdateFriendStatus to watchers.
 */
export class ReceivePublicInfoHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ReceivePublicInfo;
    }

    public async handle(client: SacredClient): Promise<void> {
        client.sendLobbyResult(LobbyResults.ChangePublicInfoSuccess, SacredMsgType.ReceivePublicInfo);
    }

}