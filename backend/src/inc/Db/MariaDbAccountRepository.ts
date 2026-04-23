import {Repository} from 'typeorm';
import {DBHelper} from 'figtree';
import {Account} from './Account.js';
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

    public async findByUsername(username: string): Promise<Account | null> {
        const repo = await this._repo();
        const row = await repo.findOne({where: {username}});
        return row === null ? null : {username: row.username, password: row.password, permId: row.id};
    }

    public async create(username: string, password: string): Promise<Account> {
        const repo = await this._repo();
        const existing = await repo.findOne({where: {username}});
        if (existing !== null) {
            throw new Error(`account exists: ${username}`);
        }
        const entity = repo.create({username, password});
        const saved = await repo.save(entity);
        return {username: saved.username, password: saved.password, permId: saved.id};
    }

}