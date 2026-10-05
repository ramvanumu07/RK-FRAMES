/**
 * /api/admin/gift?id=NN
 * PUT    -> update a row's data (admin can edit even already-filled rows)
 * DELETE -> remove a row entirely
 */
const { sql } = require('../_lib/db');
const { requireSession } = require('../_lib/auth');
const { giftData } = require('../_lib/gift-data');

module.exports = async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const id = Number(req.query?.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        res.status(400).json({ error: 'Missing or invalid id' });
        return;
    }

    if (req.method === 'PUT') {
        let details;
        try { details = giftData(req.body); }
        catch (error) { return res.status(400).json({ error: error.message }); }
        const { groomName, brideName, weddingDate } = details;
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
        if (session.role !== 'admin') return res.status(403).json({ error: 'Only admins can delete gifts' });
        const rows = await sql`DELETE FROM gifts WHERE id = ${id} AND batch_id IS NULL RETURNING id`;
        if (!rows.length) return res.status(409).json({ error: 'Printed batch records cannot be deleted' });
        res.status(200).json({ success: true });
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
