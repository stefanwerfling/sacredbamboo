import {SchemaConfigBackendOptions} from 'figtree';
import {ExtractSchemaResultType, Vts} from 'vts';
import {SchemaLobbyOptions} from './SchemaLobbyOptions.js';

/**
 * Full application config. Inherits figtree's backend sections
 * (`db`, `httpserver`, `logging`) and adds our `lobby` section.
 */
export const SchemaSacredBambooConfig = SchemaConfigBackendOptions.extend({
    lobby: Vts.optional(SchemaLobbyOptions)
});

export type SacredBambooConfigOptions = ExtractSchemaResultType<typeof SchemaSacredBambooConfig>;