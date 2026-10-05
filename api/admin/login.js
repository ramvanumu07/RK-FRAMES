/**
 * POST /api/admin/login
 * Body: { email, password }
 * Verifies credentials against the users table and sets an httpOnly
 * session cookie on success.
 */
const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signSession, setSessionCookie } = require('../_lib/auth');
const attempts = new Map();

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const address = req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    for (const [key, record] of attempts) if (record.until < now) attempts.delete(key);
    const record = attempts.get(address) || { count: 0, until: now + 15 * 60 * 1000 };
    if (record.count >= 20 || attempts.size > 1000) return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    record.count++;
    attempts.set(address, record);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || password.length > 200) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
    }

    const rows = await sql`SELECT id, email, password_hash, role FROM users WHERE email = ${email}`;
    if (rows.length === 0) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
    }

    const token = signSession(user);
    attempts.delete(address);
    setSessionCookie(res, token);
    res.status(200).json({ success: true, email: user.email, role: user.role });
};
