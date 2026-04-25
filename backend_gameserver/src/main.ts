import {SacredBambooGameServerBackend} from './inc/SacredBambooGameServerBackend.js';

(async(): Promise<void> => {
    await new SacredBambooGameServerBackend().start();
})();