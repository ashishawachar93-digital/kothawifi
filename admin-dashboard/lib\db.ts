import { Pool } from "pg";
const globalForPool = globalThis as unknown as { pgPool?: Pool };
export const db = globalForPool.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("localhost") ? undefined : { rejectUnauthorized: false }, max: 5 });
if (process.env.NODE_ENV !== "production") globalForPool.pgPool = db;
