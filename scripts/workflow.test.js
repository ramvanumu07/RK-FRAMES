const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const vm = require('vm');
const sharp = require('sharp');
const jsQR = require('jsqr');
const JSZip = require('jszip');
const { templates, batchInput, exportBatch } = require('../api/_lib/frames');
const { giftData } = require('../api/_lib/gift-data');
const { generateCodes } = require('../api/_lib/codes');

test('new codes are unique, cryptographically generated, and limited to 4-6 characters', () => {
    for (const length of [4, 5, 6]) {
        const codes = generateCodes(100, length);
        assert.equal(new Set(codes).size, 100);
        assert.ok(codes.every((code) => code.length === length && /^[A-HJ-NP-Z2-9]+$/.test(code)));
    }
    assert.equal(generateCodes(1)[0].length, 6);
    for (const length of [3, 7, 24]) assert.throws(() => generateCodes(1, length));
});

test('original customer gift class, screen markup, CSS, and media references are preserved', () => {
    const root = path.join(__dirname, '..');
    const original = (name) => execFileSync('git', ['show', `HEAD:${name}`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
    const current = (name) => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
    const giftClass = (text) => text.slice(text.indexOf('class WeddingGiftExperience'), text.indexOf('class AccessGate')).trim();
    const screens = (text) => text.slice(text.indexOf('    <!-- SCREEN 1:'), text.indexOf('    <script src='));
    const normalizeStartup = (text) => text
        .replace(/ autoplay| preload="auto"/g, '')
        .replace(/(id="(?:groom-name|bride-name|wedding-date|journey-groom-name|journey-bride-name|journey-date-month|journey-date-day-year)"[^>]*>)[^<]*/g, '$1');
    assert.equal(current('styles.css'), original('styles.css'));
    assert.equal(giftClass(current('script.js')), giftClass(original('script.js')));
    assert.equal(normalizeStartup(screens(current('index.html'))), normalizeStartup(screens(original('index.html'))));
    assert.doesNotMatch(current('index.html'), /RAMAKRISHNAN|KALAMUTHU|Ramakrishnan|Kalamuthu/);
    assert.match(current('index.html'), /id="welcome-video"[^>]*autoplay muted playsinline preload="auto"/);
});

test('QR lookup needs no manual gift-code form and handles missing, invalid, and unfilled gifts', async () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /id="(?:access-form|access-code-input)"|Open My Gift|gate-bg\.webp/);
    assert.doesNotMatch(html, /<h1[^>]*>A Gift for You<\/h1>|>Opening your gift\.\.\.</);
    assert.match(html, /id="screen-access"[^>]*style="display: none"/);
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const gateScript = script.slice(script.indexOf('class AccessGate'), script.indexOf("document.addEventListener('DOMContentLoaded'"));
    async function resolve(pathname, search, data, ok = true) {
        const elements = {};
        for (const id of ['screen-access', 'screen-fill', 'access-error', 'fill-form', 'fill-error', 'staff-login-form', 'fill-groom-name', 'fill-bride-name', 'fill-wedding-date']) {
            elements[id] = { classList: new Set(), style: {}, addEventListener() {} };
        }
        const calls = [];
        let opened;
        const context = {
            location: { pathname, search }, URLSearchParams,
            document: { getElementById: (id) => elements[id] || null },
            fetch: async (url) => { calls.push(url); return { ok, json: async () => data }; },
            WeddingGiftExperience: class { constructor(gift) { opened = gift; } },
            console,
        };
        vm.runInNewContext(`${gateScript}\nnew AccessGate();`, context);
        await new Promise(setImmediate);
        return { elements, calls, opened };
    }
    const gift = { found: true, filled: true, groomName: 'Groom', brideName: 'Bride', weddingDate: '2021-11-05' };
    const ready = await resolve('/g/ABCD', '', gift);
    assert.deepEqual(ready.calls, ['/api/gift?code=ABCD']);
    assert.equal(ready.opened, gift);
    assert.equal(ready.elements['screen-access'].style.display, 'none');
    assert.ok(ready.elements['screen-access'].classList.has('fade-out'));
    const missing = await resolve('/', '', gift);
    assert.deepEqual(missing.calls, []);
    assert.equal(missing.elements['access-error'].textContent, 'No gift selected.');
    assert.equal(missing.elements['screen-access'].style.display, 'flex');
    const invalid = await resolve('/g/WXYZ', '', { found: false }, false);
    assert.equal(invalid.elements['access-error'].textContent, 'This gift could not be found.');
    const pending = await resolve('/g/ABCD', '', { found: true, filled: false, canManage: false });
    assert.equal(pending.elements['access-error'].textContent, 'This gift is being prepared.');
    assert.equal(pending.elements['screen-access'].style.display, 'flex');
    assert.equal(pending.elements['staff-login-form'].style.display, 'flex');
    const staff = await resolve('/g/ABCD', '', { found: true, filled: false, canManage: true });
    assert.ok(staff.elements['screen-fill'].classList.has('fade-in'));
    const legacyLink = await resolve('/', '?code=ABCD', gift);
    assert.equal(legacyLink.opened, gift);
});

