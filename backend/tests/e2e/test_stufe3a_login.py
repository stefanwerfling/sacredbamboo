#!/usr/bin/env python3
"""Stufe 3a smoke: full LOGMEON + ClientLoginRequest + MOTD flow."""
import struct
import sys

from tincat_client import T, K, TincatClient


def main() -> int:
    c = TincatClient.handshake_and_login("alice_3a")
    print(f"(a) alice logged in permId={c.perm_id}")

    # LobbyResult ack already drained inside handshake_and_login; next
    # exercise the MOTD round-trip.
    motd_req = bytearray(130)
    struct.pack_into("<H", motd_req, 0, 0xABCD)  # id
    c.send(T["MessageOfTheDayRequest"], K["MessageOfTheDayRequest"], bytes(motd_req))
    seen = c.drain_lobby_result()
    code, action = struct.unpack("<ii", seen[-1][1])
    print(f"(b) MotdRequest ack: code={code} action={action}")
    assert code == 0 and action == T["MessageOfTheDayRequest"]

    print("ALL ASSERTIONS PASSED")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())