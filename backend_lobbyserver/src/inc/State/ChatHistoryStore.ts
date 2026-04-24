/**
 * Per-channel ring buffer of recent chat messages.
 *
 * The broadcast path (`ReceiveChatMessageHandler`) pushes each delivered
 * chat onto the buffer; the join path (`ChannelJoinRequestHandler`)
 * replays the buffer to the joining client so people don't walk into a
 * silent room. Mirrors `ChatHistoryLimit` in kryotek777's reference.
 *
 * Limit of 0 disables history entirely (no push, no replay).
 */
export interface ChatHistoryEntry {
    senderName: string;
    senderPermId: number;
    text: string;
    timestamp: number;
}

export class ChatHistoryStore {

    private _byChannel: Map<number, ChatHistoryEntry[]> = new Map();
    private _limit: number;

    public constructor(limit: number) {
        this._limit = Math.max(0, limit | 0);
    }

    public push(channelId: number, entry: ChatHistoryEntry): void {
        if (this._limit === 0) {
            return;
        }
        let buf = this._byChannel.get(channelId);
        if (buf === undefined) {
            buf = [];
            this._byChannel.set(channelId, buf);
        }
        buf.push(entry);
        if (buf.length > this._limit) {
            buf.splice(0, buf.length - this._limit);
        }
    }

    public get(channelId: number): ChatHistoryEntry[] {
        return this._byChannel.get(channelId)?.slice() ?? [];
    }

    public clear(channelId: number): void {
        this._byChannel.delete(channelId);
    }

}