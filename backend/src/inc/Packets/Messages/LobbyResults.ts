/**
 * Status codes returned by the lobby in `LobbyResult` and `ClientLoginResult`
 * packets. Mirrors `LobbyResults.cs` in the Sacred Gold reference; the
 * trailing comment on each line is the in-game message the client displays.
 */
export enum LobbyResults {
    Ok = 0,
    WrongVersion = 1,
    ChangePrivateInfoFailed = 2,
    ChangePrivateInfoSuccess = 3,
    ChangePublicInfoFailed = 4,
    ChangePublicInfoSuccess = 5,
    InvalidSacredCDKey = 6,
    InvalidPassword = 7,
    ErrorUnknownUser = 8,
    ErrorUsernameExists = 9,
    ErrorUserAlreadyOnline = 10,
    ChangePublicDataFailed = 11,
    ChangePublicDataSuccess = 12,
    ErrorInvalidBlockRequested = 13,
    InternalError = 14,
    GameLoginNotAllowed = 15,
    GameUpdateNotAllowed = 16,
    GameRemoveNotAllowed = 17,
    InvalidBlockSelected = 18,
    ErrorJoiningChannel = 19,
    ErrorServerFull = 20,
    ErrorAccountInactive = 21,
    ErrorSacredCDKeyInUse = 22,
    GSR_RESERVED1 = 23,
    GSR_RESERVED2 = 24,
    GSR_RESERVED3 = 25,
    GSR_RESERVED4 = 26,
    GSR_RESERVED5 = 27,
    ErrorUserNotFound = 28,
    ErrorSenderNotFound = 29,
    ErrorUserBanned = 30,
    ErrorBackconnectFailed = 31,
    ErrorNotAGame = 32,
    ErrorInvalidAddonCDKey = 33,
    ErrorAddonCDKeyInUse = 34
}