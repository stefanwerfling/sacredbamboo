import {Logger as FigtreeLogger} from 'figtree';
import type {Logger as WinstonLogger} from 'winston';

/**
 * Thin facade over figtree's Logger, matching the shape used in
 * backend_lobbyserver so call sites port verbatim.
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