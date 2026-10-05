/**
 * Auth helpers shared by the admin API routes.
 * Sessions are a signed JWT stored in an httpOnly cookie (not readable
 * by client-side JS), so the admin page never handles raw credentials
 * after login. Cookie serialization is hand-rolled (a handful of lines)
 * to avoid depending on a third-party package's exact API shape.
 */
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
}

function signSession(user) {
    return jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: SESSION_MAX_AGE_SECONDS }
    );
}

function setSessionCookie(res, token) {
    const attrs = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ];
    if (process.env.NODE_ENV === 'production') attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
    const attrs = [
        `${COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0',
    ];
    if (process.env.NODE_ENV === 'production') attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
}

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        out[key] = decodeURIComponent(value);
    }
    return out;
}

/**
 * Reads and verifies the session cookie from an incoming request.
 * Returns the decoded { sub, email, role } payload, or null if missing/invalid.
 */
function getSession(req) {
    try {
        const parsed = parseCookies(req.headers.cookie);
        const token = parsed[COOKIE_NAME];
        if (!token) return null;
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
}


/**
 * Guards an admin API handler. Responds 401 if there's no valid session,
 * or 403 if a role is required and the session doesn't have it.
 */
function requireSession(req, res, { role } = {}) {
    const session = getSession(req);
    if (!session) {
        res.status(401).json({ error: 'Not authenticated' });
        return null;
    }
    if (role && session.role !== role) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return null;
    }
    return session;
}

module.exports = {
    signSession,
    setSessionCookie,
    clearSessionCookie,
    getSession,
    requireSession,
};
