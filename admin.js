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
    loadGifts();
    if (currentRole === 'admin') loadUsers();
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
        const { gifts } = await api('/api/admin/gifts');
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

        tr.innerHTML = `
            <td class="access-code-cell" title="Click to copy">${gift.access_code}</td>
            <td><span class="status-badge ${filled ? 'status-filled' : 'status-empty'}">${filled ? 'Filled' : 'Empty'}</span></td>
            <td>${gift.groom_name || '—'}</td>
            <td>${gift.bride_name || '—'}</td>
            <td>${gift.wedding_date || '—'}</td>
            <td>${new Date(gift.created_at).toLocaleDateString()}</td>
            <td class="row-actions">
                <button class="btn-secondary edit-btn">Edit</button>
                <button class="btn-danger delete-btn">Delete</button>
            </td>
        `;

        tr.querySelector('.access-code-cell').addEventListener('click', () => {
            navigator.clipboard.writeText(gift.access_code);
        });
        tr.querySelector('.edit-btn').addEventListener('click', () => openEditModal(gift));
        tr.querySelector('.delete-btn').addEventListener('click', () => deleteGift(gift));

        tbody.appendChild(tr);
    }
}

document.getElementById('new-gift-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('gifts-error');
    errorEl.textContent = '';
    try {
        await api('/api/admin/gifts', { method: 'POST' });
        loadGifts();
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

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
        tr.innerHTML = `
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
        `;
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

boot();
