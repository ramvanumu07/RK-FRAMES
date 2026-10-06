/**
 * Node HTTP server: serves the static site files and routes /api/*
 * requests to the handler files in api/. Used both for local
 * development (`npm run dev`) and as the actual production server when
 * deployed on Render (`npm start`) — Render runs a persistent Node
 * process rather than per-file serverless functions, so this same file
 * works unchanged in both environments.
 *
 * Usage: node dev-server.js
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;

const API_ROUTES = {
    '/api/gift': './api/gift.js',
    '/api/gift-fill': './api/gift-fill.js',
    '/api/admin/login': './api/admin/login.js',
    '/api/admin/logout': './api/admin/logout.js',
    '/api/admin/me': './api/admin/me.js',
    '/api/admin/gifts': './api/admin/gifts.js',
    '/api/admin/gift': './api/admin/gift.js',
    '/api/admin/users': './api/admin/users.js',
    '/api/admin/batches': './api/admin/batches.js',
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
};

// Long-lived cache for assets that only change when we redeploy — the
// browser skips re-downloading these on repeat visits entirely.
const CACHEABLE_EXTENSIONS = new Set(['.png', '.webp', '.mp4', '.webm']);

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 16384) { reject(Object.assign(new Error('Request too large'), { status: 413 })); return; }
            data += chunk;
        });
        req.on('end', () => {
            if (!data) { resolve({}); return; }
            try {
                resolve(JSON.parse(data));
            } catch {
                reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
            }
        });
        req.on('error', reject);
    });
}

function enhanceResponse(res) {
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (payload) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
    };
    return res;
}

async function handleApi(handlerPath, req, res, query) {
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cross-site writes are not allowed' }));
        return;
    }
    req.query = query;
    req.body = await readBody(req);
    enhanceResponse(res);
    res.setHeader('Cache-Control', 'no-store');
    try {
        const mod = require(handlerPath);
        await mod(req, res);
    } catch (err) {
        console.error('API request failed:', err.code || err.name);
        if (res.headersSent) res.destroy();
        else if (!res.writableEnded) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

function serveStatic(req, res, pathname) {
    try { pathname = decodeURIComponent(pathname); }
    catch { res.writeHead(400); res.end('Invalid path'); return; }
    if (pathname === '/vendor/lucide.js') pathname = '/node_modules/lucide/dist/umd/lucide.js';
    const isVendor = pathname === '/node_modules/lucide/dist/umd/lucide.js';
    if (pathname.split(/[\\/]/).some((part) => part.startsWith('.')) ||
        (!isVendor && /^\/(?:api|scripts|node_modules|backups)(?:\/|$)/.test(pathname)) ||
        /\.(?:log|json|zip)$/i.test(pathname)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    if (/^\/g\/[A-Z0-9]{4,64}$/i.test(pathname)) pathname = '/index.html';
    if (pathname === '/admin') pathname = '/admin.html';
    const legacyAssets = {
        '/admin.js': '/assets/js/admin.js',
        '/script.js': '/assets/js/script.js',
        '/utils.js': '/assets/js/utils.js',
        '/styles.css': '/assets/styles/styles.css',
        '/admin.css': '/assets/styles/admin.css',
        '/screen2.webp': '/assets/images/screen2.webp',
        '/Cosmic Radha Krishna with Heart QR Frame.png': '/assets/images/Cosmic Radha Krishna with Heart QR Frame.png',
        '/Krishna_and_Radha_meeting_1080p_20260912151343.mp4': '/assets/videos/Krishna_and_Radha_meeting_1080p_20260912151343.mp4',
    };
    pathname = legacyAssets[pathname] || pathname;
    const publicScripts = ['/assets/js/admin.js', '/assets/js/script.js', '/assets/js/utils.js', '/assets/styles/styles.css', '/assets/styles/admin.css'];
    const publicMedia = /^\/assets\/(?:images\/[^/\\]+\.(?:png|webp|jpg|jpeg|gif|ico)|videos\/[^/\\]+\.(?:mp4|webm))$/i.test(pathname);
    if (!isVendor && pathname !== '/' && !['/index.html', '/admin.html', ...publicScripts].includes(pathname) && !publicMedia) {
        res.writeHead(404); res.end('Not found'); return;
    }
    let filePath = path.join(ROOT, pathname === '/' ? '/index.html' : pathname);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    if (['.mp4', '.webm'].includes(path.extname(filePath))) {
        fs.stat(filePath, (error, stat) => {
            if (error) { res.writeHead(404); res.end('Not found'); return; }
            const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
            const start = range ? Number(range[1]) : 0;
            const end = range?.[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
            if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
            const headers = { 'Content-Type': MIME_TYPES[path.extname(filePath)], 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
            if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
            res.writeHead(range ? 206 : 200, headers);
            fs.createReadStream(filePath, { start, end }).on('error', () => res.destroy()).pipe(res);
        });
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath);
        const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
        if (['.js', '.css'].includes(ext)) headers['Cache-Control'] = 'no-cache';
        if (CACHEABLE_EXTENSIONS.has(ext)) {
            headers['Cache-Control'] = 'public, max-age=86400';
        }
        res.writeHead(200, headers);
        res.end(data);
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (API_ROUTES[pathname]) {
        const query = Object.fromEntries(url.searchParams.entries());
        await handleApi(API_ROUTES[pathname], req, res, query);
        return;
    }

    serveStatic(req, res, pathname);
    } catch (error) {
        if (!res.headersSent) {
            res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.status ? error.message : 'Request failed' }));
        }
    }
});

server.listen(PORT, () => {
    console.log(`Dev server running at http://localhost:${PORT}`);
});
