/**
 * POST /api/gift-fill
 * Public endpoint the buyer's "Set Up Your Gift" form submits to.
 * Requires the shared Creation Code (env var, never sent to the client)
 * to prove they're an actual buyer, not just someone with a valid
 * access code. Refuses to touch a row that's already been filled —
 * only the admin page can edit those afterward.
 */
const { sql } = require('./_lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { groomName, brideName, weddingDate, creationCode } = req.body || {};
    const code = (req.body?.code || '').toString().trim().toUpperCase();

    if (!code || !groomName || !brideName || !weddingDate || !creationCode) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    if (creationCode !== process.env.CREATION_CODE) {
        res.status(403).json({ error: 'Incorrect creation code' });
        return;
    }

    const rows = await sql`
        SELECT id, filled_at FROM gifts WHERE access_code = ${code}
    `;

    if (rows.length === 0) {
        res.status(404).json({ error: 'Access code not found' });
        return;
    }

    if (rows[0].filled_at !== null) {
        res.status(409).json({ error: 'This gift has already been set up' });
        return;
    }

    await sql`
        UPDATE gifts
        SET groom_name = ${groomName},
            bride_name = ${brideName},
            wedding_date = ${weddingDate},
            filled_at = now()
        WHERE id = ${rows[0].id}
    `;

    res.status(200).json({
        success: true,
        groomName,
        brideName,
        weddingDate,
    });
};
