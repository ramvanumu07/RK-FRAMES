/**
 * One-off cleanup: removes the disposable test rows created while
 * QA-testing the access-code flow. Safe to run anytime; harmless if
 * the rows don't exist.
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function main() {
    const sql = neon(process.env.DATABASE_URL);
    const codes = ['TESTEMPTY', 'TESTEMPTY2', 'TESTFILLED', 'PIHOK51'];
    for (const code of codes) {
        await sql`DELETE FROM gifts WHERE access_code = ${code}`;
    }
    console.log('Removed test rows:', codes.join(', '));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
