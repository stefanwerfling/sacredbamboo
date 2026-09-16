/**
 * DOM helpers. Keeps id-lookup-with-null-check off the global scope.
 */
export class Dom {

    public static byId<T extends HTMLElement>(id: string): T {
        const el = document.getElementById(id);

        if (!el) {
            throw new Error(`#${id} not found`);
        }

        return el as T;
    }

}