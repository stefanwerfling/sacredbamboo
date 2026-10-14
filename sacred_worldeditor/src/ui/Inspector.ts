import {FloorRecord, ObjReader, WldSector, WlkSector} from 'sacredbamboo-assets';
import {AppState, LoadedContainer, LoadedWld, LoadedWlk} from '../state/AppState.js';

const FLOOR_OBJ_TYPE = 0x87;
const MAX_CHAIN_HOPS = 16;

/**
 * Right-hand panel. For records we recognise (currently: Floor.PAK records)
 * we show a typed view plus a quick chain trace; everything else falls back
 * to a hex+ASCII dump.
 */
export class Inspector {

    public constructor(
        private readonly _root:  HTMLElement,
        private readonly _state: AppState
    ) {
        this._state.subscribe(() => { void this._render(); });
        void this._render();
    }

    private async _render(): Promise<void> {
        const sel = this._state.selection;

        if (!sel) {
            this._root.textContent = 'Wähle einen Eintrag.';

            return;
        }

        const c = this._state.containers[sel.containerIdx];

        if (!c) {
            this._root.textContent = '(Container nicht gefunden)';

            return;
        }

        const buf = await Inspector._read(c, sel.recordIdx);

        let body: string;

        if (Inspector._isFloor(c) && buf.byteLength === FloorRecord.SIZE) {
            const rec = FloorRecord.parse(buf);

            body = await Inspector._renderFloor(c.reader, rec);
        } else if (c.kind === 'wlk' && buf.byteLength === WlkSector.SIZE) {
            body = Inspector._renderWlkSector(c, buf) + '\n\n' + Inspector._hexDump(new Uint8Array(buf), 256);
        } else if (c.kind === 'wld') {
            body = Inspector._renderWldSector(c, sel.recordIdx, buf);
        } else {
            body = Inspector._hexDump(new Uint8Array(buf), 256);
        }

        this._root.textContent =
            Inspector._headerFor(c, sel.recordIdx, buf.byteLength) +
            body;
    }

    private static _renderWldSector(c: LoadedWld, idx: number, buf: ArrayBuffer): string {
        const u8      = new Uint8Array(buf);
        const sec     = WldSector.parse(u8);
        const range   = c.reader.getSectorRange(idx);
        const body    = sec.getBody();
        const tail    = sec.getTail();

        // Navigation + terrain + world-flag summary from every cell.
        let blockers = 0, stairs = 0, portals = 0, liquid = 0, raised = 0, shaded = 0;
        let indoor = 0, town = 0, triggers = 0;

        for (let i = 0; i < sec.cellCount(); i++) {
            const cell = sec.getCell(i);

            if (cell.isMovementBlocker()) {blockers++;}
            if (cell.isStairs())          {stairs++;}
            if (cell.isIndoorPortal())    {portals++;}
            if (cell.isLiquidSurface())   {liquid++;}
            if (cell.hasElevation())      {raised++;}
            if (!cell.isFullyBright())    {shaded++;}
            if (cell.isIndoor())          {indoor++;}
            if (cell.isTown())            {town++;}
            if (cell.hasTrigger())        {triggers++;}
        }

        const lines   = [
            'WldSector',
            `  name:         "${sec.getName()}"`,
            `  inflated:     ${sec.getSize().toLocaleString('de-DE')} bytes`,
            `  base-sized:   ${sec.isBaseSized() ? 'yes (94 % case, 131,396 B)' : `no (+${tail.byteLength.toLocaleString('de-DE')} B variable tail)`}`,
            `  compressed:   ${range.length.toLocaleString('de-DE')} bytes @ 0x${range.offset.toString(16)}`,
            `  ratio:        ${(sec.getSize() / range.length).toFixed(1)}×`,
            `  navigation:   ${blockers} blockers · ${stairs} stairs · ${portals} indoor portals · ${liquid} liquid  (of ${sec.cellCount()} cells)`,
            `  terrain:      ${raised} raised · ${shaded} shaded  (corner elevation / baked brightness)`,
            `  world flags:  ${indoor} indoor · ${town} town · ${triggers} trigger`,
            '',
            'Body (first 256B after 32B name block):',
            Inspector._hexDump(body.subarray(0, Math.min(256, body.byteLength)), 256)
        ];

        return lines.join('\n');
    }

