#!/usr/bin/env python3
"""Stufe 3b.1: channels + server list + public chat.

Two users join channel 1, a game-server joins it too, both users see the
server via SendServerInfo broadcast, can retrieve the server list, and
alice's ReceiveChatMessage is forwarded to bob as SendChatMessage (but
not echoed back to alice).
"""
import struct
import sys

from tincat_client import T, K, TincatClient, build_chat_body, build_server_info_body


def main() -> int:
    alice = TincatClient.handshake_and_login("alice")
    bob = TincatClient.handshake_and_login("bob")
    print(f"  alice={alice.perm_id} bob={bob.perm_id}")

    # alice asks for channels
    alice.send(T["ChannelListRequest"], K["ChannelListRequest"], b"")
    seen = alice.drain_lobby_result()
    chlist = next(b for st, b in seen if st == T["SendChannelList"])
    count = struct.unpack_from("<H", chlist, 0)[0]
    name = chlist[2:2 + 80].rstrip(b"\0").decode("latin1")
    print(f"  channels: {count} -> {name!r}")
    assert count == 1 and name == "General"

    # alice joins, then bob joins
    alice.send(T["ChannelJoinRequest"], K["ChannelJoinRequest"], struct.pack("<H", 1))
    alice.drain_lobby_result()
    bob.send(T["ChannelJoinRequest"], K["ChannelJoinRequest"], struct.pack("<H", 1))
    bob.drain_lobby_result()

    # alice should have been notified about bob joining
    st, body = alice.recv_custom()
    assert st == T["OtherUserJoinedChannel"], f"expected OtherUserJoined, got {st}"
    joiner = body[4:4 + 80].rstrip(b"\0").decode("latin1")
    assert joiner == "bob"
    print(f"  alice saw join: {joiner}")

    # bring up a game-server in channel 1
    srv = TincatClient.handshake()
    srv.send(T["ServerLoginRequest"], K["ServerLoginRequest"],
             build_server_info_body("MyServer", 1))
    srv.drain_lobby_result()

    # alice + bob each see a SendServerInfo broadcast
    for who, c in (("alice", alice), ("bob", bob)):
        st, body = c.recv_custom()
        assert st == T["SendServerInfo"], f"{who}: expected SendServerInfo, got {st}"
        sname = body[0:80].rstrip(b"\0").decode("latin1")
        assert sname == "MyServer"
        print(f"  {who} saw server {sname}")

    # alice asks for the server list (channel 1)
    alice.send(T["ServerListRequest"], K["ServerListRequest"], struct.pack("<i", 1))
    seen = alice.drain_lobby_result()
    entries = [b for st, b in seen if st == T["SendServerInfo"]]
    print(f"  server list entries: {len(entries)}")
    assert len(entries) == 1

    # alice chats; bob receives SendChatMessage, alice does NOT
    alice.send(T["ReceiveChatMessage"], K["ReceiveChatMessage"],
               build_chat_body("alice", alice.perm_id, 0, "hello world"))
    st, body = bob.recv_custom()
    assert st == T["SendChatMessage"], f"bob expected SendChatMessage(31), got {st}"
    text = body[88:88 + 256].rstrip(b"\0").decode("latin1")
    assert text == "hello world"
    alice.drain_lobby_result()  # ack for alice's own message
    late = alice.drain_all_within(0.3)
    assert not late, f"alice unexpectedly received: {late}"
    print("  alice did not self-receive")

    print("ALL ASSERTIONS PASSED")
    alice.close()
    bob.close()
    srv.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())