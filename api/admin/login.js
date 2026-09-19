/**
 * POST /api/admin/login
 * Body: { email, password }
 * Verifies credentials against the users table and sets an httpOnly
 * session cookie on success.
 */
const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signSession, setSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { email, password } = req.body || {};
    if (!email || !password) {
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
    setSessionCookie(res, token);
    res.status(200).json({ success: true, email: user.email, role: user.role });
};
