/**
 * One-off helper to seed a couple of test rows for manual QA of the
 * access-code flow. Not used in production. Run with:
 *   node scripts/seed-test-data.js
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function main() {
    const sql = neon(process.env.DATABASE_URL);

    await sql`
        INSERT INTO gifts (access_code)
        VALUES ('TESTEMPTY')
        ON CONFLICT (access_code) DO NOTHING
    `;

    await sql`
        INSERT INTO gifts (access_code)
        VALUES ('TESTEMPTY2')
        ON CONFLICT (access_code) DO NOTHING
    `;

    await sql`
        INSERT INTO gifts (access_code, groom_name, bride_name, wedding_date, filled_at)
        VALUES ('TESTFILLED', 'Arjun', 'Meera', '2020-03-14', now())
        ON CONFLICT (access_code) DO UPDATE SET
            groom_name = EXCLUDED.groom_name,
            bride_name = EXCLUDED.bride_name,
            wedding_date = EXCLUDED.wedding_date,
            filled_at = EXCLUDED.filled_at
    `;

    console.log('Seeded TESTEMPTY (blank) and TESTFILLED (Arjun & Meera, 2020-03-14).');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
