const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { sql } = require('../_lib/db');
const { requireSession } = require('../_lib/auth');
const { templates, batchInput, exportBatch, configuredSiteUrl } = require('../_lib/frames');
const { generateCodes } = require('../_lib/codes');

let exporting = false;
const jobs = new Map();
const uuidPattern = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

async function prepareExport(job, batch, gifts) {
    try {
        const zip = await exportBatch(batch, gifts, { stream: true, onFrame: (number) => { job.completed = number; } });
        await pipeline(zip, fs.createWriteStream(job.file, { flags: 'wx', mode: 0o600 }));
        job.bytes = (await fs.promises.stat(job.file)).size;
        job.status = 'ready';
    } catch (error) {
        job.status = 'failed';
        job.error = error.code === 'ENOENT' ? 'Template artwork is missing on the server.' : error.code === 'ENOSPC' ? 'The server has insufficient disk space for this export.' : 'Frame export failed. Check the artwork and QR settings, then retry.';
        console.error('Frame export failed:', error.code || error.name);
        await fs.promises.rm(job.file, { force: true }).catch(() => {});
    } finally {
        exporting = false;
        setTimeout(() => {
            jobs.delete(job.id);
            fs.promises.rm(job.file, { force: true }).catch(() => {});
        }, 30 * 60 * 1000).unref();
    }
}

module.exports = async (req, res) => {
    const session = requireSession(req, res, { role: 'admin' });
    if (!session) return;
    if (req.method === 'GET' && req.query?.job && !req.query.download) {
        const job = jobs.get(req.query.job);
        if (!job) return res.status(404).json({ error: 'Export expired. Prepare a new download from Recent Batches.' });
        return res.status(200).json({ status: job.status, completed: job.completed, quantity: job.quantity, error: job.error });
    }
    if (req.method === 'POST' && req.query?.prepare) {
        if (!uuidPattern.test(req.query.prepare)) return res.status(400).json({ error: 'Invalid batch ID' });
        if (exporting) return res.status(429).json({ error: 'Another export is running. Try again shortly.' });
        if (jobs.size >= 5) return res.status(429).json({ error: 'Export cache is full. Try again after older downloads expire.' });
        exporting = true;
        try {
            const [batch] = await sql`SELECT * FROM frame_batches WHERE id = ${req.query.prepare}`;
            if (!batch) return res.status(404).json({ error: 'Batch not found' });
            const gifts = await sql`SELECT frame_number, public_url FROM gifts WHERE batch_id = ${batch.id} ORDER BY frame_number`;
            if (gifts.length !== batch.quantity) return res.status(409).json({ error: 'This batch is incomplete; download cannot be prepared.' });
            const id = crypto.randomUUID();
            const job = { id, batchId: batch.id, status: 'rendering', completed: 0, quantity: batch.quantity, file: path.join(os.tmpdir(), `rk-frames-${id}.zip`) };
            jobs.set(id, job);
            void prepareExport(job, batch, gifts);
            return res.status(202).json({ job: id });
        } finally {
            if (![...jobs.values()].some((job) => job.status === 'rendering')) exporting = false;
        }
    }
    if (req.method === 'GET' && req.query?.download) {
        if (!uuidPattern.test(req.query.download)) return res.status(400).json({ error: 'Invalid batch ID' });
        const job = jobs.get(req.query.job);
        if (!job || job.batchId !== req.query.download || job.status !== 'ready') return res.status(409).json({ error: 'Prepare the ZIP from Recent Batches before downloading.' });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="frames-${job.batchId}.zip"`);
        res.setHeader('Content-Length', job.bytes);
        res.setHeader('Cache-Control', 'no-store');
        await pipeline(fs.createReadStream(job.file), res);
        return;
    }
    if (req.method === 'GET') {
        const batches = await sql`SELECT id, template_name, quantity, site_url, created_at FROM frame_batches ORDER BY created_at DESC LIMIT 100`;
        return res.status(200).json({ batches, templates, codeLength: 6, siteUrl: configuredSiteUrl() });
    }
    if (req.method === 'POST') {
        let input;
        try { input = batchInput(req.body); }
        catch (error) { return res.status(400).json({ error: error.message }); }
        const id = crypto.randomUUID();
        const requestKey = String(req.body.requestKey || '');
        if (!uuidPattern.test(requestKey)) return res.status(400).json({ error: 'Invalid batch request key' });
        const [existing] = await sql`SELECT id FROM frame_batches WHERE request_key = ${requestKey}`;
        if (existing) return res.status(200).json({ batch: existing });
        for (let attempt = 0; attempt < 5; attempt++) {
            const payload = generateCodes(input.quantity).map((code, index) => ({ code, number: index + 1, url: `${input.origin}/g/${code}` }));
            try {
                await sql`
                WITH new_batch AS (
                    INSERT INTO frame_batches (id, request_key, template_name, template_config, quantity, site_url, created_by)
                    VALUES (${id}::uuid, ${requestKey}::uuid, ${input.template.name}, ${JSON.stringify(input.template)}::jsonb, ${input.quantity}, ${input.origin}, ${session.sub})
                    RETURNING id
                ), assigned AS (
                    INSERT INTO gifts (access_code, batch_id, frame_number, public_url)
                    SELECT item->>'code', new_batch.id, (item->>'number')::integer, item->>'url'
                    FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb) AS item, new_batch
                    RETURNING id
                )
                SELECT id, (SELECT count(*) FROM assigned) AS assigned FROM new_batch
                `;
                return res.status(201).json({ batch: { id } });
            } catch (error) {
                if (error.code !== '23505') throw error;
                const [duplicate] = await sql`SELECT id FROM frame_batches WHERE request_key = ${requestKey}`;
                if (duplicate) return res.status(200).json({ batch: duplicate });
            }
        }
        return res.status(409).json({ error: 'Could not allocate unique gift codes. Please retry.' });
    }
    res.status(405).json({ error: 'Method not allowed' });
};