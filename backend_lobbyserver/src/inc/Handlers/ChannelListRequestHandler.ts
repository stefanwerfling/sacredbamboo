import {ClientType, LobbyResults, SacredMsgType} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
/**
 * Handles ChannelListRequest (23). The body is an EmptyMessage (0 bytes);
 * we just materialize the registry's current state and send it.
 * UserCount/GameCount are derived from live membership.
 */
export class ChannelListRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ChannelListRequest;
    }

    public async handle(client: SacredClient): Promise<void> {
        const reg = client.getLobby().getChannelRegistry();
        const rendered = reg.getAll().map((ch) => ({
            id: ch.id,
            name: ch.name,
            flags: ch.flags,
            authorizedOnly: ch.authorizedOnly,
            userCount: reg.count(ch.id, ClientType.GameClient),
            gameCount: reg.count(ch.id, ClientType.GameServer)
        }));
        client.sendChannelList(rendered);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ChannelListRequest);
    }

}