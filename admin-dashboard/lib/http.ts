import { NextResponse } from "next/server";
import { getAdminId } from "@/lib/auth";
export async function requireAdmin() { const id = await getAdminId(); if (!id) return { id: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }; return { id, response: null }; }
export function fail(error: unknown) { console.error(error); return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 }); }
