import {HttpRouteLoader, IDefaultRoute, SwaggerUIRoute} from 'figtree';
import {IAccountRepository} from '../Db/IAccountRepository.js';
import {LobbyService} from '../Services/LobbyService.js';
import {AccountRoute} from './Routes/AccountRoute.js';
import {AdminRoute} from './Routes/AdminRoute.js';
import {LobbyRoute} from './Routes/LobbyRoute.js';

/**
 * Route loader for the Sacred Bamboo HTTP API.
 *
 * figtree's `HttpService` takes a route-loader *class* and invokes
 * `loadRoutes()` statically, so we can't pass dependencies through a
 * constructor. Instead the backend plants the account repository and the
 * lobby-service reference on the class before adding `HttpService` to
 * the ServiceManager.
 */
export class SacredBambooRouteLoader extends HttpRouteLoader {

    private static _accounts: IAccountRepository | null = null;
    private static _lobbyService: LobbyService | null = null;

    public static setAccounts(accounts: IAccountRepository): void {
        SacredBambooRouteLoader._accounts = accounts;
    }

    public static setLobbyService(lobbyService: LobbyService): void {
        SacredBambooRouteLoader._lobbyService = lobbyService;
    }

    public static override async loadRoutes(): Promise<IDefaultRoute[]> {
        if (SacredBambooRouteLoader._accounts === null) {
            throw new Error('SacredBambooRouteLoader.loadRoutes: accounts repository not set');
        }
        if (SacredBambooRouteLoader._lobbyService === null) {
            throw new Error('SacredBambooRouteLoader.loadRoutes: lobby service not set');
        }

        SwaggerUIRoute.getInstance().setInfo('Sacred Bamboo Lobby API', '1.0.0');

        return [
            new AccountRoute(SacredBambooRouteLoader._accounts),
            new LobbyRoute(SacredBambooRouteLoader._lobbyService),
            new AdminRoute(SacredBambooRouteLoader._lobbyService),
            SwaggerUIRoute.getInstance()
        ];
    }

}