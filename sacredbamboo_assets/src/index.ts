/**
 * Public surface of `sacredbamboo-assets`.
 *
 * Pure asset I/O for Sacred Gold's on-disk formats. No network, no figtree,
 * no Node-specific APIs — runs in the browser editor and (later) in the
 * gameserver alike.
 *
 * Layout intent:
 *   - Util         random-access abstraction (Node FileHandle / browser File)
 *   - Pak          PAK-family header + generic container reader
 *   - Containers   specialised readers (TRG today; OBJ/WLD/WLK to come)
 */

// Util
export type {IRandomAccess} from './Util/IRandomAccess.js';
export {BufferRandomAccess, FileRandomAccess} from './Util/IRandomAccess.js';

// Pak
export {PakEntry, PakHeader, PakHeaderParseError} from './Pak/PakHeader.js';
export {PakReader} from './Pak/PakReader.js';

// Containers
export {TrgReader} from './Containers/TrgReader.js';
export {ObjReader} from './Containers/ObjReader.js';
export {WlkHeader, WlkReader} from './Containers/WlkReader.js';
export {WldHeader, WldReader} from './Containers/WldReader.js';
export {IsoTilesReader} from './Containers/IsoTilesReader.js';
export {TexReader} from './Containers/TexReader.js';
export type {TexImageInfo} from './Containers/TexReader.js';
export {MixedReader} from './Containers/MixedReader.js';

// Records — typed views over the bytes ObjReader/TrgReader/WlkReader hand out
export {FloorRecord}  from './Records/FloorRecord.js';
export {StaticRecord} from './Records/StaticRecord.js';
export {WlkSector}   from './Records/WlkSector.js';
export {WldSector}   from './Records/WldSector.js';
export {WldCell}     from './Records/WldCell.js';
export {IsoTile}     from './Records/IsoTile.js';
export {TexImage}    from './Records/TexImage.js';
export {MixDef}      from './Records/MixDef.js';
export type {MixFrame} from './Records/MixDef.js';