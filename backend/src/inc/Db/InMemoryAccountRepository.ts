import {Account} from './Account.js';
import {IAccountRepository} from './IAccountRepository.js';

/**
 * In-memory account store. Seeded with the configured default lobby user so
 * a fresh install can log in without a database. A MariaDB-backed repo
 * (via figtree's MariaDBService + a typeorm entity) can replace this later
 * without any change to the handler layer.
 */
export class InMemoryAccountRepository implements IAccountRepository {

    private _accounts: Map<string, Account> = new Map();
    private _nextPermId: number = 1;

    public seed(username: string, password: string): void {
        if (username !== '' && !this._accounts.has(username)) {
            this._accounts.set(username, {username, password, permId: this._nextPermId++});
        }
    }

    public async findByUsername(username: string): Promise<Account | null> {
        return this._accounts.get(username) ?? null;
    }

    public async create(username: string, password: string): Promise<Account> {
        if (this._accounts.has(username)) {
            throw new Error(`account exists: ${username}`);
        }
        const account: Account = {username, password, permId: this._nextPermId++};
        this._accounts.set(username, account);
        return account;
    }

}