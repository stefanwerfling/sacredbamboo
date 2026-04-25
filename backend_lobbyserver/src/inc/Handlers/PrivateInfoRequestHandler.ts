import {LobbyResults, SacredMsgType} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
/**
 * Handles PrivateInfoRequest (3). Empty body. Replies with SendPrivateInfo
 * (5) carrying the stored mail from the ProfileStore. Password is NOT
 * replayed — the server never knows the plaintext on re-login anyway.
 */
export class PrivateInfoRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.PrivateInfoRequest;
    }

    public async handle(client: SacredClient): Promise<void> {
        const profile = client.getLobby().getProfileStore().get(client.getPermId());
        client.sendPrivateInfo('', profile.mail);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.PrivateInfoRequest);
    }

}