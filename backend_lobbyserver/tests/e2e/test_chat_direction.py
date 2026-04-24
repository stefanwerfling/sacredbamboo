#!/usr/bin/env python3
"""Regression guard for the chat-direction fix.

Sacred Gold convention (matches current code):
  client -> ReceiveChatMessage (30)
  server -> SendChatMessage    (31)

If someone inverts the handlers again this test catches it: alice sends
type 30, the only correct response bob can receive is type 31.
"""
import struct
import sys

from tincat_client import T, K, TincatClient, build_chat_body


def main() -> int:
    alice = TincatClient.handshake_and_login("alice_dir")
    bob = TincatClient.handshake_and_login("bob_dir")

    # Both join channel 1
    for c in (alice, bob):
        c.send(T["ChannelJoinRequest"], K["ChannelJoinRequest"], struct.pack("<H", 1))
        c.drain_lobby_result()
    alice.drain_all_within(0.3)  # swallow OtherUserJoined
    bob.drain_all_within(0.3)    # swallow channel-join chat history replay

    # Alice sends ReceiveChatMessage (30), bob should get SendChatMessage (31)
    alice.send(T["ReceiveChatMessage"], K["ReceiveChatMessage"],
               build_chat_body("alice_dir", alice.perm_id, 0, "chat direction fixed"))
    st, body = bob.recv_custom()
    assert st == T["SendChatMessage"], f"expected SendChatMessage(31), got {st}"
    text = body[88:88 + 256].rstrip(b"\0").decode("latin1")
    print(f"bob received type={st}: {text!r}")
    assert text == "chat direction fixed"

    print("CHAT DIRECTION OK")
    alice.close()
    bob.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())