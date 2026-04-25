import {BackendApp, Config, SchemaDefaultArgs, DefaultArgs} from 'figtree';
import {sacredGameServerConfig} from './Config/SacredBambooGameServerConfig.js';
import {SacredBambooGameServerConfigOptions} from './Config/SchemaSacredBambooGameServerConfig.js';
import {GameService} from './Services/GameService.js';
import {logger} from './Util/Logger.js';

/**
 * Top-level application for the GameServer.
 *
 * Mirrors `SacredBambooBackend` in backend_lobbyserver but currently ships
 * with an empty service set — the Tincat wire layer and the GameService
 * wrapper land in later steps. Keeping the skeleton minimal means a fresh
 * checkout compiles and boots (no-op) from day one.
 */
export class SacredBambooGameServerBackend extends BackendApp<DefaultArgs, SacredBambooGameServerConfigOptions> {

    public static readonly NAME = 'sacredbamboo-gameserver';

    public constructor() {
        super(SacredBambooGameServerBackend.NAME);
    }

    protected override _getArgSchema(): typeof SchemaDefaultArgs {
        return SchemaDefaultArgs;
    }

    protected override _getConfigInstance(): Config<SacredBambooGameServerConfigOptions> {
        const config = sacredGameServerConfig();
        config.setAppName(SacredBambooGameServerBackend.NAME);
        config.setAppTitle('Sacred bamboo Game Server');
        return config;
    }

    protected override async _initServices(): Promise<void> {
        const cfg = sacredGameServerConfig().get()?.gameserver;
        logger.info(
            `GameServer boot: listen=${cfg?.host}:${cfg?.port} lobby=${cfg?.lobbyHost}:${cfg?.lobbyPort}`
        );

        this._serviceManager.add(new GameService());
    }

}