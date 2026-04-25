import {ClientType} from 'sacredbamboo-core';
import {SacredClient} from '../Client/SacredClient.js';
import {ChannelInfo} from './ChannelInfo.js';

/**
 * Single source of truth for channel membership. Owns:
 *   - the static list of available channels (configured at boot),
 *   - live per-channel sets of currently joined SacredClients.
 *
 * Counts (UserCount / GameCount) aren't persisted; they're derived from
 * the membership sets on demand so any channel-list render matches
 * reality. `leave()` is idempotent — it's fine to call when the client
 * isn't in the channel (disconnect cleanup path).
 */
export class ChannelRegistry {

    private _channels: Map<number, ChannelInfo> = new Map();
    private _members: Map<number, Set<SacredClient>> = new Map();

    public constructor(channels: ChannelInfo[]) {
        for (const ch of channels) {
            this._channels.set(ch.id, ch);
            this._members.set(ch.id, new Set());
        }
    }

    public getAll(): ChannelInfo[] {
        return Array.from(this._channels.values());
    }

    public get(id: number): ChannelInfo | null {
        return this._channels.get(id) ?? null;
    }

    public getMembers(channelId: number): Set<SacredClient> {
        return this._members.get(channelId) ?? new Set();
    }

    public join(channelId: number, client: SacredClient): boolean {
        const set = this._members.get(channelId);
        if (!set) {
            return false;
        }
        set.add(client);
        return true;
    }

    public leave(channelId: number, client: SacredClient): void {
        this._members.get(channelId)?.delete(client);
    }

    /**
     * Total clients in a channel, optionally filtered by role. Used to
     * populate the `UserCount` / `GameCount` fields in SendChannelList.
     */
    public count(channelId: number, role?: ClientType): number {
        const set = this._members.get(channelId);
        if (!set) {
            return 0;
        }
        if (role === undefined) {
            return set.size;
        }
        let n = 0;
        for (const c of set) {
            if (c.getType() === role) {
                n++;
            }
        }
        return n;
    }

}