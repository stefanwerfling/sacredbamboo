import {ServerInfoMessage} from 'sacredbamboo-core';
import {SacredClient} from '../Client/SacredClient.js';
/**
 * Live directory of GameServer clients that have successfully logged in.
 *
 * A GameServer sends a `ServerLoginRequest` first; we stash its
 * `ServerInfoMessage` here keyed by the assigned `serverId`
 * (= connection id). Players querying via `ServerListRequest` read from
 * the same store. Cleanup on disconnect is the caller's responsibility
 * (SacredClient's socket close hook) — this keeps the registry agnostic
 * of the TCP lifecycle.
 */
export class ServerRegistry {

    private _servers: Map<number, {client: SacredClient; info: ServerInfoMessage}> = new Map();

    public register(serverId: number, client: SacredClient, info: ServerInfoMessage): void {
        this._servers.set(serverId, {client, info});
    }

    public remove(serverId: number): ServerInfoMessage | null {
        const entry = this._servers.get(serverId);
        if (!entry) {
            return null;
        }
        this._servers.delete(serverId);
        return entry.info;
    }

    public get(serverId: number): ServerInfoMessage | null {
        return this._servers.get(serverId)?.info ?? null;
    }

    public update(serverId: number, info: ServerInfoMessage): boolean {
        const entry = this._servers.get(serverId);
        if (!entry) {
            return false;
        }
        entry.info = info;
        return true;
    }

    /** Returns servers registered in the given channel. */
    public listByChannel(channelId: number): ServerInfoMessage[] {
        const out: ServerInfoMessage[] = [];
        for (const {info} of this._servers.values()) {
            if (info.channelId === channelId) {
                out.push(info);
            }
        }
        return out;
    }

}