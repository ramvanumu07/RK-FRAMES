require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium, expect } = require('@playwright/test');
const JSZip = require('jszip');
const { sql } = require('../api/_lib/db');

const origin = process.env.VERIFY_ORIGIN || 'http://localhost:8010';
const output = path.join(__dirname, '../backups/verification');
const staffEmail = `verify-${crypto.randomUUID()}@example.com`;
const staffPassword = crypto.randomBytes(20).toString('hex');

async function noOverflow(page) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must not overflow horizontally');
}

async function verifyLanding(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['small-mobile', 320, 640], ['wide', 1920, 1080], ['landscape', 844, 390]]) {
        await page.setViewportSize({ width, height });
        await page.goto(origin);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('h1')).toHaveText('Radha KrishnaWedding Gifts');
        await expect(page.locator('form,input,button')).toHaveCount(0);
        const links = await page.locator('a').evaluateAll((elements) => elements.map((element) => element.href));
        assert.ok(links.every((url) => url.startsWith('https://wa.me/918333027544')));
        await noOverflow(page);
        assert.ok(await page.locator('.hero-art').evaluate((image) => image.complete && image.naturalWidth > 0));
        const hero = await page.locator('.hero').boundingBox();
        const copy = await page.locator('.hero-copy').boundingBox();
        assert.ok(copy.y >= hero.y && copy.y + copy.height <= hero.y + hero.height, `Hero content must fit ${name}`);
        assert.ok((await page.locator('.intro').boundingBox()).y < height, `Next section must peek into ${name}`);
        await page.locator('.collection-image img').scrollIntoViewIfNeeded();
        await page.locator('.collection-image img').evaluate((image) => image.decode());
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `home-${name}.png`), fullPage: true });
        if (name === 'mobile') await page.screenshot({ path: path.join(output, 'home-mobile-first.png') });
    }
    await context.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: 'WhatsApp destination verified' }));
    const popupPromise = page.waitForEvent('popup');
    await page.locator('.header-contact').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.ok(popup.url().startsWith('https://wa.me/918333027544'));
    await popup.close();
    for (const url of ['/g/ABC234', '/?code=ABC234', '/index.html']) {
        const response = await context.request.get(`${origin}${url}`);
        assert.equal(response.status(), 200);
        assert.match(await response.text(), /<video/);
    }
    const admin = await context.request.get(`${origin}/admin`);
    assert.match(await admin.text(), /login-form/);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: landing page at five viewport sizes, loaded images, WhatsApp-only actions, and preserved gift/admin routes');
}

async function verifyGiftEdit(browser) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await context.addInitScript(() => {
        HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
        document.addEventListener('DOMContentLoaded', () => {
            const video = document.querySelector('video');
            video.addEventListener('play', () => video.pause(), { once: true });
            video.pause();
        });
    });
    let signedIn = false;
    let saved = false;
    const gift = { found: true, filled: true, groomName: 'Original Groom', brideName: 'Original Bride', weddingDate: '2021-11-05' };
    await page.route('**/api/gift?code=EDIT42', (route) => route.fulfill({ json: { ...gift, canManage: signedIn } }));
    await page.route('**/api/admin/login', (route) => { signedIn = true; return route.fulfill({ json: { role: 'staff' } }); });
    await page.route('**/api/gift-fill', (route) => {
        assert.equal(route.request().method(), 'PUT');
        assert.deepEqual(route.request().postDataJSON(), { code: 'EDIT42', groomName: 'Updated Groom', brideName: 'Updated Bride', weddingDate: '2022-12-25' });
        saved = true;
        return route.fulfill({ json: { success: true, groomName: 'Updated Groom', brideName: 'Updated Bride', weddingDate: '2022-12-25' } });
    });
    await page.goto(`${origin}/g/EDIT42/edit`);
    await expect(page.locator('#staff-login-form')).toBeVisible();
    await expect(page.locator('#screen-fill')).not.toHaveClass(/fade-in/);
    await page.locator('#staff-email').fill('editor@example.com');
    await page.locator('#staff-password').fill('mock-test-password');
    await page.locator('#staff-login-form button').click();
    await expect(page.locator('#screen-fill')).toHaveClass(/fade-in/);
    await expect(page.locator('#fill-groom-name')).toHaveValue(gift.groomName);
    await expect(page.locator('#fill-bride-name')).toHaveValue(gift.brideName);
    await expect(page.locator('#fill-wedding-date')).toHaveValue(gift.weddingDate);
    await expect.poll(() => page.locator('#screen-fill').evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    await expect.poll(() => page.locator('#screen-access').evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, 'gift-edit-mobile.png') });
    await page.locator('#fill-groom-name').fill('Updated Groom');
    await page.locator('#fill-bride-name').fill('Updated Bride');
    await page.locator('#fill-wedding-date').fill('2022-12-25');
    await page.locator('#fill-form button').click();
    await expect(page).toHaveURL(`${origin}/g/EDIT42`);
    await expect(page.locator('#groom-name')).toHaveText('UPDATED GROOM');
    assert.equal(saved, true);
    for (const url of ['/g/EDIT42/edit/', '/edit?code=EDIT42']) {
        const response = await context.request.get(`${origin}${url}`);
        assert.equal(response.status(), 200);
        assert.match(await response.text(), /fill-groom-name/);
    }
    await context.close();
    console.log('PASS: /edit requires sign-in, prefills all three values, submits corrections, and returns to the gift URL (mocked APIs; no database changes)');
}

