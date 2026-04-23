import {Account} from './Account.js';

/**
 * Storage contract for accounts. Implementations plug into
 * `SacredBambooBackend` and the login handler; the interface deliberately
 * exposes only the handful of ops the lobby needs today (lookup +
 * create), not a generic repository.
 */
export interface IAccountRepository {

    findByUsername(username: string): Promise<Account | null>;

    /** Creates a new account, returns it. Throws if the username exists. */
    create(username: string, password: string): Promise<Account>;

}