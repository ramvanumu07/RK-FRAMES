/**
 * /api/admin/users — admin-only management of admin/staff accounts.
 * GET  -> list users (without password hashes)
 * POST -> create a new user { email, password, role }
 */
const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { requireSession } = require('../_lib/auth');

module.exports = async (req, res) => {
    const session = requireSession(req, res, { role: 'admin' });
    if (!session) return;

    if (req.method === 'GET') {
        const rows = await sql`SELECT id, email, role, created_at FROM users ORDER BY created_at ASC`;
        res.status(200).json({ users: rows });
        return;
    }

    if (req.method === 'POST') {
        const { email, password, role } = req.body || {};
        if (!email || !password || !['admin', 'staff'].includes(role)) {
            res.status(400).json({ error: 'email, password and a valid role are required' });
            return;
        }
        const passwordHash = await bcrypt.hash(password, 10);
        try {
            const rows = await sql`
                INSERT INTO users (email, password_hash, role)
                VALUES (${email}, ${passwordHash}, ${role})
                RETURNING id, email, role, created_at
            `;
            res.status(201).json({ user: rows[0] });
        } catch (err) {
            if (String(err.message).includes('duplicate key')) {
                res.status(409).json({ error: 'A user with that email already exists' });
                return;
            }
            throw err;
        }
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
