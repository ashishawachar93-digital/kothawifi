import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCashfreeConfig } from "@/lib/cashfree";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Checkout is temporarily unavailable." }, { status: 503 });
  }

  try {
    const { planId, phone } = await req.json();
    const plan = (
      await db.query(
        "SELECT p.id,p.name,p.price_paise,(SELECT count(*)::int FROM vouchers v WHERE v.plan_id=p.id AND v.status='unused') AS stock FROM plans p WHERE p.id=$1 AND p.active=true",
        [planId],
      )
    ).rows[0];
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    if (!plan.stock) return NextResponse.json({ error: "This plan is sold out right now" }, { status: 409 });

    const digits = String(phone ?? "").replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) {
      return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
    }

    const attempts = await db.query(
      "SELECT count(*)::int n FROM payment_intents WHERE customer_phone=$1 AND created_at>now()-interval '60 seconds'",
      [digits],
    );
    if (attempts.rows[0].n >= 3) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Wait one minute and retry." },
        { status: 429 },
      );
    }

    const cashfree = getCashfreeConfig();
    if (!cashfree || !process.env.CASHFREE_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Cashfree payment and webhook settings are not fully configured." },
        { status: 503 },
      );
    }

    const orderId = `kw_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    await db.query(
      "INSERT INTO payment_intents(provider_order_id,plan_id,amount_paise,customer_phone,status) VALUES($1,$2,$3,$4,'PENDING')",
      [orderId, plan.id, plan.price_paise, digits],
    );

    const origin = process.env.APP_URL || new URL(req.url).origin;
    let response: Response;
    try {
      response = await fetch(`${cashfree.baseUrl}/orders`, {
        method: "POST",
        headers: {
          "x-client-id": cashfree.appId,
          "x-client-secret": cashfree.secret,
          "x-api-version": cashfree.apiVersion,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          order_id: orderId,
          order_amount: Number(plan.price_paise) / 100,
          order_currency: "INR",
          customer_details: {
            customer_id: `wifi_${digits}`,
            customer_phone: digits.slice(-10),
          },
          order_meta: { return_url: `${origin}/buy?order_id={order_id}` },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      console.error("Cashfree order creation request did not complete", error);
      return NextResponse.json(
        { error: "Checkout could not confirm its payment session. Recheck this order before retrying.", orderId },
        { status: 502 },
      );
    }

    let body: { payment_session_id?: string } & Record<string, unknown>;
    try {
      body = (await response.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Cashfree returned an unreadable checkout response. Check this order before retrying.", orderId },
        { status: 502 },
      );
    }

    if (!response.ok) {
      await db.query("UPDATE payment_intents SET status='FAILED' WHERE provider_order_id=$1", [orderId]);
      console.error("Cashfree order creation failed", body);
      return NextResponse.json({ error: "Payment order could not be created" }, { status: 502 });
    }

    if (!body.payment_session_id) {
      console.error("Cashfree order response did not contain a payment session", body);
      return NextResponse.json(
        { error: "Cashfree did not return a payment session. Check this order before retrying.", orderId },
        { status: 502 },
      );
    }

    return NextResponse.json({
      orderId,
      paymentSessionId: body.payment_session_id,
      mode: cashfree.mode,
    });
  } catch (error) {
    console.error("Checkout request failed", error);
    return NextResponse.json({ error: "Checkout request failed" }, { status: 500 });
  }
}
