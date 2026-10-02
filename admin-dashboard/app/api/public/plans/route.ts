import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Online checkout is temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await db.query(
      "SELECT p.id,p.name,p.price_paise,p.validity_hours,p.time_limit_hours,p.quota_mb,p.simultaneous_users,(SELECT count(*)::int FROM vouchers v WHERE v.plan_id=p.id AND v.status='unused') AS stock FROM plans p WHERE p.active=true ORDER BY p.price_paise",
    );
    return NextResponse.json(
      { plans: result.rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Could not load the public plan catalogue", error);
    return NextResponse.json(
      { error: "Online checkout is temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
