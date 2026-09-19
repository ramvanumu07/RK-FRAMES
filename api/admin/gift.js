/**
 * /api/admin/gift?id=NN
 * PUT    -> update a row's data (admin can edit even already-filled rows)
 * DELETE -> remove a row entirely
 */
const { sql } = require('../_lib/db');
const { requireSession } = require('../_lib/auth');

module.exports = async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const id = Number(req.query?.id);
    if (!id) {
        res.status(400).json({ error: 'Missing or invalid id' });
        return;
    }

    if (req.method === 'PUT') {
        const { groomName, brideName, weddingDate } = req.body || {};
        if (!groomName || !brideName || !weddingDate) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const rows = await sql`
            UPDATE gifts
            SET groom_name = ${groomName},
                bride_name = ${brideName},
                wedding_date = ${weddingDate},
                filled_at = COALESCE(filled_at, now())
            WHERE id = ${id}
            RETURNING id, access_code, groom_name, bride_name, wedding_date::text AS wedding_date, filled_at, created_at
        `;
        if (rows.length === 0) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.status(200).json({ gift: rows[0] });
        return;
    }

    if (req.method === 'DELETE') {
        await sql`DELETE FROM gifts WHERE id = ${id}`;
        res.status(200).json({ success: true });
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
