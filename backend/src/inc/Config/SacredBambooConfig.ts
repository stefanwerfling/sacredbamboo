import {Config, ConfigBackend} from 'figtree';
import {SacredBambooConfigOptions, SchemaSacredBambooConfig} from './SchemaSacredBambooConfig.js';

/**
 * Typed singleton around our extended ConfigBackend. Defaults are applied in
 * `_loadEnv` so a missing `config.json` (or a partial one) still yields a
 * fully-populated config object.
 *
 * The base `Config.getInstance<I>()` is generic over the schema type — we
 * avoid re-declaring it as a narrow override (which would break the static
 * side of the class against the base class). Instead, callers use the
 * module-level `sacredConfig()` factory below; it plants the instance into
 * figtree's shared singleton slot so that framework code (`BackendApp`,
 * `Logger`) sees the same object.
 */
export class SacredBambooConfig extends ConfigBackend<SacredBambooConfigOptions> {

    public constructor() {
        super(SchemaSacredBambooConfig);
    }

    protected override _loadEnv(aConfig: SacredBambooConfigOptions | null): SacredBambooConfigOptions | null {
        const base = super._loadEnv(aConfig) ?? {};
        return this._applyDefaults(base as SacredBambooConfigOptions);
    }

    /**
     * `Config.load()` always ends in `_setDefaults`. Override it so a bare
     * `load(null, false)` (no config file, no env overlay) still yields a
     * populated config — otherwise `BackendApp.start()` refuses to boot.
     */
    protected override _setDefaults(config: SacredBambooConfigOptions | null): SacredBambooConfigOptions | null {
        return this._applyDefaults((config ?? {}) as SacredBambooConfigOptions);
    }

    private _applyDefaults(cfg: SacredBambooConfigOptions): SacredBambooConfigOptions {
        // Figtree's default log directory is `/var/log/<appname>/` which
        // requires root on most boxes. Ship a default that works out of
        // the box (relative path under cwd) plus console-only output.
        cfg.logging = {
            dirname: cfg.logging?.dirname ?? 'logs',
            filename: cfg.logging?.filename ?? 'sacredbamboo-%DATE%.log',
            zippedArchive: cfg.logging?.zippedArchive ?? false,
            maxSize: cfg.logging?.maxSize ?? '20m',
            maxFiles: cfg.logging?.maxFiles ?? '14d',
            enableConsole: cfg.logging?.enableConsole ?? true,
            level: cfg.logging?.level ?? 'info'
        };

        cfg.lobby = {
            host: cfg.lobby?.host ?? '0.0.0.0',
            port: cfg.lobby?.port ?? 7066,
            tincatUser: cfg.lobby?.tincatUser ?? 'user',
            tincatPassword: cfg.lobby?.tincatPassword ?? '',
            keepAliveIntervalMs: cfg.lobby?.keepAliveIntervalMs ?? 15000,
            clientTimeoutMs: cfg.lobby?.clientTimeoutMs ?? 60000,
            messageOfTheDay: cfg.lobby?.messageOfTheDay ?? '',
            allowAnonymousLogin: cfg.lobby?.allowAnonymousLogin ?? true,
            channels: cfg.lobby?.channels ?? [
                {id: 1, name: 'General', flags: 0, authorizedOnly: false}
            ]
        };
        return cfg;
    }

}

let _instance: SacredBambooConfig | null = null;

/**
 * Typed accessor for the application config. First call constructs the
 * singleton and registers it with figtree's `Config` so framework code
 * (logger configuration, BackendApp lifecycle) resolves the same object.
 */
export function sacredConfig(): SacredBambooConfig {
    if (_instance === null) {
        _instance = new SacredBambooConfig();
        // Share with figtree's static singleton slot. The slot is
        // `protected static`, so we reach it via a deliberate any-cast.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Config as any)._instance = _instance;
    }
    return _instance;
}