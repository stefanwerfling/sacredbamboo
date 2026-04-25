/**
 * State machine for the GameServer's outbound uplink to the Lobby.
 *
 *   Disconnected            no socket; reconnect-timer may be pending
 *   Connecting              TCP `net.connect()` in flight
 *   AwaitingLogonAccepted   LOGMEON sent, waiting for tincat LOGONACCEPTED
 *   AwaitingServerLogin     LOGONACCEPTED received, ServerLoginRequest sent,
 *                           waiting for ServerLoginResult AND LobbyResult(Ok)
 *   Established             both lobby acks received; uplink is live
 */
export enum LobbyUplinkState {
    Disconnected,
    Connecting,
    AwaitingLogonAccepted,
    AwaitingServerLogin,
    Established
}