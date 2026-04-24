import {Account, AccountProfile} from './Account.js';
import {IAccountRepository} from './IAccountRepository.js';

/**
 * In-memory account store. Seeded with the configured default lobby user so
 * a fresh install can log in without a database. A MariaDB-backed repo
 * (via figtree's MariaDBService + a typeorm entity) can replace this later
 * without any change to the handler layer.
 */
export class InMemoryAccountRepository implements IAccountRepository {

    private _accounts: Map<string, Account> = new Map();
    private _byPermId: Map<number, Account> = new Map();
    private _nextPermId: number = 1;

    public seed(username: string, password: string): void {
        if (username !== '' && !this._accounts.has(username)) {
            const account: Account = {
                username, password,
                permId: this._nextPermId++,
                createdAt: new Date()
            };
            this._accounts.set(username, account);
            this._byPermId.set(account.permId, account);
        }
    }

    public async findByUsername(username: string): Promise<Account | null> {
        return this._accounts.get(username) ?? null;
    }

    public async findByPermId(permId: number): Promise<Account | null> {
        return this._byPermId.get(permId) ?? null;
    }

    public async create(username: string, password: string, profile?: AccountProfile): Promise<Account> {
        if (this._accounts.has(username)) {
            throw new Error(`account exists: ${username}`);
        }
        const account: Account = {
            username,
            password,
            permId: this._nextPermId++,
            nick: profile?.nick,
            clan: profile?.clan,
            email: profile?.email,
            createdAt: new Date()
        };
        this._accounts.set(username, account);
        this._byPermId.set(account.permId, account);
        return account;
    }

    public async updateProfile(permId: number, profile: AccountProfile): Promise<Account | null> {
        const existing = this._byPermId.get(permId);
        if (existing === undefined) {
            return null;
        }
        if (profile.nick !== undefined) {
            existing.nick = profile.nick;
        }
        if (profile.clan !== undefined) {
            existing.clan = profile.clan;
        }
        if (profile.email !== undefined) {
            existing.email = profile.email;
        }
        return existing;
    }

}