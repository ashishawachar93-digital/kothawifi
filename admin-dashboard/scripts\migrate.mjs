import { readFile } from 'node:fs/promises';
import pg from 'pg';
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false } });
try { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); console.log('Database schema applied.'); }
finally { await pool.end(); }
