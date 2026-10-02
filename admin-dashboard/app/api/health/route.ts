import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ status: "database_unavailable" }, { status: 503 });
  }

  try {
    const result = await db.query(
      "SELECT to_regclass('public.plans') IS NOT NULL AS plans, to_regclass('public.vouchers') IS NOT NULL AS vouchers, to_regclass('public.payment_intents') IS NOT NULL AS payment_intents, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='time_limit_hours') AS current_schema, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_intents' AND column_name='last_status_checked_at') AS status_reconciliation_schema",
    );
    if (!result.rows[0].plans || !result.rows[0].vouchers || !result.rows[0].payment_intents || !result.rows[0].current_schema || !result.rows[0].status_reconciliation_schema) {
      return NextResponse.json({ status: "migration_required" }, { status: 503 });
    }

    const missingPaymentSettings = [
      !process.env.CASHFREE_APP_ID && "CASHFREE_APP_ID",
      !process.env.CASHFREE_SECRET_KEY && "CASHFREE_SECRET_KEY",
      !process.env.CASHFREE_WEBHOOK_SECRET && "CASHFREE_WEBHOOK_SECRET",
      !["sandbox", "production"].includes(process.env.CASHFREE_ENV || "") && "CASHFREE_ENV",
    ].filter(Boolean);
    if (missingPaymentSettings.length) {
      return NextResponse.json(
        { status: "payment_configuration_required", missing: missingPaymentSettings },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if ((process.env.SESSION_SECRET?.length || 0) < 32 || !process.env.ADMIN_EMAIL || (process.env.ADMIN_PASSWORD?.length || 0) < 10) {
      return NextResponse.json({ status: "app_configuration_required" }, { status: 503 });
    }

    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Database health check failed", error);
    return NextResponse.json({ status: "database_unavailable" }, { status: 503 });
  }
}
