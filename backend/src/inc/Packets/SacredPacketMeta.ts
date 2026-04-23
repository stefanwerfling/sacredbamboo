import {ClientType} from '../Client/ClientType.js';
import {SacredMsgType} from './SacredMsgType.js';

/**
 * Which client roles are allowed to SEND a given sub-packet. Bitmask so a
 * type can be issued by both regular users and game-servers.
 */
export enum AllowedClients {
    None = 0,
    Unknown = 1 << 0,
    User = 1 << 1,
    Server = 1 << 2
}

export interface SacredPacketMetaEntry {
    /** Expected byte length from the start of the security header to end of body (= 14 + body.length). */
    readonly length: number;
    /** Constant that the client sends in the security header; a mismatch is rejected. */
    readonly securityKey: number;
    /** Packet has a variable-length body — the length check is skipped. */
    readonly dynamicSize: boolean;
    /** Bitmask of client roles that are allowed to initiate this packet. */
    readonly allowedClients: AllowedClients;
}

/**
 * Security-/length-/role-metadata per sub-message type.
 *
 * Values mirror the `PacketDictionary` in the Sacred Gold reference at
 * src/Types/PacketSecurityData.cs. Reserved* entries carry a zero key —
 * they are placeholders the client can still address but that have no
 * meaningful handler.
 */
