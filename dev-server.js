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
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
};

// Long-lived cache for assets that only change when we redeploy — the
// browser skips re-downloading these on repeat visits entirely.
const CACHEABLE_EXTENSIONS = new Set(['.png', '.webp', '.mp4', '.css', '.js']);

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
            if (!data) { resolve({}); return; }
            try {
                resolve(JSON.parse(data));
            } catch {
                resolve({});
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
    req.query = query;
    req.body = await readBody(req);
    enhanceResponse(res);
    const mod = require(handlerPath);
    try {
        await mod(req, res);
    } catch (err) {
        console.error(err);
        if (!res.writableEnded) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

function serveStatic(req, res, pathname) {
    if (pathname === '/admin') pathname = '/admin.html';
    let filePath = path.join(ROOT, pathname === '/' ? '/index.html' : pathname);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
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
        if (CACHEABLE_EXTENSIONS.has(ext)) {
            headers['Cache-Control'] = 'public, max-age=86400';
        }
        res.writeHead(200, headers);
        res.end(data);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (API_ROUTES[pathname]) {
        const query = Object.fromEntries(url.searchParams.entries());
        await handleApi(API_ROUTES[pathname], req, res, query);
        return;
    }

    serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
    console.log(`Dev server running at http://localhost:${PORT}`);
});
