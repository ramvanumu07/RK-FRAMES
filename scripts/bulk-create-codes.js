/**
 * Bulk-provisions a large batch of empty gift rows (access_code only,
 * no couple data yet) so codes can be printed/QR'd ahead of time and
 * filled in later by buyers. Uses the SAME charset/length as
 * api/admin/gifts.js's generateAccessCode() (4 chars, no 0/O).
 *
 * Generates every possible code (34^4 = 1,336,336), shuffles it,
 * removes anything already in the DB, and inserts the first N —
 * guarantees no duplicates without relying on retry-on-collision.
 *
 * Usage: node scripts/bulk-create-codes.js [count]
 *   (defaults to 100000 if no count is given)
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const CODE_CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
const CODE_LENGTH = 4;
const BATCH_SIZE = 1000;

function allPossibleCodes() {
    const codes = [];
    const n = CODE_CHARS.length;
    for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
            for (let c = 0; c < n; c++) {
                for (let d = 0; d < n; d++) {
                    codes.push(CODE_CHARS[a] + CODE_CHARS[b] + CODE_CHARS[c] + CODE_CHARS[d]);
                }
            }
        }
    }
    return codes;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries a flaky network call a few times with backoff before giving up. */
async function withRetry(fn, attempts = 5) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === attempts - 1) throw err;
            const delay = 1000 * Math.pow(2, i);
            console.warn(`  (retrying after error: ${err.message || err}, wait ${delay}ms)`);
            await sleep(delay);
        }
    }
}

async function main() {
    const count = Number(process.argv[2]) || 100000;
    const sql = neon(process.env.DATABASE_URL);

    console.log(`Target: ${count} new codes (${CODE_LENGTH} chars from a ${CODE_CHARS.length}-char alphabet, max ${Math.pow(CODE_CHARS.length, CODE_LENGTH)} possible).`);

    console.log('Fetching existing access codes...');
    const existingRows = await withRetry(() => sql`SELECT access_code FROM gifts`);
    const existing = new Set(existingRows.map((r) => r.access_code));
    console.log(`  ${existing.size} existing codes will be skipped.`);

    console.log('Generating + shuffling the full code space...');
    const candidates = shuffle(allPossibleCodes()).filter((c) => !existing.has(c));

    if (candidates.length < count) {
        throw new Error(`Only ${candidates.length} unused codes remain — cannot create ${count}.`);
    }
    const toInsert = candidates.slice(0, count);

    console.log(`Inserting ${toInsert.length} rows in batches of ${BATCH_SIZE}...`);
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map((_, idx) => `($${idx + 1})`).join(',');
        await withRetry(() => sql.query(
            `INSERT INTO gifts (access_code) VALUES ${placeholders} ON CONFLICT (access_code) DO NOTHING`,
            batch
        ));
        inserted += batch.length;
        console.log(`  ${inserted} / ${toInsert.length}`);
    }

    console.log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