    private static _renderWlkSector(c: LoadedWlk, buf: ArrayBuffer): string {
        const s   = WlkSector.parse(buf);
        const row = s.row(c.gridWidth);
        const col = s.col(c.gridWidth);

        const hex = (n: number): string => `0x${(n >>> 0).toString(16)}`;

        return [
            'WlkSector',
            `  gridIndex:  ${s.gridIndex}   →   (row=${row}, col=${col}) in ${c.gridWidth}×${c.gridHeight} grid`,
            `  ordinal:    ${s.ordinal}   (1..${c.sectorCount} sector id; neighbors reference this)`,
            `  neighbors:  ${s.neighborsByDirection().map((n) => `${n.direction} ${n.ordinal}`).join('  ') || '—'}`,
            `  world:      origin (${s.rawX}, ${s.rawY}) → (${s.rawEndX}, ${s.rawEndY})`,
            `  wldx:       offset ${hex(s.compressedOffset)}  size ${s.compressedSize}   · tiles +${hex(s.tilesRelativeOffset)}/${s.tilesSize}B`,
            `  env:        flags ${hex(s.environmentFlags)}  nature ${hex(s.natureType)}  liquid ${s.liquidStyleA}/${s.liquidStyleB}  rev ${s.serverRevisionId}`,
            ''
        ].join('\n');
    }

    private static _isFloor(c: LoadedContainer): c is LoadedContainer & {kind: 'obj'; reader: ObjReader} {
        return c.kind === 'obj' && c.recordType === FLOOR_OBJ_TYPE;
    }

    private static async _read(c: LoadedContainer, idx: number): Promise<ArrayBuffer> {
        switch (c.kind) {
            case 'trg': return c.reader.readEntry(idx);
            case 'obj': return c.reader.readRecord(idx);
            case 'wlk': return c.reader.readSector(idx);
            case 'wld': {
                const u8   = await c.reader.readSector(idx);
                const copy = new ArrayBuffer(u8.byteLength);

                new Uint8Array(copy).set(u8);

                return copy;
            }
        }
    }

    private static _headerFor(c: LoadedContainer, idx: number, len: number): string {
        const isSector = c.kind === 'wlk' || c.kind === 'wld';
        const lines    = [
            `Container: ${c.name}`,
            `${isSector ? 'Sector:   ' : 'Record:   '} #${idx}`,
            `Length:    ${len} bytes`
        ];

        if (c.kind === 'obj') {
            lines.push(`Type:      0x${c.recordType.toString(16).padStart(8, '0')}`);
        }

        lines.push('');

        return lines.join('\n');
    }

    private static async _renderFloor(reader: ObjReader, rec: FloorRecord): Promise<string> {
        const lines = [
            'FloorRecord',
            `  selfIndex:  ${rec.selfIndex}`,
            `  assetId:    0x${rec.assetId.toString(16).padStart(8, '0')} (${rec.assetId})`,
            `  reserved:   ${rec.isReservedUninit() ? '0xCDCDCDCD (uninitialised)' : `0x${rec.reserved.toString(16).padStart(8, '0')}`}`,
            `  nextIndex:  ${rec.isChainTerminator() ? '(end of chain)' : rec.nextIndex}`,
            ''
        ];

        // Walk forward from this record up to MAX_CHAIN_HOPS to give the
        // user a feel for the stack at this position.
        const chain: FloorRecord[] = [rec];
        let cur = rec;

        for (let hop = 0; hop < MAX_CHAIN_HOPS && cur.nextIndex !== 0; hop++) {
            if (cur.nextIndex >= reader.getRecordCount()) {
                break;
            }

            const next = FloorRecord.parse(await reader.readRecord(cur.nextIndex));

            chain.push(next);
            cur = next;
        }

        lines.push(`Chain (${chain.length} record${chain.length === 1 ? '' : 's'}):`);

        for (const r of chain) {
            lines.push(`  #${r.selfIndex.toString().padStart(7)}  asset=0x${r.assetId.toString(16).padStart(8, '0')}  next=${r.nextIndex || '·'}`);
        }

        if (cur.nextIndex !== 0) {
            lines.push(`  … chain continues (next=${cur.nextIndex})`);
        }

        return lines.join('\n');
    }

    private static _hexDump(bytes: Uint8Array, maxBytes: number): string {
        const lines: string[] = [];
        const n               = Math.min(bytes.length, maxBytes);

        for (let i = 0; i < n; i += 16) {
            const chunk = bytes.subarray(i, Math.min(i + 16, n));
            const hex   = Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' ');
            const ascii = Array.from(chunk, (b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');

            lines.push(`${i.toString(16).padStart(6, '0')}  ${hex.padEnd(48)}  ${ascii}`);
        }

        if (bytes.length > maxBytes) {
            lines.push(`… (+${bytes.length - maxBytes} weitere Bytes)`);
        }

        return lines.join('\n');
    }

}