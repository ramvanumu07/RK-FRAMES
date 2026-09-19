/**
 * Shared Neon Postgres client for all serverless API routes.
 * Uses the HTTP-based serverless driver — no persistent connections,
 * safe to call fresh in every function invocation.
 */
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