test('gift details preserve date-only values and reject invalid calendar dates', () => {
    assert.deepEqual(giftData({ groomName: ' Groom ', brideName: 'Bride', weddingDate: '2024-02-29' }), {
        groomName: 'Groom', brideName: 'Bride', weddingDate: '2024-02-29',
    });
    for (const weddingDate of ['2023-02-29', '2024-02-30', '2024-13-01', '1899-01-01']) {
        assert.throws(() => giftData({ groomName: 'Groom', brideName: 'Bride', weddingDate }));
    }
    assert.throws(() => giftData({ groomName: 'x'.repeat(101), brideName: 'Bride', weddingDate: '2024-01-01' }));
});

test('batch inputs enforce limits and use only the server-configured origin', () => {
    const input = batchInput({ templateId: templates[0].id, quantity: 100, siteUrl: 'https://ignored.example.com' }, 'https://gift.example.com');
    assert.equal(input.origin, 'https://gift.example.com');
    assert.equal(input.codes, undefined);
    assert.throws(() => batchInput({ templateId: templates[0].id, quantity: 1 }, ''), /PUBLIC_SITE_URL/);
    for (const quantity of [0, -1, 101, 1.5]) assert.throws(() => batchInput({ templateId: templates[0].id, quantity }, 'https://gift.example.com'));
    for (const siteUrl of ['javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/subpath', 'http://public.example.com']) {
        assert.throws(() => batchInput({ templateId: templates[0].id, quantity: 1 }, siteUrl));
    }
});

test('only staff can activate; activation is atomic and explicit corrections are separate', async () => {
    const dbPath = path.resolve(__dirname, '../api/_lib/db.js');
    const authPath = path.resolve(__dirname, '../api/_lib/auth.js');
    const handlerPath = path.resolve(__dirname, '../api/gift-fill.js');
    const originalDb = require.cache[dbPath];
    const originalAuth = require.cache[authPath];
    let allowed = false;
    let result = [{ id: 1 }];
    let query = '';
    let params = [];
    require.cache[dbPath] = { exports: { sql: async (strings, ...values) => { query = strings.join('?'); params = values; return result; } } };
    require.cache[authPath] = { exports: { requireSession: (req, res) => allowed ? { role: 'staff' } : (res.status(401).json({}), null) } };
    delete require.cache[handlerPath];
    try {
        const handler = require(handlerPath);
        const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
        const req = { method: 'POST', body: { code: 'TEST', groomName: 'Groom', brideName: 'Bride', weddingDate: '2024-02-29' } };
        await handler(req, res);
        assert.equal(res.code, 401);
        allowed = true;
        await handler(req, res);
        assert.equal(res.code, 200);
        assert.match(query, /filled_at IS NULL/);
        assert.equal(params.at(-1), false);
        result = [];
        await handler(req, res);
        assert.equal(res.code, 409);
        result = [{ id: 1 }];
        req.method = 'PUT';
        await handler(req, res);
        assert.equal(params.at(-1), true);
    } finally {
        delete require.cache[handlerPath];
        if (originalDb) require.cache[dbPath] = originalDb; else delete require.cache[dbPath];
        if (originalAuth) require.cache[authPath] = originalAuth; else delete require.cache[authPath];
    }
});

