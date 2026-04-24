import {Repository} from 'typeorm';
import {DBHelper} from 'figtree';
import {Account, AccountProfile} from './Account.js';
import {AccountEntity} from './Entity/AccountEntity.js';
import {IAccountRepository} from './IAccountRepository.js';

/**
 * MariaDB-backed IAccountRepository. Uses figtree's DBHelper to resolve
 * the typeorm Repository for AccountEntity; MariaDBService must be
 * started first so the data source is initialised.
 *
 * The auto-incremented `AccountEntity.id` serves double duty as the
 * `permId` sent on the wire — they're the same integer, so there's no
 * separate column to keep in sync.
 */
export class MariaDbAccountRepository implements IAccountRepository {

    private _repoPromise: Promise<Repository<AccountEntity>> | null = null;

    private _repo(): Promise<Repository<AccountEntity>> {
        if (this._repoPromise === null) {
            this._repoPromise = Promise.resolve(DBHelper.getRepository(AccountEntity));
        }
        return this._repoPromise;
    }

    private _toAccount(row: AccountEntity): Account {
        return {
            username: row.username,
            password: row.password,
            permId: row.id,
            nick: row.nick ?? undefined,
            clan: row.clan ?? undefined,
            email: row.email ?? undefined,
            createdAt: row.createdAt
        };
    }

    public async findByUsername(username: string): Promise<Account | null> {
        const repo = await this._repo();
        const row = await repo.findOne({where: {username}});
        return row === null ? null : this._toAccount(row);
    }

    public async findByPermId(permId: number): Promise<Account | null> {
        const repo = await this._repo();
        const row = await repo.findOne({where: {id: permId}});
        return row === null ? null : this._toAccount(row);
    }

    public async create(username: string, password: string, profile?: AccountProfile): Promise<Account> {
        const repo = await this._repo();
        const existing = await repo.findOne({where: {username}});
        if (existing !== null) {
            throw new Error(`account exists: ${username}`);
        }
        const entity = repo.create({
            username,
            password,
            nick: profile?.nick ?? null,
            clan: profile?.clan ?? null,
            email: profile?.email ?? null
        });
        const saved = await repo.save(entity);
        return this._toAccount(saved);
    }

    public async updateProfile(permId: number, profile: AccountProfile): Promise<Account | null> {
        const repo = await this._repo();
        const row = await repo.findOne({where: {id: permId}});
        if (row === null) {
            return null;
        }
        if (profile.nick !== undefined) {
            row.nick = profile.nick;
        }
        if (profile.clan !== undefined) {
            row.clan = profile.clan;
        }
        if (profile.email !== undefined) {
            row.email = profile.email;
        }
        const saved = await repo.save(row);
        return this._toAccount(saved);
    }

}