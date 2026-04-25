/**
 * GameServer CUSTOMDATA sub-packet types.
 *
 * Placeholder enum: the concrete values need to be extracted from
 * `work/GameServer.c_split/network/*` in a later step. For now we only
 * enumerate the `None = 0` sentinel so the framing code compiles and the
 * dispatcher can log "no handler for type 0x...".
 */
export enum GameMsgType {
    None = 0
}