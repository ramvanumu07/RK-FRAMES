/**
 * /api/admin/gifts
 * GET  -> list all gift rows (admin + staff)
 * POST -> create a new empty row with a freshly generated access code
 *         (admin + staff) — this is how new frames get provisioned
 *         before printing their QR code.
 */
const { sql } = require('../_lib/db');
const { requireSession } = require('../_lib/auth');
const { generateCodes } = require('../_lib/codes');

module.exports = async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    if (req.method === 'GET') {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query?.page, 10) || 1));
        const offset = (page - 1) * 50;
        const search = `%${String(req.query?.search || '').trim().slice(0, 100)}%`;
        const status = ['filled', 'empty'].includes(req.query?.status) ? req.query.status : 'all';
        const rows = await sql`
            SELECT id, access_code, groom_name, bride_name, wedding_date::text AS wedding_date, filled_at, created_at, batch_id, frame_number, public_url
            FROM gifts
            WHERE (access_code ILIKE ${search} OR groom_name ILIKE ${search} OR bride_name ILIKE ${search})
                AND (${status} = 'all' OR (${status} = 'filled' AND filled_at IS NOT NULL) OR (${status} = 'empty' AND filled_at IS NULL))
            ORDER BY id DESC LIMIT 50 OFFSET ${offset}
        `;
        const [counts] = await sql`SELECT count(*)::integer AS total, count(filled_at)::integer AS filled FROM gifts`;
        res.status(200).json({ gifts: rows, counts, page, hasMore: rows.length === 50 });
        return;
    }

    if (req.method === 'POST') {
        if (session.role !== 'admin') return res.status(403).json({ error: 'Only admins can provision frames' });
        for (let attempt = 0; attempt < 5; attempt++) {
            const [code] = generateCodes(1);
            const rows = await sql`
            INSERT INTO gifts (access_code)
            VALUES (${code})
            ON CONFLICT (access_code) DO NOTHING
            RETURNING id, access_code, groom_name, bride_name, wedding_date::text AS wedding_date, filled_at, created_at
            `;
            if (rows.length) return res.status(201).json({ gift: rows[0] });
        }
        return res.status(409).json({ error: 'Could not allocate a unique gift code. Please retry.' });
    }

    res.status(405).json({ error: 'Method not allowed' });
};
