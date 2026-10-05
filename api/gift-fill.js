const { sql } = require('./_lib/db');
const { requireSession } = require('./_lib/auth');
const { giftData } = require('./_lib/gift-data');

module.exports = async (req, res) => {
    if (!['POST', 'PUT'].includes(req.method)) {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!requireSession(req, res)) return;
    let details;
    try { details = giftData(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const { groomName, brideName, weddingDate } = details;
    const code = (req.body?.code || '').toString().trim().toUpperCase();

    if (!code) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    const rows = await sql`
        UPDATE gifts
        SET groom_name = ${groomName},
            bride_name = ${brideName},
            wedding_date = ${weddingDate},
            filled_at = COALESCE(filled_at, now())
        WHERE access_code = ${code} AND (${req.method === 'PUT'} OR filled_at IS NULL)
        RETURNING id
    `;

    if (rows.length === 0) {
        res.status(409).json({ error: 'Gift is unavailable or already personalized. Refresh to view it.' });
        return;
    }

    res.status(200).json({
        success: true,
        groomName,
        brideName,
        weddingDate,
    });
};
