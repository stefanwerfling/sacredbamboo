/**
 * Live character-block store. Sacred stores character data (profile,
 * savegame blocks, cheater counter, …) per (permId, blockId). Each block
 * can be up to 131 KB, so we keep them as `Buffer` references, not
 * copies, and let the handler decide how much to send back.
 *
 * Selected-character per account is kept in a small parallel map; it
 * surfaces through `ClientCharacterSelect` and is read by the (future)
 * UserJoinedServer flow that needs the picked character's name.
 */
export class CharacterStore {

    private _blocks: Map<number, Map<number, Buffer>> = new Map();
    private _selected: Map<number, number> = new Map();

    public setBlock(permId: number, blockId: number, data: Buffer): void {
        let perUser = this._blocks.get(permId);
        if (!perUser) {
            perUser = new Map();
            this._blocks.set(permId, perUser);
        }
        perUser.set(blockId, Buffer.from(data));
    }

    public getBlock(permId: number, blockId: number): Buffer | null {
        return this._blocks.get(permId)?.get(blockId) ?? null;
    }

    public setSelected(permId: number, blockId: number): void {
        this._selected.set(permId, blockId);
    }

    public getSelected(permId: number): number | null {
        return this._selected.get(permId) ?? null;
    }

}