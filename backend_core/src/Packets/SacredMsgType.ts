/**
 * Sub-message types carried inside CUSTOMDATA Tincat packets.
 *
 * These are the "SacredMsgType" values from the Sacred Gold lobby protocol.
 * Numeric values and names cross-referenced against the C# reference
 * implementation at https://github.com/kryotek777/Sacred-Gold-LobbyServer
 * (src/Types/SacredMsgType.cs) which matches what the original game client
 * sends on the wire.
 *
 * Each CUSTOMDATA payload starts with:
 *   u16  moduleId    = 9910
 *   i16  subType     = one of the values below
 *   u16  securityHdr.type          (redundant copy of subType)
 *   u32  securityHdr.securityKey   (per-type constant, see SacredPacketMeta)
 *   i32  securityHdr.length        (14 + body.length)
 *   u32  securityHdr.checksum      (written as 0, not validated)
 *   ...  body                      (layout per subType, not decoded here)
 */
export enum SacredMsgType {
    ClientRegistrationRequest = 1,
    ClientLoginRequest = 2,
    PrivateInfoRequest = 3,
    ReceivePrivateInfo = 4,
    SendPrivateInfo = 5,
    PublicInfoRequest = 6,
    ReceivePublicInfo = 7,
    SendPublicInfo = 8,
    PublicDataRequest = 9,
    ReceivePublicData = 10,
    SendPublicData = 11,
    ServerLoginRequest = 12,
    ServerChangePublicInfo = 13,
    ServerLogout = 14,
    LobbyResult = 15,
    ClientLoginResult = 16,
    ClientCharacterSelect = 17,
    ReceiveClientPublicDataFromServer = 18,
    ServerRequestsClientsPublicData = 19,
    ServerListRequest = 20,
    SendServerInfo = 21,
    RemoveServer = 22,
    ChannelListRequest = 23,
    SendChannelList = 24,
    ChannelJoinRequest = 25,
    UserJoinChannel = 26,
    ChannelLeaveRequest = 27,
    OtherUserJoinedChannel = 28,
    OtherUserLeftChannel = 29,
    ReceiveChatMessage = 30,
    SendChatMessage = 31,
    ReceivePrivateChatMessage = 32,
    SendPrivateChatMessage = 33,
    Kick = 34,
    Alarm = 35,
    FindUserRequest = 36,
    FoundUser = 37,
    ServerLoginResult = 38,
    ClosedNetNewCharacter = 39,
    Reserved1 = 40,
    Reserved2 = 41,
    Reserved3 = 42,
    Reserved4 = 43,
    Reserved5 = 44,
    UserJoinedServer = 45,
    UserLeftServer = 46,
    UserKickedFromServer = 47,
    ClientImportantMessage = 48,
    ServerImportantMessage = 49,
    ServerShutdown = 50,
    AddFriend = 51,
    RemoveFriend = 52,
    AddedToFriends = 53,
    UpdateFriendStatus = 54,
    MessageOfTheDayRequest = 55,
    SendMessageOfTheDay = 56
}