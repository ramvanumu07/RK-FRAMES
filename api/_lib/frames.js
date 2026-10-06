const path = require('path');
const sharp = require('sharp');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const JSZip = require('jszip');
const { Readable } = require('stream');

const templates = [{
    id: 'cosmic-heart-v3', name: 'Cosmic Radha Krishna',
    artwork: 'assets/images/Cosmic Radha Krishna with Heart QR Frame.png',
    width: 1536, height: 1024, density: 72,
    centerX: 1278, centerY: 720, size: 110, sourceWidth: 1536,
    dark: '#C80000', light: '#FCEBC9', margin: 0,
}];

function artworkPath(artwork) {
    const legacy = 'Cosmic Radha Krishna with Heart QR Frame.png';
    const relative = artwork === legacy ? `assets/images/${legacy}` : artwork;
    return path.join(__dirname, '../..', relative);
}

function siteUrl(value) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Enter a site origin such as https://your-domain.com');
    }
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname) && !/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
        throw new Error('Use HTTPS for a public site');
    }
    return url.origin;
}

function batchInput(body, configuredOrigin = process.env.PUBLIC_SITE_URL) {
    const template = templates.find((item) => item.id === body?.templateId);
    const quantity = Number(body?.quantity);
    if (!template || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        throw new Error('Choose a template and a quantity between 1 and 100');
    }
    if (!configuredOrigin) throw new Error('PUBLIC_SITE_URL must be configured on the server before generating frames');
    const origin = siteUrl(configuredOrigin);
    return { template, quantity, origin };
}

async function renderFrame(template, url, background) {
    const scale = template.width / template.sourceWidth;
    const size = Math.round(template.size * scale);
    const left = Math.round(template.centerX * scale) - Math.floor(size / 2);
    const top = Math.round(template.centerY * scale) - Math.floor(size / 2);
    const qr = await QRCode.toBuffer(url, {
        width: size, margin: template.margin, errorCorrectionLevel: 'M',
        color: { dark: template.dark, light: template.light },
    });
    const base = background || await sharp(artworkPath(template.artwork))
        .resize(template.width, template.height).png().toBuffer();
    const frame = await sharp(base).composite([{ input: qr, left, top }])
        .withMetadata({ density: template.density }).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
    const { data, info } = await sharp(frame).extract({ left, top, width: size, height: size })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    if (decoded?.data !== url) throw new Error('QR verification failed. Shorten the site URL or increase QR size.');
    return frame;
}

async function exportBatch(batch, gifts, { stream = false, onFrame = () => {} } = {}) {
    if (gifts.length !== batch.quantity) throw new Error('This batch is incomplete; export stopped.');
    const template = batch.template_config;
    const background = await sharp(artworkPath(template.artwork))
        .resize(template.width, template.height).png().toBuffer();
    const zip = new JSZip();
    const folder = zip.folder(`frames-${batch.id}`);
    for (const gift of gifts) {
        folder.file(`${gift.frame_number}.png`, Readable.from((async function* () {
            yield await renderFrame(template, gift.public_url, background);
            onFrame(gift.frame_number);
        })()));
    }
    if (stream) return new Readable().wrap(zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'STORE' }));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

module.exports = { templates, batchInput, renderFrame, exportBatch };