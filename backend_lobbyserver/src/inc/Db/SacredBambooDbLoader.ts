import {DBLoader} from 'figtree';
import {AccountEntity} from './Entity/AccountEntity.js';

/**
 * Entity/migration registry handed to figtree's MariaDBService. The
 * service calls `loadEntities()` once at boot and registers the returned
 * classes with typeorm; `synchronize: true` inside MariaDBService then
 * auto-creates missing tables/columns.
 *
 * Extends figtree's `DBLoader` so the static members satisfy the
 * `DBLoaderType` constructor+static signature the service expects.
 */
export class SacredBambooDbLoader extends DBLoader {

    public static override async loadEntities(): Promise<Function[]> {
        return [AccountEntity];
    }

    public static override loadMigrations(): Function[] {
        return [];
    }

}