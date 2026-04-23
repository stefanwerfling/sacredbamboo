#!/usr/bin/env python3
"""Stufe 3b.4a: PrivateInfo round-trip + mail update + PublicInfo lookup."""
import struct
import sys

from tincat_client import T, K, TincatClient


def main() -> int:
    alice = TincatClient.handshake_and_login("alice_profile")
    bob = TincatClient.handshake_and_login("bob_profile")

    # (1) Initial PrivateInfoRequest -> empty mail
    alice.send(T["PrivateInfoRequest"], K["PrivateInfoRequest"], b"")
    seen = alice.drain_lobby_result()
    body = next(b for st, b in seen if st == T["SendPrivateInfo"])
    mail = body[32:32 + 80].rstrip(b"\0").decode("latin1")
    print(f"(1) initial mail: {mail!r}")
    assert mail == ""

    # (2) Update mail via ReceivePrivateInfo
    priv = bytearray(112)
    mail_bytes = b"alice@example.com"
    priv[32:32 + len(mail_bytes)] = mail_bytes
    alice.send(T["ReceivePrivateInfo"], K["ReceivePrivateInfo"], bytes(priv))
    seen = alice.drain_lobby_result()
    code = struct.unpack_from("<i", seen[-1][1], 0)[0]
    # ChangePrivateInfoSuccess = 3
    assert code == 3
    print(f"(2) mail update ack: code={code}")

    # (3) Re-request to confirm persistence (RAM-level)
    alice.send(T["PrivateInfoRequest"], K["PrivateInfoRequest"], b"")
    seen = alice.drain_lobby_result()
    body = next(b for st, b in seen if st == T["SendPrivateInfo"])
    mail = body[32:32 + 80].rstrip(b"\0").decode("latin1")
    assert mail == "alice@example.com"
    print(f"(3) mail after update: {mail!r}")

    # (4) PublicInfoRequest for bob
    alice.send(T["PublicInfoRequest"], K["PublicInfoRequest"], struct.pack("<i", bob.perm_id))
    seen = alice.drain_lobby_result()
    body = next(b for st, b in seen if st == T["SendPublicInfo"])
    perm = struct.unpack_from("<i", body, 0)[0]
    name = body[4:4 + 80].rstrip(b"\0").decode("latin1")
    print(f"(4) PublicInfo: permId={perm} username={name!r}")
    assert perm == bob.perm_id and name == "bob_profile"

    print("ALL ASSERTIONS PASSED")
    alice.close()
    bob.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())