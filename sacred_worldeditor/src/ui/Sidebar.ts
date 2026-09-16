import {AppState, LoadedContainer} from '../state/AppState.js';

const OBJ_PAGE_SIZE = 100;

/**
 * Asset tree on the left. One collapsible group per loaded container.
 * For OBJ containers with millions of records we only render the first
 * `OBJ_PAGE_SIZE` rows plus a "load more" button — otherwise the DOM
 * tree alone would have ~7 M nodes for Floor.PAK.
 */
export class Sidebar {

    private readonly _expanded = new Set<number>();
    private readonly _page     = new Map<number, number>();

    public constructor(
        private readonly _root:  HTMLUListElement,
        private readonly _state: AppState
    ) {
        this._state.subscribe(() => this._render());
        this._render();
    }

    private _render(): void {
        this._root.innerHTML = '';

        if (this._state.containers.length === 0) {
            const li      = document.createElement('li');
            li.className  = 'group';
            li.textContent = '(noch nichts geladen)';
            this._root.appendChild(li);

            return;
        }

        this._state.containers.forEach((c, idx) => this._renderContainer(idx, c));
    }

    private _renderContainer(idx: number, c: LoadedContainer): void {
        const group = document.createElement('li');

        group.className   = 'group';
        const expanded    = this._expanded.has(idx);
        let meta: string;

        switch (c.kind) {
            case 'trg':
                meta = `${c.entries.length} Einträge`;
                break;
            case 'obj':
                meta = `${c.recordCount.toLocaleString('de-DE')} Records · type=0x${c.recordType.toString(16)} · ${c.recordLength}B`;
                break;
            case 'wlk':
                meta = `${c.sectorCount.toLocaleString('de-DE')} Sektoren · Grid ${c.gridWidth}×${c.gridHeight}`;
                break;
            case 'wld':
                meta = `${c.sectorCount.toLocaleString('de-DE')} Sektoren · zlib-Streams`;
                break;
        }

        group.textContent = `${expanded ? '▾' : '▸'} ${c.name} (${meta})`;
        group.style.cursor = 'pointer';
        group.addEventListener('click', () => {
            if (expanded) {
                this._expanded.delete(idx);
            } else {
                this._expanded.add(idx);
            }

            this._render();
        });

        this._root.appendChild(group);

        if (!expanded) {
            return;
        }

        if (c.kind === 'trg') {
            for (const e of c.entries) {
                this._appendRow(
                    idx,
                    e.index,
                    `#${e.index}`,
                    `type=0x${e.type.toString(16)} len=${e.length}`
                );
            }

            return;
        }

        const rowCount = c.kind === 'obj' ? c.recordCount : c.sectorCount;
        const limit    = this._page.get(idx) ?? OBJ_PAGE_SIZE;
        const shown    = Math.min(rowCount, limit);

        for (let i = 0; i < shown; i++) {
            let meta = '';

            if (c.kind === 'wlk') {
                const gi  = c.gridIndex[i]!;
                const row = Math.floor(gi / c.gridWidth);
                const col = gi % c.gridWidth;

                meta = `(${row},${col}) · ord ${c.ordinal[i]}`;
            }

            this._appendRow(idx, i, `#${i}`, meta);
        }

        if (shown < rowCount) {
            const more       = document.createElement('li');
            more.style.cssText = 'color:var(--accent);cursor:pointer;text-align:center;padding-top:4px;';
            more.textContent  = `+${OBJ_PAGE_SIZE} weitere (${(rowCount - shown).toLocaleString('de-DE')} insgesamt)`;
            more.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this._page.set(idx, shown + OBJ_PAGE_SIZE);
                this._render();
            });

            this._root.appendChild(more);
        }
    }

    private _appendRow(containerIdx: number, recordIdx: number, label: string, meta: string): void {
        const li     = document.createElement('li');

        const lbl    = document.createElement('span');
        lbl.textContent = label;
        li.appendChild(lbl);

        if (meta) {
            const m = document.createElement('span');
            m.className   = 'meta';
            m.textContent = meta;
            li.appendChild(m);
        }

        const sel = this._state.selection;

        if (sel && sel.containerIdx === containerIdx && sel.recordIdx === recordIdx) {
            li.classList.add('selected');
        }

        li.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this._state.select({containerIdx, recordIdx});
        });

        this._root.appendChild(li);
    }

}