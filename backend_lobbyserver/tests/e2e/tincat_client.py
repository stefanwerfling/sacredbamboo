"""Shared helpers for the Python E2E scripts.

Mirrors the lobby's wire layer so each test file can stay small:
- Tincat V2 header framing (28 byte header + payload)
- CUSTOMDATA sub-packet encoding (moduleId + subType + 14-byte security header + body)
- CRC-32 with init=0 / no final XOR (distinct from zlib's default)
- Tincat password/CD-key obfuscation (stateful XOR against key "Sacred", init=63)
- Body builders for the packet types the tests need most often
- `TincatClient` wraps a socket with handshake/login/send/recv helpers
"""
import socket
import struct

# ---------------------------------------------------------------------------
# Wire constants

HOST = "127.0.0.1"
PORT = 7066
MAGIC = 0xDABAFBEF
CLIENT_ME = 0xEFFFFFEE
SERVER = 0xEFFFFFCC
BROADCAST = 0xEFFFFFDD
MODULE_ID = 9910

# TincatPacketTypes
TINCAT_LOGMEON = 3
TINCAT_CUSTOMDATA = 2

# SacredMsgType
T = {
    "ClientRegistrationRequest": 1,
    "ClientLoginRequest": 2,
    "PrivateInfoRequest": 3,
    "ReceivePrivateInfo": 4,
    "SendPrivateInfo": 5,
    "PublicInfoRequest": 6,
    "ReceivePublicInfo": 7,
    "SendPublicInfo": 8,
    "PublicDataRequest": 9,
    "ReceivePublicData": 10,
    "SendPublicData": 11,
    "ServerLoginRequest": 12,
    "ServerChangePublicInfo": 13,
    "ServerLogout": 14,
    "LobbyResult": 15,
    "ClientLoginResult": 16,
    "ClientCharacterSelect": 17,
    "ReceiveClientPublicDataFromServer": 18,
    "ServerRequestsClientsPublicData": 19,
    "ServerListRequest": 20,
    "SendServerInfo": 21,
    "RemoveServer": 22,
    "ChannelListRequest": 23,
    "SendChannelList": 24,
    "ChannelJoinRequest": 25,
    "UserJoinChannel": 26,
    "ChannelLeaveRequest": 27,
    "OtherUserJoinedChannel": 28,
    "OtherUserLeftChannel": 29,
    "ReceiveChatMessage": 30,
    "SendChatMessage": 31,
    "ReceivePrivateChatMessage": 32,
    "SendPrivateChatMessage": 33,
    "Kick": 34,
    "Alarm": 35,
    "FindUserRequest": 36,
    "FoundUser": 37,
    "ServerLoginResult": 38,
    "ClosedNetNewCharacter": 39,
    "UserJoinedServer": 45,
    "UserLeftServer": 46,
    "UserKickedFromServer": 47,
    "ClientImportantMessage": 48,
    "ServerImportantMessage": 49,
    "ServerShutdown": 50,
    "AddFriend": 51,
    "RemoveFriend": 52,
    "AddedToFriends": 53,
    "UpdateFriendStatus": 54,
    "MessageOfTheDayRequest": 55,
    "SendMessageOfTheDay": 56,
}

# Per-sub-type security keys (the `SACRED_PACKET_META` equivalent — only
# the types used by at least one test are listed).
K = {
    "ClientRegistrationRequest": 0xDDCCBB01,
    "ClientLoginRequest": 0xDDCCBB02,
    "PrivateInfoRequest": 0xDDCCBB03,
    "ReceivePrivateInfo": 0xDDCCBB04,
    "PublicInfoRequest": 0xDDCCBB06,
    "PublicDataRequest": 0xDDCCBB09,
    "ReceivePublicData": 0xDDCCBB10,
    "ServerLoginRequest": 0xDDCCBB12,
    "ServerListRequest": 0xDDCCBB1A,
    "ChannelListRequest": 0xDDCCBB1D,
    "ChannelJoinRequest": 0xDDCCBB1F,
    "ChannelLeaveRequest": 0xDDCCBB21,
    "ReceiveChatMessage": 0xDDCCBB24,
    "ReceivePrivateChatMessage": 0xDDCCBB26,
    "Alarm": 0xDDCCBB29,
    "FindUserRequest": 0xDDCCBB2A,
    "ClosedNetNewCharacter": 0xDDCCBB2D,
    "UserJoinedServer": 0xDDCCBB2E,
    "UserLeftServer": 0xDDCCBB2F,
    "ClientCharacterSelect": 0xDDCCBB17,
    "AddFriend": 0xDDCCBB34,
    "RemoveFriend": 0xDDCCBB35,
    "MessageOfTheDayRequest": 0xDDCCBB38,
}

