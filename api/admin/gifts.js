/**
 * /api/admin/gifts
 * GET  -> list all gift rows (admin + staff)
 * POST -> create a new empty row with a freshly generated access code
 *         (admin + staff) — this is how new frames get provisioned
 *         before printing their QR code.
 */
const crypto = require('crypto');
const { sql } = require('../_lib/db');
const { requireSession } = require('../_lib/auth');

// 4 chars, uppercase letters + digits, excluding 0 and O (too easy to
// confuse when read off a printed frame or typed by hand).
const CODE_CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
const CODE_LENGTH = 4;

function generateAccessCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    }
    return code;
}

module.exports = async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    if (req.method === 'GET') {
        const rows = await sql`
            SELECT id, access_code, groom_name, bride_name, wedding_date::text AS wedding_date, filled_at, created_at
            FROM gifts
            ORDER BY created_at DESC
        `;
        res.status(200).json({ gifts: rows });
        return;
    }

    if (req.method === 'POST') {
        let code = generateAccessCode();
        // Extremely unlikely to collide, but guard against it anyway.
        for (let attempts = 0; attempts < 5; attempts++) {
            const existing = await sql`SELECT 1 FROM gifts WHERE access_code = ${code}`;
            if (existing.length === 0) break;
            code = generateAccessCode();
        }

        const rows = await sql`
            INSERT INTO gifts (access_code)
            VALUES (${code})
            RETURNING id, access_code, groom_name, bride_name, wedding_date::text AS wedding_date, filled_at, created_at
        `;
        res.status(201).json({ gift: rows[0] });
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
