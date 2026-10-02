import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
let done = false;
export async function ensureInitialAdmin() { if (done) return; const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(); const password = process.env.ADMIN_PASSWORD; if (!email || !password || password.length < 10) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) before first use"); const hash = await bcrypt.hash(password, 12); await db.query("INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING", [email,hash]); done = true; }
