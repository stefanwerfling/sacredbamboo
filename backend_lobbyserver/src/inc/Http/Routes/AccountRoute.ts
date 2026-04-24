import {Request, Response, Router} from 'express';
import {DefaultRoute, StatusCodes} from 'figtree';
import {Account} from '../../Db/Account.js';
import {validateRegistrationInput} from '../../Db/AccountPolicy.js';
import {IAccountRepository} from '../../Db/IAccountRepository.js';
import {logger} from '../../Util/Logger.js';
import {
    AccountLoginResponse,
    AccountMeResponse,
    AccountRegisterResponse,
    SchemaAccountLoginRequest,
    SchemaAccountLoginResponse,
    SchemaAccountMeResponse,
    SchemaAccountProfileUpdateRequest,
    SchemaAccountRegisterRequest,
    SchemaAccountRegisterResponse
} from '../Schemas/AccountSchemas.js';

type SessionWithUser = {user?: {isLogin: boolean; userid: string}} | undefined;

/**
 * Public HTTP endpoints for account self-service.
 *
 * Register: POST /json/v1/account/register  { username, password }
 * Login:    POST /json/v1/account/login     { username, password }
 *
 * The repository is injected at construction; the same instance is shared
 * with the Tincat login handler so credentials created here work for the
 * game client immediately.
 */
export class AccountRoute extends DefaultRoute {

    public static readonly BASE = 'account';

    private readonly _accounts: IAccountRepository;

    public constructor(accounts: IAccountRepository) {
        super();
        this._accounts = accounts;
    }

    public override getExpressRouter(): Router {
        this._post(
            this._getUrl('v1', AccountRoute.BASE, 'register'),
            false,
            async(req, _res, data): Promise<AccountRegisterResponse> => {
                const body = data.body!;
                const username = body.username.trim();
                const password = body.password;

                const policyError = validateRegistrationInput(username, password);
                if (policyError !== null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: policyError};
                }

                if (await this._accounts.findByUsername(username) !== null) {
                    return {
                        statusCode: StatusCodes.INTERNAL_ERROR,
                        msg: `username "${username}" is already taken`
                    };
                }

                const account = await this._accounts.create(username, password, {
                    nick: body.nick,
                    clan: body.clan,
                    email: body.email
                });
                logger.info(`http: registered account user=${account.username} permId=${account.permId} from=${req.ip}`);

                return {
                    statusCode: StatusCodes.OK,
                    username: account.username,
                    permId: account.permId
                };
            },
            {
                description: 'Register a new lobby account.',
                tags: ['account'],
                bodySchema: SchemaAccountRegisterRequest,
                responseBodySchema: SchemaAccountRegisterResponse
            }
        );

        this._post(
            this._getUrl('v1', AccountRoute.BASE, 'login'),
            false,
            async(req, _res, data): Promise<AccountLoginResponse> => {
                const body = data.body!;
                const account = await this._accounts.findByUsername(body.username);

                if (account === null || account.password !== body.password) {
                    return {
                        statusCode: StatusCodes.UNAUTHORIZED,
                        msg: 'invalid username or password'
                    };
                }

                if (req.session) {
                    (req.session as unknown as {user: {isLogin: boolean; userid: string}}).user = {
                        isLogin: true,
                        userid: String(account.permId)
                    };
                }

                return {
                    statusCode: StatusCodes.OK,
                    username: account.username,
                    permId: account.permId
                };
            },
            {
                description: 'Authenticate an existing account and open an HTTP session.',
                tags: ['account'],
                bodySchema: SchemaAccountLoginRequest,
                responseBodySchema: SchemaAccountLoginResponse
            }
        );

        this._post(
            this._getUrl('v1', AccountRoute.BASE, 'profile'),
            this._requireSessionLogin,
            async(req, _res, data): Promise<AccountMeResponse> => {
                const permId = AccountRoute._sessionPermId(req);
                if (permId === null) {
                    return {statusCode: StatusCodes.UNAUTHORIZED, msg: 'not logged in'};
                }
                const body = data.body!;
                const updated = await this._accounts.updateProfile(permId, {
                    nick: body.nick,
                    clan: body.clan,
                    email: body.email
                });
                if (updated === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'account not found'};
                }
                return {statusCode: StatusCodes.OK, account: AccountRoute._toInfo(updated)};
            },
            {
                description: 'Update own profile fields. Requires an active HTTP session.',
                tags: ['account'],
                bodySchema: SchemaAccountProfileUpdateRequest,
                responseBodySchema: SchemaAccountMeResponse
            }
        );

        this._post(
            this._getUrl('v1', AccountRoute.BASE, 'me'),
            this._requireSessionLogin,
            async(req, _res): Promise<AccountMeResponse> => {
                const permId = AccountRoute._sessionPermId(req);
                if (permId === null) {
                    return {statusCode: StatusCodes.UNAUTHORIZED, msg: 'not logged in'};
                }
                const account = await this._accounts.findByPermId(permId);
                if (account === null) {
                    return {statusCode: StatusCodes.INTERNAL_ERROR, msg: 'account vanished'};
                }
                return {statusCode: StatusCodes.OK, account: AccountRoute._toInfo(account)};
            },
            {
                description: 'Return the currently logged-in account.',
                tags: ['account'],
                responseBodySchema: SchemaAccountMeResponse
            }
        );

        return super.getExpressRouter();
    }

    private _requireSessionLogin = async(req: Request, res: Response): Promise<boolean> => {
        if (AccountRoute._sessionPermId(req) === null) {
            res.status(401).json({statusCode: StatusCodes.UNAUTHORIZED, msg: 'not logged in'});
            return false;
        }
        return true;
    };

    private static _sessionPermId(req: Request): number | null {
        const session = req.session as SessionWithUser;
        if (!session || !session.user || !session.user.isLogin) {
            return null;
        }
        const id = Number(session.user.userid);
        return Number.isFinite(id) ? id : null;
    }

    private static _toInfo(a: Account): {username: string; permId: number; nick?: string; clan?: string; email?: string; createdAt?: string} {
        return {
            username: a.username,
            permId: a.permId,
            nick: a.nick,
            clan: a.clan,
            email: a.email,
            createdAt: a.createdAt ? a.createdAt.toISOString() : undefined
        };
    }

}