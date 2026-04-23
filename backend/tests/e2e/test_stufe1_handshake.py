#!/usr/bin/env python3
"""Stufe 1 smoke: LOGMEON -> LOGONACCEPTED.

Validates the whole Tincat wire layer in one round-trip: header serialize,
CRC-32 (init=0, no final XOR), two-write send path, 52-byte connection
packet with sub-magic, connId allocation, echoed username.
"""
import socket
import struct
import sys

from tincat_client import (MAGIC, CLIENT_ME, SERVER, TINCAT_LOGMEON,
                            tincat_header, logmeon_payload, recv_frame, crc)


def main() -> int:
    s = socket.create_connection(("127.0.0.1", 7066), timeout=3)
    s.settimeout(3)
    try:
        payload = logmeon_payload("user", "")
        s.sendall(tincat_header(TINCAT_LOGMEON, CLIENT_ME, SERVER, payload))
        s.sendall(payload)

        mtype, body = recv_frame(s)
        assert mtype == 5, f"expected LOGONACCEPTED(5), got {mtype}"
        assert len(body) == 52, f"expected 52-byte body, got {len(body)}"

        sub_magic = struct.unpack_from("<I", body, 0)[0]
        conn_id = struct.unpack_from("<i", body, 4)[0]
        user_echoed = body[8:40].rstrip(b"\x00").decode("ascii")
        pass_echoed = body[40:48].rstrip(b"\x00").decode("ascii")

        assert sub_magic == MAGIC, f"bad sub-magic 0x{sub_magic:08x}"
        assert user_echoed == "user"
        assert pass_echoed == "-"        # matches sub_10005660 KRNL_LogClientOn
        assert conn_id > 0

        print(f"LOGONACCEPTED ok: connId={conn_id} user={user_echoed!r}")
        print("ALL ASSERTIONS PASSED")
        return 0
    finally:
        s.close()


if __name__ == "__main__":
    sys.exit(main())