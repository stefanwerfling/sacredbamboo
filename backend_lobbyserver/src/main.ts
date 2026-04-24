import {SacredBambooBackend} from './inc/SacredBambooBackend.js';

(async(): Promise<void> => {
    await new SacredBambooBackend().start();
})();