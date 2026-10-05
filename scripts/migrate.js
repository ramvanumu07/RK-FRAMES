/**
 * One-time setup script: creates the `users` and `gifts` tables (if they
 * don't already exist) and seeds the first admin account from ADMIN_EMAIL /
 * ADMIN_PASSWORD in .env. Safe to re-run — uses IF NOT EXISTS / ON CONFLICT
 * so it won't clobber existing data.
 *
 * Run with: node scripts/migrate.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { neon } = require('@neondatabase/serverless');

async function main() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set (check your .env file)');
    }
    const sql = neon(process.env.DATABASE_URL);

    console.log('Creating tables (if not present)...');

    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id serial PRIMARY KEY,
            email text UNIQUE NOT NULL,
            password_hash text NOT NULL,
            role text NOT NULL DEFAULT 'staff',
            created_at timestamptz DEFAULT now()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS gifts (
            id serial PRIMARY KEY,
            access_code text UNIQUE NOT NULL,
            groom_name text,
            bride_name text,
            wedding_date date,
            filled_at timestamptz,
            created_at timestamptz DEFAULT now()
        )
    `;

    console.log('Tables ready.');

    await sql.transaction([
        sql`CREATE TABLE IF NOT EXISTS frame_batches (
            id uuid PRIMARY KEY,
            request_key uuid UNIQUE NOT NULL,
            template_name text NOT NULL,
            template_config jsonb NOT NULL,
            quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
            site_url text NOT NULL,
            created_by integer REFERENCES users(id),
            created_at timestamptz NOT NULL DEFAULT now()
        )`,
        sql`ALTER TABLE gifts ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES frame_batches(id)`,
        sql`ALTER TABLE gifts ADD COLUMN IF NOT EXISTS frame_number integer`,
        sql`ALTER TABLE gifts ADD COLUMN IF NOT EXISTS public_url text`,
        sql`CREATE UNIQUE INDEX IF NOT EXISTS gifts_batch_number ON gifts(batch_id, frame_number)`,
    ]);

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (email && password && password !== 'change-me-strong-password') {
        const passwordHash = await bcrypt.hash(password, 10);
        await sql`
            INSERT INTO users (email, password_hash, role)
            VALUES (${email}, ${passwordHash}, 'admin')
            ON CONFLICT (email) DO NOTHING
        `;
        console.log(`Admin account ready: ${email}`);
    } else {
        console.log('Skipped admin seed — set ADMIN_EMAIL/ADMIN_PASSWORD in .env first.');
    }

    console.log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