test('exports preserve native artwork pixels in compact numbered PNGs with decodable QR URLs', async () => {
    const input = batchInput({ templateId: templates[0].id, quantity: 2 }, 'https://gift.example.com');
    const gifts = ['ABCD', 'WXYZ'].map((code, index) => ({ frame_number: index + 1, public_url: `${input.origin}/g/${code}` }));
    const batch = { id: 'verification', quantity: 2, template_config: input.template };
    const stream = await exportBatch(batch, gifts, { stream: true });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    assert.equal(Object.values(zip.files).filter((file) => !file.dir).length, 2);
    const images = [];
    const source = await sharp(path.join(__dirname, '..', input.template.artwork)).removeAlpha().raw().toBuffer();
    for (const gift of gifts) {
        const image = await zip.file(`frames-verification/${gift.frame_number}.png`).async('nodebuffer');
        images.push(image);
        const metadata = await sharp(image).metadata();
        assert.equal(metadata.width, 1536);
        assert.equal(metadata.height, 1024);
        assert.equal(metadata.density, 72);
        assert.ok(image.length < 5 * 1024 * 1024, 'Native PNG should remain below 5 MiB for this artwork');
        const pixels = await sharp(image).removeAlpha().raw().toBuffer();
        const expectedQr = await sharp(await require('qrcode').toBuffer(gift.public_url, {
            width: 110, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#C80000', light: '#FCEBC9' },
        })).removeAlpha().raw().toBuffer();
        const actualQr = await sharp(image).extract({ left: 1223, top: 665, width: 110, height: 110 }).removeAlpha().raw().toBuffer();
        assert.ok(actualQr.equals(expectedQr), 'QR must occupy the agreed borderless 110x110 box at (1223, 665)');
        for (let row = 0; row < 1024; row++) {
            const start = row * 1536 * 3;
            if (row < 665 || row >= 775) {
                assert.ok(pixels.subarray(start, start + 1536 * 3).equals(source.subarray(start, start + 1536 * 3)));
            } else {
                assert.ok(pixels.subarray(start, start + 1223 * 3).equals(source.subarray(start, start + 1223 * 3)));
                assert.ok(pixels.subarray(start + 1333 * 3, start + 1536 * 3).equals(source.subarray(start + 1333 * 3, start + 1536 * 3)));
            }
        }
        const { data, info } = await sharp(image).extract({ left: 1223, top: 665, width: 110, height: 110 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, gift.public_url);
    }
    assert.equal(images[0].equals(images[1]), false);
    await assert.rejects(() => exportBatch(batch, gifts.slice(0, 1)), /incomplete/);
});

test('on-demand batches retry code collisions and return an existing batch for a repeated request', async () => {
    const dbPath = path.resolve(__dirname, '../api/_lib/db.js');
    const authPath = path.resolve(__dirname, '../api/_lib/auth.js');
    const handlerPath = path.resolve(__dirname, '../api/admin/batches.js');
    const originalDb = require.cache[dbPath];
    const originalAuth = require.cache[authPath];
    const originalOrigin = process.env.PUBLIC_SITE_URL;
    const requestKey = '11111111-1111-4111-8111-111111111111';
    let insertAttempts = 0;
    let existingId = null;
    const payloads = [];
    require.cache[dbPath] = { exports: { sql: async (strings, ...values) => {
        const query = strings.join('?');
        if (query.includes('WITH new_batch')) {
            insertAttempts++;
            const payload = JSON.parse(values.find((value) => typeof value === 'string' && value.startsWith('[{')));
            payloads.push(payload);
            assert.equal(payload.length, 3);
            assert.equal(new Set(payload.map((item) => item.code)).size, 3);
            assert.ok(payload.every((item) => /^[A-HJ-NP-Z2-9]{6}$/.test(item.code)));
            assert.match(query, /INSERT INTO gifts/);
            assert.doesNotMatch(query, /UPDATE gifts|FOR UPDATE SKIP LOCKED/);
            if (insertAttempts === 1) throw Object.assign(new Error('Simulated code collision'), { code: '23505' });
            existingId = values[0];
            return [{ id: existingId, assigned: 3 }];
        }
        return existingId ? [{ id: existingId }] : [];
    } } };
    require.cache[authPath] = { exports: { requireSession: () => ({ role: 'admin', sub: 1 }) } };
    process.env.PUBLIC_SITE_URL = 'https://gift.example.com';
    delete require.cache[handlerPath];
    try {
        const handler = require(handlerPath);
        const req = { method: 'POST', query: {}, body: { templateId: templates[0].id, quantity: 3, requestKey } };
        const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
        await handler(req, res);
        assert.equal(res.code, 201);
        assert.equal(insertAttempts, 2);
        assert.notDeepEqual(payloads[0], payloads[1]);
        const id = res.data.batch.id;
        await handler(req, res);
        assert.equal(res.code, 200);
        assert.equal(res.data.batch.id, id);
        assert.equal(insertAttempts, 2);
    } finally {
        delete require.cache[handlerPath];
        if (originalDb) require.cache[dbPath] = originalDb; else delete require.cache[dbPath];
        if (originalAuth) require.cache[authPath] = originalAuth; else delete require.cache[authPath];
        if (originalOrigin === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = originalOrigin;
    }
});