/**
 * GET /api/gift?code=XXXX
 * Public endpoint used by the main site to look up an access code.
 * Returns whether the code exists, and if so whether it's already
 * been personalized (filled) or still needs the setup form.
 */
const { sql } = require('./_lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const code = (req.query?.code || '').toString().trim().toUpperCase();
    if (!code) {
        res.status(400).json({ error: 'Missing access code' });
        return;
    }

    const rows = await sql`
        SELECT groom_name, bride_name, wedding_date::text AS wedding_date, filled_at
        FROM gifts
        WHERE access_code = ${code}
    `;

    if (rows.length === 0) {
        res.status(404).json({ found: false });
        return;
    }

    const row = rows[0];
    const filled = row.filled_at !== null;

    res.status(200).json({
        found: true,
        filled,
        groomName: filled ? row.groom_name : undefined,
        brideName: filled ? row.bride_name : undefined,
        weddingDate: filled ? row.wedding_date : undefined,
    });
};
