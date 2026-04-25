import {GameMsgType} from './GameMsgType.js';

/**
 * A parsed CUSTOMDATA sub-packet on the GameServer surface.
 *
 * The exact CUSTOMDATA framing of the GameServer has not yet been
 * reverse-engineered (see `work/GameServer.c_split/network/`). As a
 * pragmatic placeholder we treat a sub-packet as `{type, body}`, mirroring
 * the lobby's `SacredPacket` shape. The `parseRaw` helper implements the
 * working-assumption layout:
 *
 *     [type u16 LE] [body ...]
 *
 * Once the real framing (module id, security header, etc.) is known this
 * class gets a full `parse(buf)` / `serialize()` pair identical in spirit
 * to `backend_lobbyserver/src/inc/Packets/SacredPacket.ts`.
 */
export class GameMessage {

    public type: GameMsgType;
    public body: Buffer;

    public constructor(type: GameMsgType, body: Buffer = Buffer.alloc(0)) {
        this.type = type;
        this.body = body;
    }

    /**
     * Provisional decoder — reads the first u16 LE as the type and keeps
     * the remaining bytes as the body. Replace with the real framing as
     * soon as the layout is confirmed.
     */
    public static parseRaw(payload: Buffer): GameMessage {
        if (payload.length < 2) {
            return new GameMessage(GameMsgType.None, Buffer.alloc(0));
        }
        const type = payload.readUInt16LE(0) as GameMsgType;
        const body = payload.length > 2
            ? Buffer.from(payload.subarray(2))
            : Buffer.alloc(0);
        return new GameMessage(type, body);
    }

    /**
     * Provisional encoder — the inverse of `parseRaw`. Replace together
     * with `parseRaw` once the real framing lands.
     */
    public serialize(): Buffer {
        const out = Buffer.alloc(2 + this.body.length);
        out.writeUInt16LE(this.type & 0xFFFF, 0);
        if (this.body.length > 0) {
            this.body.copy(out, 2);
        }
        return out;
    }

}