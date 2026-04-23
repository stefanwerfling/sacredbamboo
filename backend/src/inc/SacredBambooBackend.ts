import {BackendApp, Config, MariaDBService, SchemaDefaultArgs, DefaultArgs} from 'figtree';
import {sacredConfig} from './Config/SacredBambooConfig.js';
import {SacredBambooConfigOptions} from './Config/SchemaSacredBambooConfig.js';
import {IAccountRepository} from './Db/IAccountRepository.js';
import {InMemoryAccountRepository} from './Db/InMemoryAccountRepository.js';
import {MariaDbAccountRepository} from './Db/MariaDbAccountRepository.js';
import {SacredBambooDbLoader} from './Db/SacredBambooDbLoader.js';
import {LobbyService} from './Services/LobbyService.js';
import {logger} from './Util/Logger.js';

/**
 * Top-level application.
 *
 * `_initServices` chooses the AccountRepository at boot:
 *   - if `config.db.mysql.database` is a non-empty string, we register
 *     figtree's `MariaDBService` with our `SacredBambooDbLoader` (which
 *     provides the `AccountEntity` typeorm metadata) and plug in
 *     `MariaDbAccountRepository` — accounts persist across restarts.
 *   - otherwise we fall back to `InMemoryAccountRepository`, seeded with
 *     the configured tincat user so a fresh install can still log in.
 *
 * Framework-provided behaviour (automatic via BackendApp):
 *   - config.json discovery + env-var overlay
 *   - winston logger with rotation, configured from `logging` section
 *   - uncaughtException / unhandledRejection handlers
 *   - graceful shutdown via `async-exit-hook`, running ServiceManager.stopAll
 */
export class SacredBambooBackend extends BackendApp<DefaultArgs, SacredBambooConfigOptions> {

    public static readonly NAME = 'sacredbamboo';

    public constructor() {
        super(SacredBambooBackend.NAME);
    }

    protected override _getArgSchema(): typeof SchemaDefaultArgs {
        return SchemaDefaultArgs;
    }

    protected override _getConfigInstance(): Config<SacredBambooConfigOptions> {
        const config = sacredConfig();
        config.setAppName(SacredBambooBackend.NAME);
        config.setAppTitle('Sacred bamboo Lobby Server');
        return config;
    }

    protected override async _initServices(): Promise<void> {
        const cfg = sacredConfig().get();
        const lobby = cfg?.lobby;
        const mysqlDb = cfg?.db?.mysql?.database ?? '';

        let accounts: IAccountRepository;
        if (mysqlDb !== '') {
            logger.info(`persistence: using MariaDB database "${mysqlDb}"`);
            this._serviceManager.add(new MariaDBService(SacredBambooDbLoader));
            accounts = new MariaDbAccountRepository();
        } else {
            logger.info('persistence: using in-memory account repository (no DB configured)');
            const memRepo = new InMemoryAccountRepository();
            // Seed the pre-configured lobby user so a fresh install can log in.
            memRepo.seed(lobby?.tincatUser ?? 'user', lobby?.tincatPassword ?? '');
            accounts = memRepo;
        }

        this._serviceManager.add(new LobbyService(accounts));
    }

}