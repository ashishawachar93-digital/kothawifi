import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters"); return new TextEncoder().encode(s); };
export async function setSession(adminId: string) { const token = await new SignJWT({ sub: adminId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(secret()); (await cookies()).set("kw_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 }); }
export async function getAdminId() { try { const token = (await cookies()).get("kw_session")?.value; if (!token) return null; const { payload } = await jwtVerify(token, secret()); return typeof payload.sub === "string" ? payload.sub : null; } catch { return null; } }
