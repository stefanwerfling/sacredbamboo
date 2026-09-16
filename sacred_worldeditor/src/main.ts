import {AppState} from './state/AppState.js';
import {SacredGoldDir} from './io/SacredGoldDir.js';
import {Dom} from './ui/Dom.js';
import {Sidebar} from './ui/Sidebar.js';
import {Inspector} from './ui/Inspector.js';
import {Viewport} from './ui/Viewport.js';

/**
 * Top-level wiring for the editor. Constructs the AppState, mounts the
 * three UI panels, and binds the toolbar's directory-picker button.
 * Kept as a class so the whole entry point follows the same
 * everything-class-bound convention as the asset library.
 */
class WorldEditor {

    private readonly _state    = new AppState();
    private readonly _status:    HTMLElement;
    private readonly _openBtn:   HTMLButtonElement;

    public constructor() {
        new Sidebar(Dom.byId<HTMLUListElement>('asset-tree'),   this._state);
        new Inspector(Dom.byId('inspector-body'),               this._state);
        new Viewport(Dom.byId<HTMLCanvasElement>('canvas'),     this._state);

        this._status  = Dom.byId('status');
        this._openBtn = Dom.byId<HTMLButtonElement>('open-dir');

        this._state.subscribe(() => this._renderStatus());
        this._openBtn.addEventListener('click', () => { void this._onOpen(); });
    }

    private _renderStatus(): void {
        if (!this._state.dir) {
            return;
        }

        const names = this._state.containers.map((c) => c.name.split('/').pop()).join(', ');

        this._status.textContent = this._state.containers.length === 0
            ? 'Verzeichnis geladen — keine World-Dateien gefunden'
            : `Verzeichnis geladen — ${names}`;
    }

    private async _onOpen(): Promise<void> {
        try {
            const dir = await SacredGoldDir.pick();

            await this._state.openDir(dir);
        } catch (err) {
            if ((err as DOMException)?.name === 'AbortError') {
                return;
            }

            console.error(err);
            this._status.textContent = `Fehler: ${(err as Error).message}`;
        }
    }

}

new WorldEditor();