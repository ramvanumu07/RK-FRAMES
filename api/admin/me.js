/**
 * GET /api/admin/me — returns the current session's identity, or 401
 * if not logged in. Used by admin.html on load to decide whether to
 * show the login form or the dashboard.
 */
const { requireSession } = require('../_lib/auth');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const session = requireSession(req, res);
    if (!session) return;
    res.status(200).json({ email: session.email, role: session.role });
};
