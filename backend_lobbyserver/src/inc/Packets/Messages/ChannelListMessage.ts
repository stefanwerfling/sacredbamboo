import {Win1252} from 'sacredbamboo-core';
import {ChannelInfo} from '../../State/ChannelInfo.js';
/**
 * Body of SendChannelList (24). Fixed-size payload even when fewer
 * channels are present — the client reads `count` entries from a
 * pre-sized array of 128 `ChannelInfoData` records (91 bytes each).
 *
 *   +0    u16  Count
 *   +2    ChannelInfoData[128]   each 91 bytes:
 *     +0    char Name[80]
 *     +80   u8   AuthorizedOnly
 *     +81   u32  Flags
 *     +85   u16  Id
 *     +87   u16  UserCount
 *     +89   u16  GameCount
 *
 * Total: 2 + 128*91 = 11650. Meta length 11664 = 14 + 11650 (dynamic).
 *
 * To keep things self-contained this class takes a full rendering shape
 * (`ChannelInfoWithCounts`) so the registry can inject the live user /
 * game counts when it builds the response.
 */
export interface ChannelInfoWithCounts extends ChannelInfo {
    readonly userCount: number;
    readonly gameCount: number;
}

export class ChannelListMessage {

    public static readonly CHANNEL_MAX = 128;
    public static readonly ENTRY_SIZE = 91;
    public static readonly BODY_SIZE = 2 + ChannelListMessage.CHANNEL_MAX * ChannelListMessage.ENTRY_SIZE;

    public channels: ChannelInfoWithCounts[];

    public constructor(channels: ChannelInfoWithCounts[] = []) {
        this.channels = channels;
    }

    public static parse(body: Buffer): ChannelListMessage {
        const count = Math.min(body.readUInt16LE(0), ChannelListMessage.CHANNEL_MAX);
        const out: ChannelInfoWithCounts[] = [];
        for (let i = 0; i < count; i++) {
            const base = 2 + i * ChannelListMessage.ENTRY_SIZE;
            out.push({
                name: Win1252.readString(body, base + 0, 80),
                authorizedOnly: body[base + 80] !== 0,
                flags: body.readUInt32LE(base + 81),
                id: body.readUInt16LE(base + 85),
                userCount: body.readUInt16LE(base + 87),
                gameCount: body.readUInt16LE(base + 89)
            });
        }
        return new ChannelListMessage(out);
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ChannelListMessage.BODY_SIZE);
        const count = Math.min(this.channels.length, ChannelListMessage.CHANNEL_MAX);
        buf.writeUInt16LE(count, 0);
        for (let i = 0; i < count; i++) {
            const ch = this.channels[i];
            const base = 2 + i * ChannelListMessage.ENTRY_SIZE;
            Win1252.writeString(buf, base + 0, 80, ch.name);
            buf[base + 80] = ch.authorizedOnly ? 1 : 0;
            buf.writeUInt32LE((ch.flags >>> 0), base + 81);
            buf.writeUInt16LE(ch.id & 0xFFFF, base + 85);
            buf.writeUInt16LE(ch.userCount & 0xFFFF, base + 87);
            buf.writeUInt16LE(ch.gameCount & 0xFFFF, base + 89);
        }
        return buf;
    }

}