export const SACRED_PACKET_META: ReadonlyMap<SacredMsgType, SacredPacketMetaEntry> = new Map([
    [SacredMsgType.ClientRegistrationRequest,          {length:    256, securityKey: 0xDDCCBB01, dynamicSize: false, allowedClients: AllowedClients.Unknown}],
    [SacredMsgType.ClientLoginRequest,                 {length:    176, securityKey: 0xDDCCBB02, dynamicSize: false, allowedClients: AllowedClients.Unknown}],
    [SacredMsgType.PrivateInfoRequest,                 {length:     14, securityKey: 0xDDCCBB03, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.ReceivePrivateInfo,                 {length:    126, securityKey: 0xDDCCBB04, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.SendPrivateInfo,                    {length:    126, securityKey: 0xDDCCBB05, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.PublicInfoRequest,                  {length:     18, securityKey: 0xDDCCBB06, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.ReceivePublicInfo,                  {length:     98, securityKey: 0xDDCCBB07, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.SendPublicInfo,                     {length:     98, securityKey: 0xDDCCBB08, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.PublicDataRequest,                  {length:     28, securityKey: 0xDDCCBB09, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.ReceivePublicData,                  {length: 131104, securityKey: 0xDDCCBB10, dynamicSize: true,  allowedClients: AllowedClients.User}],
    [SacredMsgType.SendPublicData,                     {length: 131104, securityKey: 0xDDCCBB11, dynamicSize: true,  allowedClients: AllowedClients.None}],
    [SacredMsgType.ServerLoginRequest,                 {length:    130, securityKey: 0xDDCCBB12, dynamicSize: false, allowedClients: AllowedClients.Unknown}],
    [SacredMsgType.ServerChangePublicInfo,             {length:    130, securityKey: 0xDDCCBB13, dynamicSize: false, allowedClients: AllowedClients.Server}],
    [SacredMsgType.ServerLogout,                       {length:    130, securityKey: 0xDDCCBB14, dynamicSize: false, allowedClients: AllowedClients.Server}],
    [SacredMsgType.LobbyResult,                        {length:     22, securityKey: 0xDDCCBB15, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ClientLoginResult,                  {length:    282, securityKey: 0xDDCCBB16, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ClientCharacterSelect,              {length:     16, securityKey: 0xDDCCBB17, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.ReceiveClientPublicDataFromServer,  {length: 131104, securityKey: 0xDDCCBB18, dynamicSize: true,  allowedClients: AllowedClients.Server}],
    [SacredMsgType.ServerRequestsClientsPublicData,    {length:     28, securityKey: 0xDDCCBB19, dynamicSize: false, allowedClients: AllowedClients.Server}],
    [SacredMsgType.ServerListRequest,                  {length:     18, securityKey: 0xDDCCBB1A, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.SendServerInfo,                     {length:    130, securityKey: 0xDDCCBB1B, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.RemoveServer,                       {length:    130, securityKey: 0xDDCCBB1C, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ChannelListRequest,                 {length:     14, securityKey: 0xDDCCBB1D, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.SendChannelList,                    {length:  11664, securityKey: 0xDDCCBB1E, dynamicSize: true,  allowedClients: AllowedClients.None}],
    [SacredMsgType.ChannelJoinRequest,                 {length:     16, securityKey: 0xDDCCBB1F, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.UserJoinChannel,                    {length:     16, securityKey: 0xDDCCBB20, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ChannelLeaveRequest,                {length:     14, securityKey: 0xDDCCBB21, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.OtherUserJoinedChannel,             {length:     98, securityKey: 0xDDCCBB22, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.OtherUserLeftChannel,               {length:     98, securityKey: 0xDDCCBB23, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ReceiveChatMessage,                 {length:    358, securityKey: 0xDDCCBB24, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.SendChatMessage,                    {length:    358, securityKey: 0xDDCCBB25, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ReceivePrivateChatMessage,          {length:    358, securityKey: 0xDDCCBB26, dynamicSize: false, allowedClients: AllowedClients.User | AllowedClients.Server}],
    [SacredMsgType.SendPrivateChatMessage,             {length:    358, securityKey: 0xDDCCBB27, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.Kick,                               {length:    270, securityKey: 0xDDCCBB28, dynamicSize: false, allowedClients: AllowedClients.None}],
    // Length 14 = security-header-only (EmptyMessage). The C# reference
    // dictionary has a typo "Length: 0" for Alarm that is inconsistent
    // with every other EmptyMessage entry (all Length: 14) — we align
    // with the wire convention, not the typo.
    [SacredMsgType.Alarm,                              {length:     14, securityKey: 0xDDCCBB29, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.FindUserRequest,                    {length:     94, securityKey: 0xDDCCBB2A, dynamicSize: false, allowedClients: AllowedClients.User | AllowedClients.Server}],
    [SacredMsgType.FoundUser,                          {length:    274, securityKey: 0xDDCCBB2B, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ServerLoginResult,                  {length:     18, securityKey: 0xDDCCBB2C, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ClosedNetNewCharacter,              {length:     18, securityKey: 0xDDCCBB2D, dynamicSize: false, allowedClients: AllowedClients.User}],
    [SacredMsgType.Reserved1,                          {length:      0, securityKey: 0x00000000, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.Reserved2,                          {length:      0, securityKey: 0x00000000, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.Reserved3,                          {length:      0, securityKey: 0x00000000, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.Reserved4,                          {length:      0, securityKey: 0x00000000, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.Reserved5,                          {length:      0, securityKey: 0x00000000, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.UserJoinedServer,                   {length:     22, securityKey: 0xDDCCBB2E, dynamicSize: false, allowedClients: AllowedClients.Server}],
    [SacredMsgType.UserLeftServer,                     {length:     18, securityKey: 0xDDCCBB2F, dynamicSize: false, allowedClients: AllowedClients.Server}],
    [SacredMsgType.UserKickedFromServer,               {length:    278, securityKey: 0xDDCCBB30, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ClientImportantMessage,             {length:    275, securityKey: 0xDDCCBB31, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ServerImportantMessage,             {length:    275, securityKey: 0xDDCCBB32, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.ServerShutdown,                     {length:    270, securityKey: 0xDDCCBB33, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.AddFriend,                          {length:     22, securityKey: 0xDDCCBB34, dynamicSize: false, allowedClients: AllowedClients.User | AllowedClients.Server}],
    [SacredMsgType.RemoveFriend,                       {length:     22, securityKey: 0xDDCCBB35, dynamicSize: false, allowedClients: AllowedClients.User | AllowedClients.Server}],
    [SacredMsgType.AddedToFriends,                     {length:    102, securityKey: 0xDDCCBB36, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.UpdateFriendStatus,                 {length:    274, securityKey: 0xDDCCBB37, dynamicSize: false, allowedClients: AllowedClients.None}],
    [SacredMsgType.MessageOfTheDayRequest,             {length:    144, securityKey: 0xDDCCBB38, dynamicSize: false, allowedClients: AllowedClients.User | AllowedClients.Server}],
    [SacredMsgType.SendMessageOfTheDay,                {length: 131218, securityKey: 0xDDCCBB39, dynamicSize: true,  allowedClients: AllowedClients.None}]
]);

/**
 * Map a SacredClient's `ClientType` to the bitmask the metadata table uses.
 * Needed because `ClientType` is an ordinary enum while `AllowedClients`
 * is a flags enum.
 */
export function clientTypeToFlag(type: ClientType): AllowedClients {
    switch (type) {
        case ClientType.GameClient: return AllowedClients.User;
        case ClientType.GameServer: return AllowedClients.Server;
        case ClientType.Unknown:
        default:
            return AllowedClients.Unknown;
    }
}