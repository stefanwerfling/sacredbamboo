/**
 * Reasons the lobby attaches to a UserKickedFromServer notification.
 * Mirrors KickReasons.cs in the Sacred Gold reference.
 */
export enum KickReasons {
    NotInLobby = 0,
    WrongDataBlock = 1,
    UnknownUser = 2,
    InternalError = 3,
    AlreadyInGame = 4,
    AlreadyInLobby = 5,
    CustomReason = 6
}