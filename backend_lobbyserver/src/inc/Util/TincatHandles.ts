/**
 * Well-known values for the `from` and `to` fields in the 28-byte Tincat V2
 * header.
 *
 * These are the magic IDs used by `tincat2.dll` to address the parties in a
 * Tincat session. The client uses them verbatim in a `LOGMEON` before it has
 * been assigned a real connection ID by the server.
 *
 * Observed in `sub_10004380` (KRNL_SendLogonRequest), `sub_10005660`
 * (KRNL_LogClientOn), `sub_100057D0` (KRNL_LogClientOff) and
 * `sub_10003C10` (CUSTOMDATA dispatcher) of the decompiled tincat2.dll.
 */
export class TincatHandles {

    /** The sending client before it has a real connection id. */
    public static readonly CLIENT_ME = 0xEFFFFFEE | 0;

    /** The server/lobby endpoint. */
    public static readonly SERVER = 0xEFFFFFCC | 0;

    /** Broadcast destination ("USR_ALL"). */
    public static readonly BROADCAST = 0xEFFFFFDD | 0;

}