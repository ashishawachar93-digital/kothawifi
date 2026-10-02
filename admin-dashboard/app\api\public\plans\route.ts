import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(){try{const r=await db.query("SELECT p.id,p.name,p.price_paise,p.validity_hours,p.quota_mb,p.simultaneous_users,(SELECT count(*)::int FROM vouchers v WHERE v.plan_id=p.id AND v.status='unused') AS stock FROM plans p WHERE p.active=true ORDER BY p.price_paise");return NextResponse.json({plans:r.rows});}catch(e){console.error(e);return NextResponse.json({error:'Plans unavailable'},{status:500});}}
