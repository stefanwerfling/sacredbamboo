import {Config, ConfigBackend} from 'figtree';
import {SacredBambooGameServerConfigOptions, SchemaSacredBambooGameServerConfig} from './SchemaSacredBambooGameServerConfig.js';

/**
 * Typed singleton around our extended ConfigBackend. Mirrors
 * `SacredBambooConfig` in backend_lobbyserver — see that file for the
 * rationale behind the `Config._instance` any-cast.
 *
 * Defaults are applied in `_loadEnv` / `_setDefaults` so a missing
 * `config.json` (or a partial one) still yields a fully-populated config
 * object and `BackendApp.start()` can boot.
 */
export class SacredBambooGameServerConfig extends ConfigBackend<SacredBambooGameServerConfigOptions> {

    public constructor() {
        super(SchemaSacredBambooGameServerConfig);
    }

    protected override _loadEnv(aConfig: SacredBambooGameServerConfigOptions | null): SacredBambooGameServerConfigOptions | null {
        const base = super._loadEnv(aConfig) ?? {};
        return this._applyDefaults(base as SacredBambooGameServerConfigOptions);
    }

    protected override _setDefaults(config: SacredBambooGameServerConfigOptions | null): SacredBambooGameServerConfigOptions | null {
        return this._applyDefaults((config ?? {}) as SacredBambooGameServerConfigOptions);
    }

    private _applyDefaults(cfg: SacredBambooGameServerConfigOptions): SacredBambooGameServerConfigOptions {
        // figtree's default log directory is `/var/log/<appname>/`, which
        // requires root on most boxes. Ship a relative default.
        cfg.logging = {
            dirname: cfg.logging?.dirname ?? 'logs',
            filename: cfg.logging?.filename ?? 'sacredbamboo-gameserver-%DATE%.log',
            zippedArchive: cfg.logging?.zippedArchive ?? false,
            maxSize: cfg.logging?.maxSize ?? '20m',
            maxFiles: cfg.logging?.maxFiles ?? '14d',
            enableConsole: cfg.logging?.enableConsole ?? true,
            level: cfg.logging?.level ?? 'info'
        };

        cfg.gameserver = {
            host: cfg.gameserver?.host ?? '0.0.0.0',
            port: cfg.gameserver?.port ?? 7080,
            serverName: cfg.gameserver?.serverName ?? 'SacredBamboo GameServer',
            lobbyHost: cfg.gameserver?.lobbyHost ?? '127.0.0.1',
            lobbyPort: cfg.gameserver?.lobbyPort ?? 7066,
            // The lobby's default tincatUser is 'user' with empty password
            // (see backend_lobbyserver/src/inc/Config/SacredBambooConfig.ts).
            // Override here when the lobby is configured with a non-empty
            // password.
            lobbyTincatUser: cfg.gameserver?.lobbyTincatUser ?? 'user',
            lobbyTincatPassword: cfg.gameserver?.lobbyTincatPassword ?? '',
            lobbyChannelId: cfg.gameserver?.lobbyChannelId ?? 1,
            networkVersion: cfg.gameserver?.networkVersion ?? 0,
            clientGameVersion: cfg.gameserver?.clientGameVersion ?? 0,
            maxUsers: cfg.gameserver?.maxUsers ?? 16,
            keepAliveIntervalMs: cfg.gameserver?.keepAliveIntervalMs ?? 15000,
            clientTimeoutMs: cfg.gameserver?.clientTimeoutMs ?? 60000
        };

        // figtree's SchemaConfigHttpServer requires `publicdir` even when
        // we don't run the admin HTTP surface. Keep a safe default.
        cfg.httpserver = {
            port: cfg.httpserver?.port ?? 7081,
            publicdir: cfg.httpserver?.publicdir ?? '',
            session: cfg.httpserver?.session,
            sslpath: cfg.httpserver?.sslpath,
            proxy: cfg.httpserver?.proxy,
            csrf: cfg.httpserver?.csrf
        };
        return cfg;
    }

}

let _instance: SacredBambooGameServerConfig | null = null;

/**
 * Typed accessor for the GameServer config. First call constructs the
 * singleton and registers it with figtree's `Config` so framework code
 * resolves the same object.
 */
export function sacredGameServerConfig(): SacredBambooGameServerConfig {
    if (_instance === null) {
        _instance = new SacredBambooGameServerConfig();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Config as any)._instance = _instance;
    }
    return _instance;
}