import {ServiceAbstract, ServiceImportance} from 'figtree';
import {AddFriendHandler} from '../Handlers/AddFriendHandler.js';
import {AlarmHandler} from '../Handlers/AlarmHandler.js';
import {ChannelJoinRequestHandler} from '../Handlers/ChannelJoinRequestHandler.js';
import {ChannelLeaveRequestHandler} from '../Handlers/ChannelLeaveRequestHandler.js';
import {ChannelListRequestHandler} from '../Handlers/ChannelListRequestHandler.js';
import {ClientCharacterSelectHandler} from '../Handlers/ClientCharacterSelectHandler.js';
import {ClientLoginRequestHandler} from '../Handlers/ClientLoginRequestHandler.js';
import {ClientRegistrationRequestHandler} from '../Handlers/ClientRegistrationRequestHandler.js';
import {ClosedNetNewCharacterHandler} from '../Handlers/ClosedNetNewCharacterHandler.js';
import {FindUserRequestHandler} from '../Handlers/FindUserRequestHandler.js';
import {MessageOfTheDayRequestHandler} from '../Handlers/MessageOfTheDayRequestHandler.js';
import {PrivateInfoRequestHandler} from '../Handlers/PrivateInfoRequestHandler.js';
import {PublicDataRequestHandler} from '../Handlers/PublicDataRequestHandler.js';
import {PublicInfoRequestHandler} from '../Handlers/PublicInfoRequestHandler.js';
import {ReceiveChatMessageHandler} from '../Handlers/ReceiveChatMessageHandler.js';
import {ReceiveClientPublicDataFromServerHandler} from '../Handlers/ReceiveClientPublicDataFromServerHandler.js';
import {ReceivePrivateChatMessageHandler} from '../Handlers/ReceivePrivateChatMessageHandler.js';
import {ReceivePrivateInfoHandler} from '../Handlers/ReceivePrivateInfoHandler.js';
import {ReceivePublicDataHandler} from '../Handlers/ReceivePublicDataHandler.js';
import {ReceivePublicInfoHandler} from '../Handlers/ReceivePublicInfoHandler.js';
import {RemoveFriendHandler} from '../Handlers/RemoveFriendHandler.js';
import {ServerRequestsClientsPublicDataHandler} from '../Handlers/ServerRequestsClientsPublicDataHandler.js';
import {ServerChangePublicInfoHandler} from '../Handlers/ServerChangePublicInfoHandler.js';
import {ServerListRequestHandler} from '../Handlers/ServerListRequestHandler.js';
import {ServerLoginRequestHandler} from '../Handlers/ServerLoginRequestHandler.js';
import {ServerLogoutHandler} from '../Handlers/ServerLogoutHandler.js';
import {UserJoinedServerHandler} from '../Handlers/UserJoinedServerHandler.js';
import {UserLeftServerHandler} from '../Handlers/UserLeftServerHandler.js';
import {IAccountRepository} from '../Db/IAccountRepository.js';
import {LobbyServer} from '../LobbyServer.js';
import {sacredConfig} from '../Config/SacredBambooConfig.js';
import {ChannelInfo} from '../State/ChannelInfo.js';
import {ChannelRegistry} from '../State/ChannelRegistry.js';
import {logger} from '../Util/Logger.js';

/**
 * Figtree `ServiceAbstract` wrapper around the Tincat LobbyServer. Owns the
 * ChannelRegistry (from config) and wires every CUSTOMDATA handler the
 * lobby ships with. ServiceManager calls start/stop.
 */
export class LobbyService extends ServiceAbstract {

    public static NAME = 'lobby_service';

    protected override readonly _importance: ServiceImportance = ServiceImportance.Critical;

    private _accountRepo: IAccountRepository;
    private _lobbyServer: LobbyServer | null = null;

    public constructor(accountRepo: IAccountRepository) {
        super(LobbyService.NAME);
        this._accountRepo = accountRepo;
    }

    public override async start(): Promise<void> {
        const cfg = sacredConfig().get()?.lobby;
        const host = cfg?.host ?? '0.0.0.0';
        const port = cfg?.port ?? 7066;

        const channelInfos: ChannelInfo[] = (cfg?.channels ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            flags: c.flags ?? 0,
            authorizedOnly: c.authorizedOnly ?? false
        }));
        const channels = new ChannelRegistry(channelInfos);

        const server = new LobbyServer(port, host, channels);

        // Account / MOTD (Stufe 3a)
        server.registerHandler(new ClientLoginRequestHandler(this._accountRepo));
        server.registerHandler(new ServerLoginRequestHandler());
        server.registerHandler(new MessageOfTheDayRequestHandler());

        // Channel / server-list / public chat (Stufe 3b.1)
        server.registerHandler(new ChannelListRequestHandler());
        server.registerHandler(new ChannelJoinRequestHandler());
        server.registerHandler(new ChannelLeaveRequestHandler());
        server.registerHandler(new ServerListRequestHandler());
        server.registerHandler(new ReceiveChatMessageHandler());
        server.registerHandler(new ServerChangePublicInfoHandler());
        server.registerHandler(new ServerLogoutHandler());

        // Social: registration, private chat, friends, find (Stufe 3b.2)
        server.registerHandler(new ClientRegistrationRequestHandler(this._accountRepo));
        server.registerHandler(new ReceivePrivateChatMessageHandler());
        server.registerHandler(new AddFriendHandler());
        server.registerHandler(new RemoveFriendHandler());
        server.registerHandler(new FindUserRequestHandler());

        // Admin / notifications (Stufe 3b.3)
        server.registerHandler(new AlarmHandler());
        server.registerHandler(new UserJoinedServerHandler());
        server.registerHandler(new UserLeftServerHandler());
        server.registerHandler(new ClosedNetNewCharacterHandler());

        // Profile info (Stufe 3b.4a)
        server.registerHandler(new PrivateInfoRequestHandler());
        server.registerHandler(new ReceivePrivateInfoHandler());
        server.registerHandler(new PublicInfoRequestHandler());
        server.registerHandler(new ReceivePublicInfoHandler());

        // Character blocks + selection (Stufe 3b.4b)
        server.registerHandler(new PublicDataRequestHandler());
        server.registerHandler(new ServerRequestsClientsPublicDataHandler());
        server.registerHandler(new ReceivePublicDataHandler());
        server.registerHandler(new ReceiveClientPublicDataFromServerHandler());
        server.registerHandler(new ClientCharacterSelectHandler());

        server.listen();
        this._lobbyServer = server;
        logger.info(
            `LobbyService started on ${host}:${port} with ${channelInfos.length} channel(s)`
        );
    }

    public override async stop(): Promise<void> {
        if (this._lobbyServer !== null) {
            this._lobbyServer.stop();
            this._lobbyServer = null;
        }
        logger.info('LobbyService stopped');
    }

}