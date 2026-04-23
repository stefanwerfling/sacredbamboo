import {Logger as FigtreeLogger} from 'figtree';
import type {Logger as WinstonLogger} from 'winston';

/**
 * Thin facade over figtree's Logger. We export `logger` as a lazy
 * getter-like object so call sites do not need to be rewritten: code that
 * had `import {logger} from '.../Logger.js'; logger.info(...)` keeps
 * working. Behind the scenes figtree builds a configured winston instance
 * lazily on first `getLogger()` call.
 */
function getUnderlying(): WinstonLogger {
    return FigtreeLogger.getLogger();
}

export const logger = {
    info: (msg: string, ...meta: unknown[]): void => { getUnderlying().info(msg, ...meta); },
    warn: (msg: string, ...meta: unknown[]): void => { getUnderlying().warn(msg, ...meta); },
    error: (msg: string, ...meta: unknown[]): void => { getUnderlying().error(msg, ...meta); },
    debug: (msg: string, ...meta: unknown[]): void => { getUnderlying().debug(msg, ...meta); }
};