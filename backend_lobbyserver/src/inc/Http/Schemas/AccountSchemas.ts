import {SchemaDefaultReturn} from 'figtree';
import {ExtractSchemaResultType, Vts} from 'vts';

export const SchemaAccountRegisterRequest = Vts.object({
    username: Vts.string({description: 'Account name, 1..80 characters'}),
    password: Vts.string({description: 'Plain-text password, 1..64 characters'}),
    nick: Vts.optional(Vts.string()),
    clan: Vts.optional(Vts.string()),
    email: Vts.optional(Vts.string())
});

export type AccountRegisterRequest = ExtractSchemaResultType<typeof SchemaAccountRegisterRequest>;

export const SchemaAccountInfo = Vts.object({
    username: Vts.string(),
    permId: Vts.number(),
    nick: Vts.optional(Vts.string()),
    clan: Vts.optional(Vts.string()),
    email: Vts.optional(Vts.string()),
    createdAt: Vts.optional(Vts.string({description: 'ISO-8601 creation timestamp'}))
});

export const SchemaAccountRegisterResponse = SchemaDefaultReturn.extend({
    username: Vts.optional(Vts.string({description: 'Registered username, echoed on success'})),
    permId: Vts.optional(Vts.number({description: 'Assigned permanent id'}))
});

export type AccountRegisterResponse = ExtractSchemaResultType<typeof SchemaAccountRegisterResponse>;

export const SchemaAccountLoginRequest = Vts.object({
    username: Vts.string({description: 'Account name'}),
    password: Vts.string({description: 'Plain-text password'})
});

export type AccountLoginRequest = ExtractSchemaResultType<typeof SchemaAccountLoginRequest>;

export const SchemaAccountLoginResponse = SchemaDefaultReturn.extend({
    username: Vts.optional(Vts.string()),
    permId: Vts.optional(Vts.number())
});

export type AccountLoginResponse = ExtractSchemaResultType<typeof SchemaAccountLoginResponse>;

export const SchemaAccountProfileUpdateRequest = Vts.object({
    nick: Vts.optional(Vts.string()),
    clan: Vts.optional(Vts.string()),
    email: Vts.optional(Vts.string())
});

export type AccountProfileUpdateRequest = ExtractSchemaResultType<typeof SchemaAccountProfileUpdateRequest>;

export const SchemaAccountMeResponse = SchemaDefaultReturn.extend({
    account: Vts.optional(SchemaAccountInfo)
});

export type AccountMeResponse = ExtractSchemaResultType<typeof SchemaAccountMeResponse>;