#!/usr/bin/env python3
"""Stufe 3b.3: Alarm, UserJoinedServer broadcast (system chat fan-out),
UserLeftServer ack, ClosedNetNewCharacter ack."""
import struct
import sys

from tincat_client import (T, K, TincatClient,
                            build_server_info_body)


def main() -> int:
    alice = TincatClient.handshake_and_login("alice_admin")
    bob = TincatClient.handshake_and_login("bob_admin")

    # join channel 1
    for c in (alice, bob):
        c.send(T["ChannelJoinRequest"], K["ChannelJoinRequest"], struct.pack("<H", 1))
        c.drain_lobby_result()
    # alice sees OtherUserJoined for bob; drain
    alice.drain_all_within(0.3)
    print(f"(a) alice={alice.perm_id} bob={bob.perm_id} in channel")

    # (b) Alarm
    alice.send(T["Alarm"], K["Alarm"], b"")
    seen = alice.drain_lobby_result()
    code = struct.unpack_from("<i", seen[-1][1], 0)[0]
    assert code == 0
    print("(b) Alarm -> ack Ok")

    # (c) game-server joins channel 1
    srv = TincatClient.handshake()
    srv.send(T["ServerLoginRequest"], K["ServerLoginRequest"],
             build_server_info_body("GameSrv", 1))
    srv.drain_lobby_result()
    alice.drain_all_within(0.3)
    bob.drain_all_within(0.3)
    print("(c) game-server online")

    # (d) UserJoinedServer -> system chat broadcast
    body = struct.pack("<ihH", alice.perm_id, 1, 0)
    srv.send(T["UserJoinedServer"], K["UserJoinedServer"], body)
    srv.drain_lobby_result()

    # alice + bob each should receive a SendChatMessage with empty sender
    found_system = {"alice": False, "bob": False}
    for who, c in (("alice", alice), ("bob", bob)):
        for st, body in c.drain_all_within(0.5):
            if st != T["SendChatMessage"]:
                continue
            sender = body[0:80].rstrip(b"\0").decode("latin1")
            text = body[88:88 + 256].rstrip(b"\0").decode("latin1")
            if sender == "" and "joined" in text:
                found_system[who] = True
                print(f"  {who} system msg: {text!r}")
                break
    assert all(found_system.values()), f"system broadcast missing: {found_system}"

    # (e) UserLeftServer
    srv.send(T["UserLeftServer"], K["UserLeftServer"], struct.pack("<i", alice.perm_id))
    seen = srv.drain_lobby_result()
    assert struct.unpack_from("<i", seen[-1][1], 0)[0] == 0
    print("(e) UserLeftServer -> ack Ok")

    # (f) ClosedNetNewCharacter
    alice.send(T["ClosedNetNewCharacter"], K["ClosedNetNewCharacter"],
               struct.pack("<hh", 1, 7))
    seen = alice.drain_lobby_result()
    assert struct.unpack_from("<i", seen[-1][1], 0)[0] == 0
    print("(f) ClosedNetNewCharacter -> ack Ok")

    print("ALL ASSERTIONS PASSED")
    alice.close()
    bob.close()
    srv.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())