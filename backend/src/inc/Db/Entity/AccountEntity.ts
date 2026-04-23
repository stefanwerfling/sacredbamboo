import {DBBaseEntityId} from 'figtree';
import {Column, Entity, Index} from 'typeorm';

/**
 * typeorm entity backing the persistent Account store. `DBBaseEntityId`
 * provides the auto-incremented `id` which we also surface as the
 * client-facing `permId` — no need for a separate column.
 *
 * Passwords are stored as-is for Stufe 3b.5 (matches Stufe 3a/3b behavior
 * of plain-text match). A bcrypt-hash migration is a separate pass and
 * doesn't block persistence work.
 */
@Entity({name: 'sacred_account'})
export class AccountEntity extends DBBaseEntityId {

    @Index({unique: true})
    @Column({length: 80})
    public username!: string;

    @Column({length: 64})
    public password!: string;

}