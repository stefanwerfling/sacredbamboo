import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {validateRegistrationInput} from '../Db/AccountPolicy.js';
import {IAccountRepository} from '../Db/IAccountRepository.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {RegistrationMessage} from '../Packets/Messages/RegistrationMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ClientRegistrationRequest (1). Creates a new account when the
 * username is free, otherwise ErrorUsernameExists. Registration does NOT
 * log the client in — the client is expected to follow up with a
 * ClientLoginRequest.
 *
 * Minimum validation: non-empty username, non-empty password. CD-key /
 * mail fields are accepted and dropped (we don't have a policy for them
 * at this layer).
 */
export class ClientRegistrationRequestHandler implements ISacredMessageHandler {

    private _accounts: IAccountRepository;

    public constructor(accounts: IAccountRepository) {
        this._accounts = accounts;
    }

    public getType(): SacredMsgType {
        return SacredMsgType.ClientRegistrationRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let reg: RegistrationMessage;
        try {
            reg = RegistrationMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: RegistrationRequest parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ClientRegistrationRequest);
            return;
        }

        const policyError = validateRegistrationInput(reg.username, reg.password);
        if (policyError !== null) {
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ClientRegistrationRequest);
            client.sendImportantMessage(policyError);
            logger.info(`${client.getPeer()}: registration rejected: ${policyError}`);
            return;
        }

        if (await this._accounts.findByUsername(reg.username) !== null) {
            client.sendLobbyResult(LobbyResults.ErrorUsernameExists, SacredMsgType.ClientRegistrationRequest);
            client.sendImportantMessage(`Username "${reg.username}" is already taken`);
            return;
        }

        await this._accounts.create(reg.username, reg.password);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ClientRegistrationRequest);
        logger.info(`${client.getPeer()}: registered account user=${reg.username}`);
    }

}