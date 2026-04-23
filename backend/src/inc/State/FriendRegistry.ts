/**
 * In-memory friend/buddy directory.
 *
 * A friendship is stored as a directed edge `owner -> friend`: when
 * `alice` adds `bob` as a friend, `owner=alice.permId` points to
 * `bob.permId`. The reverse index (`_watchers`) lets us cheaply answer
 * "who has alice as a friend?" when alice logs in/out so we can
 * broadcast UpdateFriendStatus to just those users.
 *
 * A MariaDB-backed implementation can replace this in Stufe 3b.5 without
 * touching the handlers — they only use `add`, `remove`, `getFriendsOf`
 * and `getWatchersOf`.
 */
export class FriendRegistry {

    /** owner permId -> set of friend permIds. */
    private _friends: Map<number, Set<number>> = new Map();

    /** friend permId -> set of owner permIds (reverse / watchers). */
    private _watchers: Map<number, Set<number>> = new Map();

    public add(ownerPermId: number, friendPermId: number): boolean {
        if (ownerPermId === friendPermId) {
            return false;
        }
        let friends = this._friends.get(ownerPermId);
        if (!friends) {
            friends = new Set();
            this._friends.set(ownerPermId, friends);
        }
        if (friends.has(friendPermId)) {
            return false;
        }
        friends.add(friendPermId);

        let watchers = this._watchers.get(friendPermId);
        if (!watchers) {
            watchers = new Set();
            this._watchers.set(friendPermId, watchers);
        }
        watchers.add(ownerPermId);
        return true;
    }

    public remove(ownerPermId: number, friendPermId: number): boolean {
        const friends = this._friends.get(ownerPermId);
        const had = friends?.delete(friendPermId) ?? false;
        this._watchers.get(friendPermId)?.delete(ownerPermId);
        return had;
    }

    public getFriendsOf(ownerPermId: number): number[] {
        return Array.from(this._friends.get(ownerPermId) ?? []);
    }

    public getWatchersOf(friendPermId: number): number[] {
        return Array.from(this._watchers.get(friendPermId) ?? []);
    }

}