# ---------------------------------------------------------------------------
# CRC-32 (init=0, no final XOR — matches tincat2.dll's sub_1000EA10)

_CRC_TABLE = None


def _crc_table():
    global _CRC_TABLE
    if _CRC_TABLE is None:
        tab = [0] * 256
        for i in range(256):
            c = i
            for _ in range(8):
                c = (0xEDB88320 ^ (c >> 1)) if (c & 1) else (c >> 1)
            tab[i] = c
        _CRC_TABLE = tab
    return _CRC_TABLE


def crc(data: bytes) -> int:
    tab = _crc_table()
    c = 0
    for b in data:
        c = tab[(c ^ b) & 0xFF] ^ (c >> 8)
    return c & 0xFFFFFFFF


# ---------------------------------------------------------------------------
# Low-level frame builders

def tincat_header(mtype: int, frm: int, to: int, payload: bytes) -> bytes:
    """Build the 28-byte Tincat V2 header for the given payload."""
    return struct.pack(
        "<IIIiiiI",
        MAGIC,
        frm & 0xFFFFFFFF,
        to & 0xFFFFFFFF,
        mtype,
        0,
        len(payload),
        crc(payload),
    )


def logmeon_payload(user: str = "user", password: str = "") -> bytes:
    """52-byte connection-control body for the initial LOGMEON handshake."""
    p = bytearray(52)
    struct.pack_into("<I", p, 0, MAGIC)
    u = user.encode("latin1")[:31]
    p[8:8 + len(u)] = u
    pw = password.encode("latin1")[:7]
    p[40:40 + len(pw)] = pw
    struct.pack_into("<I", p, 48, 1)  # flags
    return bytes(p)


def sacred(sub_type: int, key: int, body: bytes) -> bytes:
    """Build a CUSTOMDATA payload: [moduleId u16][subType i16][securityHdr 14][body]."""
    b = bytearray(18 + len(body))
    struct.pack_into("<H", b, 0, MODULE_ID)
    struct.pack_into("<h", b, 2, sub_type)
    struct.pack_into("<H", b, 4, sub_type & 0xFFFF)
    struct.pack_into("<I", b, 6, key & 0xFFFFFFFF)
    struct.pack_into("<i", b, 10, 14 + len(body))
    struct.pack_into("<I", b, 14, 0)  # checksum (server ignores it)
    b[18:] = body
    return bytes(b)


# ---------------------------------------------------------------------------
# Tincat string obfuscation (for LoginMessage/RegistrationMessage)

def tincat_encrypt(text: bytes, length: int) -> bytes:
    """Encrypt `text` into a `length`-byte buffer using the Sacred XOR scheme."""
    key = b"Sacred"
    out = bytearray(length)
    num = 63
    for i in range(length):
        ch = text[i] if i < len(text) else 0
        out[i] = ((ch + i + num) ^ key[i % 6]) & 0xFF
        num = ch
    return bytes(out)


# ---------------------------------------------------------------------------
# Body builders (the ones used by most tests)

def build_login_body(username: str, password: str = "") -> bytes:
    """ClientLoginRequest body (162 bytes)."""
    b = bytearray(162)
    u = username.encode("latin1")[:79]
    b[0:len(u)] = u
    b[80:112] = tincat_encrypt(password.encode("latin1"), 32)
    b[112:133] = tincat_encrypt(b"", 21)
    b[141:162] = tincat_encrypt(b"", 21)
    return bytes(b)


def build_registration_body(username: str, password: str, mail: str = "") -> bytes:
    """ClientRegistrationRequest body (242 bytes)."""
    b = bytearray(242)
    u = username.encode("latin1")[:79]
    b[0:len(u)] = u
    b[80:112] = tincat_encrypt(password.encode("latin1"), 32)
    b[112:133] = tincat_encrypt(b"", 21)
    m = mail.encode("latin1")[:79]
    b[133:133 + len(m)] = m
    b[221:242] = tincat_encrypt(b"", 21)
    return bytes(b)


def build_server_info_body(name: str, channel_id: int,
                           player_count: int = 0, player_max: int = 16,
                           flags: int = 0) -> bytes:
    """ServerLoginRequest / ServerInfo body (116 bytes)."""
    b = bytearray(116)
    n = name.encode("latin1")[:79]
    b[0:len(n)] = n
    struct.pack_into("<I", b, 88, 7066)  # port
    struct.pack_into("<h", b, 92, player_count)
    struct.pack_into("<h", b, 94, player_max)
    struct.pack_into("<i", b, 96, flags)
    struct.pack_into("<i", b, 104, 1)   # networkVersion
    struct.pack_into("<i", b, 108, 2)   # clientGameVersion
    struct.pack_into("<i", b, 112, channel_id)
    return bytes(b)


