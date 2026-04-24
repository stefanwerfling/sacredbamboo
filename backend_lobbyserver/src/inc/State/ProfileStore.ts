/**
 * Tiny in-memory store for per-account profile bits that don't live in
 * the Account record. Right now that's just the mail address from
 * PrivateInfoMessage. A MariaDB-backed variant can replace this later
 * (Stufe 3b.5 already has the repository split in place).
 */
export interface ProfileData {
    mail: string;
}

export class ProfileStore {

    private _profiles: Map<number, ProfileData> = new Map();

    public get(permId: number): ProfileData {
        return this._profiles.get(permId) ?? {mail: ''};
    }

    public set(permId: number, data: ProfileData): void {
        this._profiles.set(permId, {...data});
    }

    public setMail(permId: number, mail: string): void {
        const existing = this._profiles.get(permId) ?? {mail: ''};
        existing.mail = mail;
        this._profiles.set(permId, existing);
    }

}