async function main() {
    fs.mkdirSync(output, { recursive: true });
    if (process.argv.includes('--edit-only')) {
        const browser = await chromium.launch({ headless: true });
        try { await verifyGiftEdit(browser); }
        finally { await browser.close(); }
        return;
    }
    if (process.argv.includes('--landing-only')) {
        const browser = await chromium.launch({ headless: true });
        try { await verifyLanding(browser); }
        finally { await browser.close(); }
        return;
    }
    let batchId;
    let browser;
    const pageErrors = [];
    try {
        browser = await chromium.launch({ headless: true });
        const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
        const page = await admin.newPage();
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('dialog', (dialog) => dialog.accept());
        await page.goto(`${origin}/admin`);
        await page.locator('#login-email').fill(process.env.ADMIN_EMAIL);
        await page.locator('#login-password').fill(process.env.ADMIN_PASSWORD);
        await page.locator('#login-form button').click();
        await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('#batch-template option')).toHaveCount(1, { timeout: 30000 });
        const [before] = await sql`SELECT count(*)::integer AS count, max(id) AS last_id FROM gifts`;
        await expect(page.locator('#gifts-table-body tr')).toHaveCount(Math.max(1, Math.min(50, before.count)), { timeout: 30000 });
        console.log('Verified admin sign-in and paginated inventory');
        await page.locator('#batch-quantity').fill('2');
        await expect(page.locator('#batch-site-url')).toHaveCount(0);
        const created = page.waitForResponse((response) => response.url().endsWith('/api/admin/batches') && response.request().method() === 'POST');
        const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
        await page.locator('#generate-batch-btn').click();
        const response = await created;
        assert.equal(response.status(), 201);
        batchId = (await response.json()).batch.id;
        const payload = response.request().postDataJSON();
        const duplicate = await admin.request.post(`${origin}/api/admin/batches`, { data: payload });
        assert.equal(duplicate.status(), 200);
        assert.equal((await duplicate.json()).batch.id, batchId);
        const download = await downloadPromise;
        assert.equal(await download.failure(), null);
        const zipPath = path.join(output, 'frames.zip');
        await download.saveAs(zipPath);
        const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
        assert.ok(zip.file(`frames-${batchId}/1.png`));
        assert.ok(zip.file(`frames-${batchId}/2.png`));
        const gifts = await sql`SELECT id, access_code, frame_number, public_url FROM gifts WHERE batch_id = ${batchId} ORDER BY frame_number`;
        fs.writeFileSync(path.join(output, 'temporary-records.json'), JSON.stringify({ batchId, staffEmail }), { mode: 0o600 });
        console.log('Verified batch creation, retry key, and ZIP download');
        assert.equal(gifts.length, 2);
        assert.ok(gifts.every((gift) => gift.id > (before.last_id || 0)), 'Batch must create new rows');
        assert.ok(gifts.every((gift) => /^[A-HJ-NP-Z2-9]{6}$/.test(gift.access_code)), 'New codes must be 6 characters');
        const [after] = await sql`SELECT count(*)::integer AS count FROM gifts`;
        assert.equal(after.count, before.count + 2, 'Batch must insert exactly the requested number of rows, even after a duplicate request');
        assert.notEqual(gifts[0].public_url, gifts[1].public_url);
        assert.ok(gifts.every((gift) => gift.public_url.startsWith(`${process.env.PUBLIC_SITE_URL}/g/`)), 'QR destination must come from the server environment');
        const [batch] = await sql`SELECT template_config FROM frame_batches WHERE id = ${batchId}`;
        await sql`UPDATE frame_batches SET template_config = ${JSON.stringify({ ...batch.template_config, artwork: 'missing-verification-artwork.png' })}::jsonb WHERE id = ${batchId}`;
        try {
            const prepared = await admin.request.post(`${origin}/api/admin/batches?prepare=${batchId}`);
            assert.equal(prepared.status(), 202);
            const failedJob = (await prepared.json()).job;
            await expect.poll(async () => (await (await admin.request.get(`${origin}/api/admin/batches?job=${failedJob}`)).json()).status, { timeout: 30000 }).toBe('failed');
            const failure = await (await admin.request.get(`${origin}/api/admin/batches?job=${failedJob}`)).json();
            assert.ok(failure.error, 'Rendering failure must return a readable JSON error');
            assert.equal((await admin.request.get(`${origin}/api/admin/batches?download=${batchId}&job=${failedJob}`)).status(), 409);
        } finally {
            await sql`UPDATE frame_batches SET template_config = ${JSON.stringify(batch.template_config)}::jsonb WHERE id = ${batchId}`;
        }
        console.log('Verified on-demand records, short codes, environment destination, and readable export-failure status');
        await noOverflow(page);
        await page.screenshot({ path: path.join(output, 'admin-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await noOverflow(page);
        await page.screenshot({ path: path.join(output, 'admin-mobile.png') });
        assert.equal((await admin.request.get(`${origin}/.env`)).status(), 403);
        assert.equal((await admin.request.get(`${origin}/api/_lib/db.js`)).status(), 403);
        assert.equal((await admin.request.get(`${origin}/backups/verification/frames.zip`)).status(), 403);
        assert.equal((await admin.request.get(`${origin}/assets/source/screen2.png`)).status(), 404);
        assert.equal((await admin.request.get(`${origin}/tests/workflow.test.js`)).status(), 404);
        const stylesheet = await admin.request.get(`${origin}/assets/styles/styles.css`);
        assert.equal(stylesheet.status(), 200);
        const legacyStylesheet = await admin.request.get(`${origin}/styles.css`);
        assert.equal(legacyStylesheet.status(), 200);
        assert.equal(await legacyStylesheet.text(), await stylesheet.text());
        const image = await admin.request.get(`${origin}/assets/images/screen2.webp`);
        assert.equal(image.status(), 200);
        assert.equal((await admin.request.get(`${origin}/screen2.webp`)).status(), 200);
        const video = await admin.request.get(`${origin}/assets/videos/Krishna_and_Radha_meeting_1080p_20260912151343.mp4`, { headers: { Range: 'bytes=0-1023' } });
        assert.equal(video.status(), 206);
        assert.equal((await video.body()).length, 1024);
        assert.equal((await admin.request.post(`${origin}/api/admin/batches`, { data: { ...payload, quantity: 101 } })).status(), 400);
        assert.equal((await admin.request.delete(`${origin}/api/admin/gift?id=${gifts[0].id}`)).status(), 409);
        const newStaff = await admin.request.post(`${origin}/api/admin/users`, { data: { email: staffEmail, password: staffPassword, role: 'staff' } });
        assert.equal(newStaff.status(), 201);
        const staff = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const staffPage = await staff.newPage();
        staffPage.on('pageerror', (error) => pageErrors.push(error.message));
        staffPage.on('dialog', (dialog) => dialog.accept());
        await staffPage.goto(`${origin}/g/${gifts[0].access_code}`);
        await expect(staffPage.locator('#access-error')).toHaveText('This gift is being prepared.', { timeout: 30000 });
        await expect(staffPage.locator('#access-code-input, #access-form')).toHaveCount(0);
        await expect(staffPage.locator('#screen-fill')).not.toHaveClass(/fade-in/);
        assert.equal((await staff.request.post(`${origin}/api/gift-fill`, { data: { code: gifts[0].access_code } })).status(), 401);
        await staffPage.locator('#staff-email').fill(staffEmail);
        await staffPage.locator('#staff-password').fill(staffPassword);
        await staffPage.locator('#staff-login-form button').click();
        await expect(staffPage.locator('#screen-fill')).toHaveClass(/fade-in/, { timeout: 30000 });
        await noOverflow(staffPage);
        await staffPage.screenshot({ path: path.join(output, 'staff-setup-mobile.png'), fullPage: true });
        assert.equal((await staff.request.get(`${origin}/api/admin/batches`)).status(), 403);
        assert.equal((await staff.request.post(`${origin}/api/admin/gifts`, { data: {} })).status(), 403);
        const details = { code: gifts[0].access_code, groomName: 'Sample Groom', brideName: 'Sample Bride', weddingDate: '2021-11-05' };
        await staffPage.locator('#fill-groom-name').fill(details.groomName);
        await staffPage.locator('#fill-bride-name').fill(details.brideName);
        await staffPage.locator('#fill-wedding-date').fill(details.weddingDate);
        await staffPage.locator('#fill-form button').click();
        await expect(staffPage.locator('#screen-fill')).toHaveClass(/fade-out/, { timeout: 30000 });
        console.log('Verified shop-owner sign-in and frame personalization');
        assert.equal((await staff.request.post(`${origin}/api/gift-fill`, { data: details })).status(), 409);
        assert.equal((await staff.request.put(`${origin}/api/gift-fill`, { data: { ...details, weddingDate: '2021-02-29' } })).status(), 400);
        const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await guest.addInitScript(() => {
            HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
            document.addEventListener('DOMContentLoaded', () => {
                const video = document.querySelector('video');
                video.addEventListener('play', () => video.pause(), { once: true });
                if (!video.paused) video.pause();
            });
        });
        const guestPage = await guest.newPage();
        guestPage.on('pageerror', (error) => pageErrors.push(error.message));
        await guestPage.goto(`${origin}/g/${gifts[0].access_code}`);
        await expect(guestPage.locator('#screen-access')).toHaveClass(/fade-out/, { timeout: 30000 });
        await expect(guestPage.locator('#access-code-input, #access-form')).toHaveCount(0);
        await expect(guestPage.locator('#groom-name')).toHaveText(details.groomName.toUpperCase());
        await expect(guestPage.locator('#wedding-date')).toContainText('2021');
        const publicGift = await (await guest.request.get(`${origin}/api/gift?code=${gifts[0].access_code}`)).json();
        assert.equal(publicGift.weddingDate, details.weddingDate);
        assert.equal(publicGift.canManage, false);
        await expect(guestPage.locator('#screen-fill')).not.toHaveClass(/fade-in/);
        await expect(guestPage.locator('#manage-gift-link, #journey-button, .petals')).toHaveCount(0);
        await expect(guestPage.locator('#welcome-video source')).toHaveAttribute('src', 'assets/videos/Krishna_and_Radha_meeting_1080p_20260912151343.mp4');
        await noOverflow(guestPage);
        await guestPage.screenshot({ path: path.join(output, 'gift-mobile.png') });
        await guestPage.setViewportSize({ width: 1440, height: 1000 });
        await noOverflow(guestPage);
        await guestPage.screenshot({ path: path.join(output, 'gift-desktop.png') });
        await guestPage.locator('#welcome-video').evaluate((video) => video.dispatchEvent(new Event('ended')));
        await expect(guestPage.locator('#screen-2')).toHaveClass(/fade-in/);
        await expect(guestPage.locator('.journey-bg')).toHaveAttribute('src', 'assets/images/screen2.webp');
        assert.ok(await guestPage.locator('.journey-bg').evaluate((image) => image.complete && image.naturalWidth > 0));
        assert.ok(Number((await guestPage.locator('#stat-days').textContent()).replace(/,/g, '')) > 0);
        const beats = await guestPage.locator('#stat-heartbeats').textContent();
        await expect.poll(() => guestPage.locator('#stat-heartbeats').textContent()).not.toBe(beats);
        await guestPage.setViewportSize({ width: 390, height: 844 });
        await noOverflow(guestPage);
        await guestPage.screenshot({ path: path.join(output, 'journey-mobile.png') });
        await guestPage.goto(`${origin}/g/${gifts[1].access_code}`);
        await expect(guestPage.locator('#access-error')).toHaveText('This gift is being prepared.', { timeout: 30000 });
        await staffPage.goto(`${origin}/g/${gifts[0].access_code}?manage=1`);
        await expect(staffPage.locator('#screen-fill')).toHaveClass(/fade-in/, { timeout: 30000 });
        await expect(staffPage.locator('#fill-groom-name')).toHaveValue(details.groomName);
        assert.equal((await staff.request.put(`${origin}/api/gift-fill`, { data: { ...details, groomName: 'Corrected Groom' } })).status(), 200);
        await guestPage.goto(`${origin}/g/${gifts[0].access_code}`);
        await expect(guestPage.locator('#groom-name')).toHaveText('CORRECTED GROOM', { timeout: 30000 });
        assert.deepEqual(pageErrors, []);
        console.log('PASS: admin batch UI, numbered ZIP, staff setup, original gift screens/artwork, automatic transition, live heartbeats, and desktop/mobile layouts');
        console.log('Screenshots saved in backups/verification. Temporary records will now be removed.');
    } finally {
        if (browser) await browser.close();
        if (batchId) await sql.transaction([
            sql`DELETE FROM gifts WHERE batch_id = ${batchId}`,
            sql`DELETE FROM frame_batches WHERE id = ${batchId}`,
        ]);
        await sql`DELETE FROM users WHERE email = ${staffEmail}`;
        fs.rmSync(path.join(output, 'temporary-records.json'), { force: true });
    }
}

main().catch((error) => {
    let message = error.stack || error.message;
    for (const secret of [process.env.ADMIN_PASSWORD, process.env.DATABASE_URL, process.env.JWT_SECRET, staffPassword]) if (secret) message = message.split(secret).join('[redacted]');
    console.error(message);
    process.exit(1);
});