def build_chat_body(sender: str, sender_perm: int, dest_perm: int, text: str) -> bytes:
    """ChatMessage body (344 bytes) — also used for ReceivePrivateChatMessage."""
    b = bytearray(344)
    n = sender.encode("latin1")[:79]
    b[0:len(n)] = n
    struct.pack_into("<i", b, 80, sender_perm)
    struct.pack_into("<i", b, 84, dest_perm)
    t = text.encode("latin1")[:255]
    b[88:88 + len(t)] = t
    return bytes(b)


# ---------------------------------------------------------------------------
# Socket plumbing

def recv_exact(s: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            raise RuntimeError(f"closed after {len(buf)}/{n}")
        buf += chunk
    return bytes(buf)


def recv_frame(s: socket.socket):
    """Read one Tincat frame: returns (msg_type, payload)."""
    hdr = recv_exact(s, 28)
    magic, frm, to_, mtype, _u, psize, cksum = struct.unpack("<IIIiiiI", hdr)
    if magic != MAGIC:
        raise RuntimeError(f"bad outer magic 0x{magic:08x}")
    body = recv_exact(s, psize) if psize > 0 else b""
    if crc(body) != cksum:
        raise RuntimeError("tincat CRC mismatch")
    return mtype, body


def recv_custom(s: socket.socket):
    """Read one CUSTOMDATA sub-packet: returns (sub_type, body)."""
    mt, body = recv_frame(s)
    if mt != TINCAT_CUSTOMDATA:
        raise RuntimeError(f"expected CUSTOMDATA, got {mt}")
    sub_type = struct.unpack_from("<h", body, 2)[0]
    hlen = struct.unpack_from("<i", body, 10)[0]
    return sub_type, body[18:18 + hlen - 14]


# ---------------------------------------------------------------------------
# High-level client

class TincatClient:
    """Convenience wrapper around a connected socket.

    Typical usage:
        c = TincatClient.handshake_and_login("alice")
        c.send("AddFriend", K["AddFriend"], struct.pack("<ii", c.perm_id, other))
        c.drain_lobby_result()
        ...
    """

    def __init__(self, sock: socket.socket):
        self.s = sock
        self.perm_id = 0
        self.s.settimeout(3)

    @classmethod
    def handshake(cls, host: str = HOST, port: int = PORT,
                  tincat_user: str = "user", tincat_pw: str = "") -> "TincatClient":
        s = socket.create_connection((host, port), timeout=3)
        c = cls(s)
        p = logmeon_payload(tincat_user, tincat_pw)
        s.sendall(tincat_header(TINCAT_LOGMEON, CLIENT_ME, SERVER, p))
        s.sendall(p)
        recv_frame(s)  # LOGONACCEPTED
        return c

    @classmethod
    def handshake_and_login(cls, username: str, password: str = "",
                            host: str = HOST, port: int = PORT) -> "TincatClient":
        c = cls.handshake(host, port)
        c.send(T["ClientLoginRequest"], K["ClientLoginRequest"],
               build_login_body(username, password))
        seen = c.drain_lobby_result()
        res = next(b for st, b in seen if st == T["ClientLoginResult"])
        result_code = struct.unpack_from("<i", res, 0)[0]
        if result_code != 0:
            raise RuntimeError(f"login failed: result={result_code}")
        c.perm_id = struct.unpack_from("<i", res, 8)[0]
        return c

    def send(self, sub_type: int, key: int, body: bytes) -> None:
        pkt = sacred(sub_type, key, body)
        self.s.sendall(tincat_header(TINCAT_CUSTOMDATA, CLIENT_ME, SERVER, pkt))
        self.s.sendall(pkt)

    def recv_custom(self):
        return recv_custom(self.s)

    def drain_lobby_result(self, timeout: float = 3):
        """Consume CUSTOMDATA packets until (and including) the next LobbyResult."""
        self.s.settimeout(timeout)
        seen = []
        while True:
            st, body = recv_custom(self.s)
            seen.append((st, body))
            if st == T["LobbyResult"]:
                return seen

    def drain_all_within(self, dur: float = 0.5):
        """Collect any CUSTOMDATA packets that arrive within `dur` seconds."""
        self.s.settimeout(dur)
        seen = []
        try:
            while True:
                seen.append(recv_custom(self.s))
        except (socket.timeout, TimeoutError):
            return seen

    def close(self) -> None:
        self.s.close()