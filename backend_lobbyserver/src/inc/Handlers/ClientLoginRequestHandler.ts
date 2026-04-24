import {ClientType} from '../Client/ClientType.js';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {sacredConfig} from '../Config/SacredBambooConfig.js';
import {IAccountRepository} from '../Db/IAccountRepository.js';
import {BuddyStatus} from '../Packets/Messages/BuddyStatus.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {LoginMessage} from '../Packets/Messages/LoginMessage.js';
import {LoginResultMessage} from '../Packets/Messages/LoginResultMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ClientLoginRequest (SacredMsgType 2). Steps:
 *   1. Parse the 162-byte LoginMessage from the packet body.
 *   2. Check the username/password against the AccountRepository; if
 *      `lobby.allowAnonymousLogin` is on, accept any username that isn't
 *      known with permId = connectionId + 1,000,000.
 *   3. On success: set client role to GameClient, assign identity, send
 *      ClientLoginResult + LobbyResult(Ok).
 *   4. On failure: send LobbyResult with the specific error + an
 *      ImportantMessage carrying the human-readable reason.
 *
 * Mirrors the reference server's `OnClientLoginRequest`, minus the
 * PublicData profile shipment (Stufe 3b).
 */
export class ClientLoginRequestHandler implements ISacredMessageHandler {

    private _accounts: IAccountRepository;

    public constructor(accounts: IAccountRepository) {
        this._accounts = accounts;
    }

    public getType(): SacredMsgType {
        return SacredMsgType.ClientLoginRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let login: LoginMessage;
        try {
            login = LoginMessage.parse(packet.body);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ClientLoginRequest parse failed: ${msg}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ClientLoginRequest);
            return;
        }

        const peerIp = client.getPeerIp().join('.');
        const banReason = client.getLobby().isBanned(peerIp, 'client');
        if (banReason !== null) {
            logger.warn(
                `${client.getPeer()}: client-login rejected (banned)` +
                (banReason !== '' ? ` reason="${banReason}"` : '')
            );
            client.sendLobbyResult(LobbyResults.ErrorUserBanned, SacredMsgType.ClientLoginRequest);
            client.sendImportantMessage(banReason !== '' ? `Banned: ${banReason}` : 'Banned');
            client.close();
            return;
        }

        const existing = await this._accounts.findByUsername(login.username);
        if (existing !== null) {
            if (existing.password !== login.password) {
                logger.info(`${client.getPeer()}: login rejected (bad password) user=${login.username}`);
                client.sendLobbyResult(LobbyResults.InvalidPassword, SacredMsgType.ClientLoginRequest);
                client.sendImportantMessage('Invalid password!');
                return;
            }
            this._grant(client, login.username, existing.permId, 'Welcome back!');
            return;
        }

        const cfg = sacredConfig().get()?.lobby;
        if (cfg?.allowAnonymousLogin ?? true) {
            const permId = client.getConnectionId() + 1_000_000;
            this._grant(client, login.username, permId, 'Welcome!');
            return;
        }

        logger.info(`${client.getPeer()}: login rejected (unknown user) user=${login.username}`);
        client.sendLobbyResult(LobbyResults.ErrorUserNotFound, SacredMsgType.ClientLoginRequest);
        client.sendImportantMessage('Unknown user!');
    }

    private _grant(client: SacredClient, username: string, permId: number, message: string): void {
        client.setClientType(ClientType.GameClient);
        client.setIdentity(username, permId);

        const result = new LoginResultMessage(
            LobbyResults.Ok,
            client.getPeerIp(),
            permId,
            message
        );
        client.sendClientLoginResult(result);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ClientLoginRequest);

        // Announce InLobby to anyone who has this user in their friend list.
        client.getLobby().broadcastFriendStatus(client, BuddyStatus.InLobby);

        logger.info(`${client.getPeer()}: logged in as user=${username} permId=${permId}`);
    }

}