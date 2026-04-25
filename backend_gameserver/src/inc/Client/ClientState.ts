/**
 * Session state of a single Tincat connection held by a GameClient.
 * Mirrors the lobby-side enum — the tincat handshake is identical, so
 * we track the same three states.
 */
export enum ClientState {
    Connected,
    LoggedIn,
    LoggedOff
}