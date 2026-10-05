/**
 * Admin dashboard logic: login, gift-code management, user management.
 * All requests rely on the httpOnly session cookie set by /api/admin/login
 * — no tokens are ever stored in JS-accessible storage.
 */

const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const usersPanel = document.getElementById('users-panel');
const currentUserLabel = document.getElementById('current-user');

let currentRole = null;
let giftPage = 1;
let frameTemplates = [];

function icons() { window.lucide?.createIcons(); }

function textCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value ?? '';
    row.appendChild(cell);
    return cell;
}

function actionButton(label, icon, handler, className = 'btn-secondary') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = label;
    button.setAttribute('aria-label', label);
    const glyph = document.createElement('i');
    glyph.dataset.lucide = icon;
    button.appendChild(glyph);
    button.addEventListener('click', handler);
    return button;
}

async function api(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
}

/* ---------- Boot / auth state ---------- */

async function boot() {
    try {
        const me = await api('/api/admin/me');
        currentRole = me.role;
        currentUserLabel.textContent = `${me.email} (${me.role})`;
        showDashboard();
    } catch {
        showLogin();
    }
}

function showLogin() {
    loginView.hidden = false;
    dashboardView.hidden = true;
}

function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    usersPanel.hidden = currentRole !== 'admin';
    document.getElementById('batch-panel').hidden = currentRole !== 'admin';
    giftPage = 1;
    loadGifts();
    if (currentRole === 'admin') { loadUsers(); loadBatches(); }
    icons();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    try {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const result = await api('/api/admin/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        currentRole = result.role;
        currentUserLabel.textContent = `${result.email} (${result.role})`;
        showDashboard();
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
});

/* ---------- Gifts ---------- */

