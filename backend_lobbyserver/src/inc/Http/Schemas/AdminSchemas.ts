import {SchemaDefaultReturn} from 'figtree';
import {ExtractSchemaResultType, Vts} from 'vts';

export const SchemaKickRequest = Vts.object({
    permId: Vts.number({description: 'Target account permId'}),
    reason: Vts.optional(Vts.string())
});

export type KickRequest = ExtractSchemaResultType<typeof SchemaKickRequest>;

export const SchemaBroadcastRequest = Vts.object({
    message: Vts.string({description: 'Text shown to every logged-in client'})
});

export type BroadcastRequest = ExtractSchemaResultType<typeof SchemaBroadcastRequest>;

export const SchemaShutdownRequest = Vts.object({
    message: Vts.optional(Vts.string({description: 'Farewell text; clients see it before sockets drop'}))
});

export type ShutdownRequest = ExtractSchemaResultType<typeof SchemaShutdownRequest>;

export const SchemaAdminAck = SchemaDefaultReturn.extend({
    action: Vts.optional(Vts.string()),
    target: Vts.optional(Vts.string())
});

export type AdminAck = ExtractSchemaResultType<typeof SchemaAdminAck>;