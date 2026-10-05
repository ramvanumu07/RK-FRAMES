require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { sql } = require('../api/_lib/db');

async function main() {
    const directory = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `before-frame-batches-${Date.now()}.ndjson`);
    const users = await sql`SELECT to_jsonb(record) AS record FROM users AS record`;
    fs.writeFileSync(file, users.map(({ record }) => JSON.stringify({ table: 'users', record })).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
    const batches = await sql`SELECT to_jsonb(record) AS record FROM frame_batches AS record`;
    fs.appendFileSync(file, batches.map(({ record }) => JSON.stringify({ table: 'frame_batches', record })).join('\n') + '\n');
    let cursor = 0;
    let count = 0;
    while (true) {
        const page = await sql`SELECT to_jsonb(record) AS record FROM gifts AS record WHERE id > ${cursor} ORDER BY id LIMIT 1000`;
        if (!page.length) break;
        fs.appendFileSync(file, page.map(({ record }) => JSON.stringify({ table: 'gifts', record })).join('\n') + '\n');
        cursor = page[page.length - 1].record.id;
        count += page.length;
    }
    console.log(`Backup saved locally: ${users.length} users, ${count} gifts, ${batches.length} batches. No record values displayed.`);
}

main().catch((error) => {
    console.error(`Database backup failed (${error.name}, ${error.code || 'no code'}). Migration has not been run.`);
    process.exit(1);
});