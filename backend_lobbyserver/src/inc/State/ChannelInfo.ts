/**
 * One entry of the lobby's channel list. Counts (`userCount`, `gameCount`)
 * are NOT stored here — the ChannelRegistry derives them from its live
 * membership state at serialize time, so they can't drift.
 */
export interface ChannelInfo {
    readonly id: number;
    readonly name: string;
    readonly flags: number;
    readonly authorizedOnly: boolean;
}