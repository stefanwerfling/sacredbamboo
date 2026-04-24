#!/usr/bin/env python3
"""Stufe 2 smoke: CUSTOMDATA sub-header parse + dispatch.

Since Stufe 2 ships no concrete handlers, this test proves the parsing
path: a valid ClientLoginRequest lands (no response since no handler
existed back then, now it DOES respond — see the adjusted assertion);
an invalid securityKey drops the connection.
"""
import socket
import sys

from tincat_client import (CLIENT_ME, SERVER, TINCAT_CUSTOMDATA, T, K,
                            TincatClient, tincat_header, sacred,
                            build_login_body)


def main() -> int:
    # (a) well-formed ClientLoginRequest — in 3a+ the handler answers,
    #     so we just verify the round-trip completes.
    c = TincatClient.handshake_and_login("alice_stufe2")
    print(f"  (a) valid login round-trip ok, permId={c.perm_id}")
    c.close()

    # (b) malformed CUSTOMDATA (wrong securityKey) drops the connection
    c = TincatClient.handshake()
    # first get a valid logged-in client so the session state is right
    c.send(T["ClientLoginRequest"], K["ClientLoginRequest"], build_login_body("bob_stufe2"))
    c.drain_lobby_result()

    # now send a ClientLoginRequest with a wrong key — server should close
    bad = sacred(T["ClientLoginRequest"], 0xDEADBEEF, b"\x00" * (176 - 14))
    c.s.sendall(tincat_header(TINCAT_CUSTOMDATA, CLIENT_ME, SERVER, bad))
    c.s.sendall(bad)
    c.s.settimeout(1.0)
    try:
        r = c.s.recv(1)
    except (socket.timeout, TimeoutError):
        raise AssertionError("expected close, but socket is still alive")
    assert r == b"", f"expected close, got {r!r}"
    print("  (b) wrong securityKey -> server closed connection")
    c.close()

    print("ALL ASSERTIONS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())