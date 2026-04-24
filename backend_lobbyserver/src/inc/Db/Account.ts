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
    nick?: string;
    clan?: string;
    email?: string;
    createdAt?: Date;
}

/**
 * Optional extended fields a caller may provide at create/update time.
 * All fields are independently optional — missing keys leave the stored
 * value untouched.
 */
export interface AccountProfile {
    nick?: string;
    clan?: string;
    email?: string;
}