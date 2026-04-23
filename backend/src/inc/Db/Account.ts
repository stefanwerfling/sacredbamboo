/**
 * Minimal account record as used by the lobby's login flow. Keeping it as
 * a plain data interface means either the in-memory repo or a later
 * typeorm-backed repo (via figtree's MariaDBService + DBBaseEntityId) can
 * surface the same shape without a heavy domain type.
 */
export interface Account {
    username: string;
    password: string;
    permId: number;
}