async function loadGifts() {
    const errorEl = document.getElementById('gifts-error');
    errorEl.textContent = '';
    try {
        const params = new URLSearchParams({ page: giftPage, search: document.getElementById('gift-search').value, status: document.getElementById('gift-status').value });
        const { gifts, counts, hasMore } = await api(`/api/admin/gifts?${params}`);
        document.getElementById('inventory-summary').textContent = `${counts.total.toLocaleString()} frames / ${counts.filled.toLocaleString()} personalized / ${(counts.total - counts.filled).toLocaleString()} awaiting details`;
        document.getElementById('page-label').textContent = `Page ${giftPage}`;
        document.getElementById('previous-page').disabled = giftPage === 1;
        document.getElementById('next-page').disabled = !hasMore;
        renderGifts(gifts);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function renderGifts(gifts) {
    const tbody = document.getElementById('gifts-table-body');
    tbody.innerHTML = '';

    for (const gift of gifts) {
        const filled = gift.filled_at !== null;
        const tr = document.createElement('tr');

        const codeCell = textCell(tr, '');
        const link = document.createElement('a');
        link.textContent = gift.access_code;
        link.href = `/g/${encodeURIComponent(gift.access_code)}`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'access-code-cell';
        codeCell.appendChild(link);
        const status = textCell(tr, '');
        const badge = document.createElement('span');
        badge.className = `status-badge ${filled ? 'status-filled' : 'status-empty'}`;
        badge.textContent = filled ? 'Personalized' : 'Awaiting details';
        status.appendChild(badge);
        textCell(tr, gift.groom_name || '-');
        textCell(tr, gift.bride_name || '-');
        textCell(tr, gift.wedding_date || '-');
        textCell(tr, new Date(gift.created_at).toLocaleDateString());
        const actions = textCell(tr, '');
        actions.className = 'row-actions';
        actions.appendChild(actionButton('Edit wedding details', 'pencil', () => openEditModal(gift)));
        if (currentRole === 'admin' && !gift.batch_id) actions.appendChild(actionButton('Delete unprinted gift', 'trash-2', () => deleteGift(gift), 'btn-danger'));
        tbody.appendChild(tr);
    }
    if (!gifts.length) { const row = tbody.insertRow(); const cell = row.insertCell(); cell.colSpan = 7; cell.textContent = 'No matching gifts'; }
    icons();
}

document.getElementById('gift-search-form').addEventListener('submit', (event) => { event.preventDefault(); giftPage = 1; loadGifts(); });
document.getElementById('gift-status').addEventListener('change', () => { giftPage = 1; loadGifts(); });
document.getElementById('previous-page').addEventListener('click', () => { if (giftPage > 1) giftPage--; loadGifts(); });
document.getElementById('next-page').addEventListener('click', () => { giftPage++; loadGifts(); });

async function deleteGift(gift) {
    if (!confirm(`Delete access code ${gift.access_code}? This cannot be undone.`)) return;
    try {
        await api(`/api/admin/gift?id=${gift.id}`, { method: 'DELETE' });
        loadGifts();
    } catch (err) {
        document.getElementById('gifts-error').textContent = err.message;
    }
}

/* ---------- Edit modal ---------- */

const editModal = document.getElementById('edit-modal');

function openEditModal(gift) {
    document.getElementById('edit-id').value = gift.id;
    document.getElementById('edit-groom-name').value = gift.groom_name || '';
    document.getElementById('edit-bride-name').value = gift.bride_name || '';
    document.getElementById('edit-wedding-date').value = gift.wedding_date || '';
    document.getElementById('edit-error').textContent = '';
    editModal.hidden = false;
}

document.getElementById('edit-cancel-btn').addEventListener('click', () => {
    editModal.hidden = true;
});

document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('edit-error');
    errorEl.textContent = '';
    try {
        const id = document.getElementById('edit-id').value;
        await api(`/api/admin/gift?id=${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                groomName: document.getElementById('edit-groom-name').value.trim(),
                brideName: document.getElementById('edit-bride-name').value.trim(),
                weddingDate: document.getElementById('edit-wedding-date').value,
            }),
        });
        editModal.hidden = true;
        loadGifts();
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

/* ---------- Users (admin only) ---------- */

async function loadUsers() {
    const errorEl = document.getElementById('users-error');
    errorEl.textContent = '';
    try {
        const { users } = await api('/api/admin/users');
        renderUsers(users);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';
    for (const user of users) {
        const tr = document.createElement('tr');
        textCell(tr, user.email);
        textCell(tr, user.role === 'staff' ? 'Shop owner' : 'Admin');
        textCell(tr, new Date(user.created_at).toLocaleDateString());
        tbody.appendChild(tr);
    }
}

const newUserModal = document.getElementById('new-user-modal');

document.getElementById('new-user-btn').addEventListener('click', () => {
    document.getElementById('new-user-error').textContent = '';
    document.getElementById('new-user-form').reset();
    newUserModal.hidden = false;
});

document.getElementById('new-user-cancel-btn').addEventListener('click', () => {
    newUserModal.hidden = true;
});

document.getElementById('new-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('new-user-error');
    errorEl.textContent = '';
    try {
        await api('/api/admin/users', {
            method: 'POST',
            body: JSON.stringify({
                email: document.getElementById('new-user-email').value.trim(),
                password: document.getElementById('new-user-password').value,
                role: document.getElementById('new-user-role').value,
            }),
        });
        newUserModal.hidden = true;
        loadUsers();
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

async function loadBatches() {
    try {
        const result = await api('/api/admin/batches');
        frameTemplates = result.templates;
        const select = document.getElementById('batch-template');
        if (!select.options.length) {
            for (const template of frameTemplates) select.add(new Option(template.name, template.id));
            updateTemplate();
        }
        document.getElementById('batch-destination').textContent = result.siteUrl ? `Destination: ${result.siteUrl}${/localhost|127\.0\.0\.1/.test(result.siteUrl) ? ' (local testing only)' : ''}` : 'PUBLIC_SITE_URL is not configured on the server.';
        document.getElementById('code-settings').textContent = `${result.codeLength}-character codes / created on demand`;
        const tbody = document.getElementById('batches-table-body');
        tbody.replaceChildren();
        for (const batch of result.batches) {
            const row = tbody.insertRow();
            textCell(row, batch.template_name);
            textCell(row, batch.quantity);
            textCell(row, batch.site_url);
            textCell(row, new Date(batch.created_at).toLocaleString());
            textCell(row, '').appendChild(actionButton('Download ZIP', 'download', async (event) => {
                event.currentTarget.disabled = true;
                const button = event.currentTarget;
                try { await downloadBatch(batch.id); }
                catch (error) { document.getElementById('batch-error').textContent = error.message; }
                finally { button.disabled = false; }
            }));
        }
        if (!result.batches.length) { const cell = tbody.insertRow().insertCell(); cell.colSpan = 5; cell.textContent = 'No batches yet'; }
        icons();
    } catch (error) { document.getElementById('batch-error').textContent = error.message; }
}

function updateTemplate() {
    const template = frameTemplates.find((item) => item.id === document.getElementById('batch-template').value);
    if (template) document.getElementById('template-preview').src = `/${encodeURIComponent(template.artwork)}`;
}

async function downloadBatch(id) {
    const progress = document.getElementById('batch-progress');
    progress.textContent = 'Preparing ZIP...';
    let job;
    try {
        ({ job } = await api(`/api/admin/batches?prepare=${encodeURIComponent(id)}`, { method: 'POST' }));
        const deadline = Date.now() + 20 * 60 * 1000;
        while (true) {
            const status = await api(`/api/admin/batches?job=${encodeURIComponent(job)}`);
            if (status.status === 'failed') throw new Error(status.error || 'ZIP preparation failed');
            if (status.status === 'ready') break;
            progress.textContent = `Rendering and verifying frames: ${status.completed} / ${status.quantity}`;
            if (Date.now() > deadline) throw new Error('Export is taking longer than expected. Retry from Recent Batches.');
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    } catch (error) {
        progress.textContent = 'Download not started';
        throw new Error(error instanceof TypeError ? 'Connection lost while preparing the ZIP. Retry from Recent Batches without creating another batch.' : error.message);
    }
    const link = document.createElement('a');
    link.href = `/api/admin/batches?download=${encodeURIComponent(id)}&job=${encodeURIComponent(job)}`;
    link.download = `frames-${id}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    progress.textContent = 'ZIP download started';
}

document.getElementById('batch-template').addEventListener('change', updateTemplate);
document.getElementById('batch-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('generate-batch-btn');
    const errorLabel = document.getElementById('batch-error');
    errorLabel.textContent = '';
    const payload = { templateId: document.getElementById('batch-template').value, quantity: Number(document.getElementById('batch-quantity').value) };
    if (!confirm(`Create ${payload.quantity} new gift records and frame images?`)) return;
    button.disabled = true;
    document.getElementById('batch-progress').textContent = 'Creating gift records and unique codes...';
    const signature = JSON.stringify(payload);
    try {
        let pending = JSON.parse(sessionStorage.getItem('pending-frame-batch') || 'null');
        if (pending?.signature !== signature) pending = { signature, key: crypto.randomUUID() };
        sessionStorage.setItem('pending-frame-batch', JSON.stringify(pending));
        const result = await api('/api/admin/batches', { method: 'POST', body: JSON.stringify({ ...payload, requestKey: pending.key }) });
        sessionStorage.removeItem('pending-frame-batch');
        await loadBatches();
        await loadGifts();
        await downloadBatch(result.batch.id);
    } catch (error) {
        errorLabel.textContent = error.message;
        document.getElementById('batch-progress').textContent = 'Download existing batches from Recent Batches.';
    } finally { button.disabled = false; }
});

icons();
boot();
