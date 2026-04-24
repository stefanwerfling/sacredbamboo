import {Account, AccountProfile} from './Account.js';

/**
 * Storage contract for accounts. Implementations plug into
 * `SacredBambooBackend` and the login handler; the interface deliberately
 * exposes only the handful of ops the lobby needs today (lookup, create,
 * profile-update), not a generic repository.
 */
export interface IAccountRepository {

    findByUsername(username: string): Promise<Account | null>;

    findByPermId(permId: number): Promise<Account | null>;

    /** Creates a new account, returns it. Throws if the username exists. */
    create(username: string, password: string, profile?: AccountProfile): Promise<Account>;

    /**
     * Merges the provided profile fields onto the stored account.
     * Returns the updated account, or `null` if no account exists.
     */
    updateProfile(permId: number, profile: AccountProfile): Promise<Account | null>;

}