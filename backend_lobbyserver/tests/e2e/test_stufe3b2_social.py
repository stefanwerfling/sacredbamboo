#!/usr/bin/env python3
"""Stufe 3b.2: registration + friends + private chat + find-user +
friend-status-on-disconnect broadcast.
"""
import struct
import sys

from tincat_client import (T, K, TincatClient,
                            build_chat_body, build_registration_body)


def main() -> int:
    # (1) Registration
    c = TincatClient.handshake()
    c.send(T["ClientRegistrationRequest"], K["ClientRegistrationRequest"],
           build_registration_body("alice_social", "secret"))
    seen = c.drain_lobby_result()
    reg_code = struct.unpack_from("<i", seen[-1][1], 0)[0]
    print(f"(1) register: result={reg_code}")
    assert reg_code == 0
    c.close()

    # (2) Login with correct password
    alice = TincatClient.handshake_and_login("alice_social", "secret")
    print(f"(2) alice permId={alice.perm_id}")

    # (3) Bob logs in anonymously (unknown user -> grant)
    bob = TincatClient.handshake_and_login("bob_social")
    print(f"(3) bob permId={bob.perm_id}")

    # (4) Find bob
    name = bytearray(80)
    name[0:3] = b"bob_social"[0:3]  # partial; we use full anyway below
    full = b"bob_social"
    fu = bytearray(80)
    fu[0:len(full)] = full
    alice.send(T["FindUserRequest"], K["FindUserRequest"], bytes(fu))
    seen = alice.drain_lobby_result()
    found = next(b for st, b in seen if st == T["FoundUser"])
    fperm = struct.unpack_from("<i", found, 88)[0]
    fname = found[8:8 + 80].rstrip(b"\0").decode("latin1")
    print(f"(4) FindUser: name={fname!r} permId={fperm}")
    assert fperm == bob.perm_id and fname == "bob_social"

    # (5) Alice adds bob as friend
    alice.send(T["AddFriend"], K["AddFriend"],
               struct.pack("<ii", alice.perm_id, bob.perm_id))
    seen = alice.drain_lobby_result()
    # Alice also gets initial UpdateFriendStatus for bob
    assert any(st == T["UpdateFriendStatus"] for st, _ in seen)
    # Bob gets AddedToFriends
    st, body = bob.recv_custom()
    assert st == T["AddedToFriends"]
    adder = body[8:8 + 80].rstrip(b"\0").decode("latin1")
    print(f"(5) bob got AddedToFriends from: {adder}")
    assert adder == "alice_social"

    # (6) Alice sends private chat to bob
    # Chat direction convention (post-fix):
    #   client -> ReceivePrivateChatMessage (32)
    #   server -> SendPrivateChatMessage    (33) to recipient
    alice.send(T["ReceivePrivateChatMessage"], K["ReceivePrivateChatMessage"],
               build_chat_body("alice_social", alice.perm_id, bob.perm_id, "hi bob"))
    st, body = bob.recv_custom()
    assert st == T["SendPrivateChatMessage"], f"expected 33, got {st}"
    text = body[88:88 + 256].rstrip(b"\0").decode("latin1")
    assert text == "hi bob"
    alice.drain_lobby_result()
    print("(6) private chat delivered")

    # (7) Bob disconnects -> alice gets UpdateFriendStatus(Offline)
    bob.close()
    st, body = alice.recv_custom()
    assert st == T["UpdateFriendStatus"]
    status = struct.unpack_from("<i", body, 4)[0]
    fperm = struct.unpack_from("<i", body, 88)[0]
    print(f"(7) UpdateFriendStatus: status={status} friend={fperm}")
    assert status == 0 and fperm == bob.perm_id

    print("ALL ASSERTIONS PASSED")
    alice.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())