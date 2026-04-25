import {SchemaConfigBackendOptions} from 'figtree';
import {ExtractSchemaResultType, Vts} from 'vts';
import {SchemaGameServerOptions} from './SchemaGameServerOptions.js';

/**
 * Full application config for the GameServer. Inherits figtree's backend
 * sections (`db`, `httpserver`, `logging`) and adds our `gameserver`
 * section.
 */
export const SchemaSacredBambooGameServerConfig = SchemaConfigBackendOptions.extend({
    gameserver: Vts.optional(SchemaGameServerOptions)
});

export type SacredBambooGameServerConfigOptions = ExtractSchemaResultType<typeof SchemaSacredBambooGameServerConfig>;