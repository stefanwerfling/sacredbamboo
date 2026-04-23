/**
 * Tincat V2 packet types.
 *
 * Values and semantics are from the `msg_type` field at offset 12 of the
 * 28-byte Tincat V2 header. Cross-referenced with:
 *   - `sub_10003A90` (KRNL_SendSingleMessage) — the only place that writes
 *     msg_type, its third-to-last argument is the type numeric.
 *   - `sub_10004380` passes 3  (LOGMEON).
 *   - `sub_10005660` passes 5  (LOGONACCEPTED).
 *   - `sub_100057D0` passes 6  (LOGOFFACCEPTED).
 *   - `sub_10004080` passes 11 (STAYINGALIVE, "SendAliveMessage").
 *   - `sub_10003B20/10003C10` pass 2 (CUSTOMDATA, "SendSingleMessage").
 *   - Value 4 (LOGMEOFF) is the client-initiated counterpart of 6.
 *   - Value 1 (TIMESYNC) is observed in `sub_10003A90`'s type switch but the
 *     sender was not fully reverse-engineered yet.
 */
export enum TincatPacketTypes {
    None = 0,
    TIMESYNC = 1,
    CUSTOMDATA = 2,
    LOGMEON = 3,
    LOGMEOFF = 4,
    LOGONACCEPTED = 5,
    LOGOFFACCEPTED = 6,
    STAYINGALIVE = 11
}