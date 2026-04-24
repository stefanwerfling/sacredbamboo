import {sacredConfig} from '../Config/SacredBambooConfig.js';

/**
 * Shared username/password validation used by both the Tincat-layer
 * registration handler and the HTTP register endpoint. Keeping the
 * rules in one place avoids the two paths drifting.
 *
 * Returns `null` when acceptable, otherwise a human-readable reason.
 */
export function validateRegistrationInput(username: string, password: string): string | null {
    if (username.length === 0 || password.length === 0) {
        return 'username and password must not be empty';
    }
    if (username.length > 80) {
        return 'username too long (max 80)';
    }
    if (password.length > 64) {
        return 'password too long (max 64)';
    }
    const pattern = sacredConfig().get()?.lobby?.allowedUsernameRegex ?? '';
    if (pattern !== '') {
        let re: RegExp;
        try {
            re = new RegExp(pattern);
        } catch {
            // Misconfigured regex → don't block registrations silently;
            // fall through to accept. The caller logs the decision.
            return null;
        }
        if (!re.test(username)) {
            return `username does not match allowed pattern /${pattern}/`;
        }
    }
    return null;
}