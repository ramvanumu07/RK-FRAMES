/**
 * POST /api/admin/logout — clears the session cookie.
 */
const { clearSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    clearSessionCookie(res);
    res.status(200).json({ success: true });
};
