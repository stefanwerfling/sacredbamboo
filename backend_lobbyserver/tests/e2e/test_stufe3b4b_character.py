#!/usr/bin/env python3
"""Stufe 3b.4b: character block upload/download round-trip + permId
spoofing rejection + character selection."""
import struct
import sys

from tincat_client import T, K, TincatClient


def _build_pubdata(permid, blockid, data):
    # 18-byte prefix + 131072-byte fixed Data
    body = bytearray(18 + 131072)
    struct.pack_into("<i", body, 0, permid)
    struct.pack_into("<h", body, 4, blockid)
    struct.pack_into("<i", body, 6, len(data))   # size
    struct.pack_into("<i", body, 10, 0)          # offset
    struct.pack_into("<i", body, 14, len(data))  # length
    body[18:18 + len(data)] = data
    return bytes(body)


def _build_pubdata_req(permid, blockid, offset=0, length=0):
    return struct.pack("<ihii", permid, blockid, offset, length)


def main() -> int:
    alice = TincatClient.handshake_and_login("alice_char")
    bob = TincatClient.handshake_and_login("bob_char")

    # (1) Upload 256 bytes to alice's block 10
    payload = bytes(range(256))
    alice.send(T["ReceivePublicData"], K["ReceivePublicData"],
               _build_pubdata(alice.perm_id, 10, payload))
    seen = alice.drain_lobby_result()
    code = struct.unpack_from("<i", seen[-1][1], 0)[0]
    # ChangePublicDataSuccess = 12
    assert code == 12
    print(f"(1) upload: result={code}")

    # (2) Read back
    alice.send(T["PublicDataRequest"], K["PublicDataRequest"],
               _build_pubdata_req(alice.perm_id, 10, 0, 256))
    seen = alice.drain_lobby_result()
    pd = next(b for st, b in seen if st == T["SendPublicData"])
    length = struct.unpack_from("<i", pd, 14)[0]
    data = pd[18:18 + length]
    assert length == 256 and data == payload
    print(f"(2) read back length={length}")

    # (3) PermId spoofing should be rejected
    alice.send(T["ReceivePublicData"], K["ReceivePublicData"],
               _build_pubdata(bob.perm_id, 10, b"ohai"))
    seen = alice.drain_lobby_result()
    code = struct.unpack_from("<i", seen[-1][1], 0)[0]
    # ChangePublicDataFailed = 11
    assert code == 11, f"expected 11, got {code}"
    print(f"(3) spoofed upload rejected: code={code}")

    # (4) Select block 10
    alice.send(T["ClientCharacterSelect"], K["ClientCharacterSelect"],
               struct.pack("<H", 10))
    seen = alice.drain_lobby_result()
    code = struct.unpack_from("<i", seen[-1][1], 0)[0]
    assert code == 0
    print(f"(4) character select: code={code}")

    print("ALL ASSERTIONS PASSED")
    alice.close()
    bob.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())