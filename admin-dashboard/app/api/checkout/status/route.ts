import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { allocateVoucher } from "@/lib/allocate";
import { getCashfreeConfig, fetchCashfreeOrderDetails, fetchCashfreeOrderPayments } from "@/lib/cashfree";
import { decryptSecret } from "@/lib/secret";

export const runtime = "nodejs";

const privateOptions = { headers: { "Cache-Control": "no-store, private" } };

async function readStoredPayment(orderId: string) {
  const result = await db.query(
    "SELECT p.status,p.voucher_id,v.username,v.password,v.code,pl.name plan_name FROM payments p JOIN plans pl ON pl.id=p.plan_id LEFT JOIN vouchers v ON v.id=p.voucher_id WHERE p.provider_order_id=$1 ORDER BY p.created_at DESC LIMIT 1",
    [orderId],
  );
  if (!result.rowCount) return null;
  const payment = result.rows[0];
  return {
    status: payment.status,
    plan: payment.plan_name,
    credential: payment.username,
    password: decryptSecret(payment.password),
    code: payment.code,
  };
}

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Payment status is temporarily unavailable." }, { ...privateOptions, status: 503 });
  }

  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId || !/^kw_[a-f0-9]{24}$/i.test(orderId)) {
    return NextResponse.json({ error: "Invalid order ID" }, { ...privateOptions, status: 400 });
  }

  try {
    const alreadyPaid = await readStoredPayment(orderId);
    if (alreadyPaid) return NextResponse.json(alreadyPaid, privateOptions);

    let intent = (
      await db.query(
        "SELECT plan_id,amount_paise,customer_phone,status FROM payment_intents WHERE provider_order_id=$1",
        [orderId],
      )
    ).rows[0];
    if (!intent) {
      // The old live site used uppercase KW_ order IDs and sent buyers back to
      // kothawifi.in with ?payment=return. Recover only Cashfree orders whose
      // stored return URL proves they belong to this WiFi checkout.
      if (!/^KW_[a-f0-9]{24}$/i.test(orderId)) {
        return NextResponse.json({ error: "This payment order is not registered here." }, { ...privateOptions, status: 404 });
      }

      const legacyCashfree = getCashfreeConfig();
      if (!legacyCashfree) {
        return NextResponse.json({ error: "Payment status verification is not configured." }, { ...privateOptions, status: 503 });
      }

      let legacyOrder;
      try {
        legacyOrder = await fetchCashfreeOrderDetails(orderId, legacyCashfree);
      } catch (error) {
        console.error("Could not verify the legacy Cashfree order", error);
        return NextResponse.json({ error: "This older payment could not be checked yet." }, { ...privateOptions, status: 503 });
      }

      let returnUrl: URL | null = null;
      try {
        returnUrl = legacyOrder.order_meta?.return_url ? new URL(legacyOrder.order_meta.return_url) : null;
      } catch {
        returnUrl = null;
      }
      const returnMatchesKotha = returnUrl
        && ["kothawifi.in", "www.kothawifi.in"].includes(returnUrl.hostname.toLowerCase())
        && returnUrl.searchParams.get("payment") === "return";
      if (legacyOrder.order_id !== orderId || legacyOrder.order_currency !== "INR" || !returnMatchesKotha) {
        return NextResponse.json({ error: "This older payment does not match the Kotha WiFi checkout." }, { ...privateOptions, status: 404 });
      }

      const legacyAmountPaise = Math.round(Number(legacyOrder.order_amount) * 100);
      if (!Number.isSafeInteger(legacyAmountPaise) || legacyAmountPaise < 0) {
        return NextResponse.json({ error: "The older payment amount could not be verified." }, { ...privateOptions, status: 409 });
      }

      const matchingPlans = await db.query(
        "SELECT id FROM plans WHERE active=true AND price_paise=$1 ORDER BY id LIMIT 2",
        [legacyAmountPaise],
      );
      if (matchingPlans.rowCount !== 1) {
        return NextResponse.json({ error: "This older payment does not match exactly one active voucher plan." }, { ...privateOptions, status: 409 });
      }

      const customerPhone = String(legacyOrder.customer_details?.customer_phone ?? "").replace(/\D/g, "") || `legacy:${orderId}`;
      await db.query(
        "INSERT INTO payment_intents(provider_order_id,plan_id,amount_paise,customer_phone,status) VALUES($1,$2,$3,$4,'PENDING') ON CONFLICT(provider_order_id) DO NOTHING",
        [orderId, matchingPlans.rows[0].id, legacyAmountPaise, customerPhone],
      );
      intent = (
        await db.query(
          "SELECT plan_id,amount_paise,customer_phone,status FROM payment_intents WHERE provider_order_id=$1",
          [orderId],
        )
      ).rows[0];
      if (!intent || Number(intent.amount_paise) !== legacyAmountPaise || intent.plan_id !== matchingPlans.rows[0].id) {
        return NextResponse.json({ error: "The older payment is already linked to a different order." }, { ...privateOptions, status: 409 });
      }
    }
    if (intent.status === "FAILED") return NextResponse.json({ status: "FAILED" }, privateOptions);

    const cashfree = getCashfreeConfig();
    if (!cashfree) {
      return NextResponse.json({ error: "Payment status verification is not configured." }, { ...privateOptions, status: 503 });
    }

    // The webhook is the primary signal. This throttled server-to-server lookup
    // also fulfills a confirmed payment when the buyer returns before a webhook
    // arrives, or when Cashfree cannot reach the webhook endpoint.
    const check = await db.query(
      "UPDATE payment_intents SET last_status_checked_at=now() WHERE provider_order_id=$1 AND (last_status_checked_at IS NULL OR last_status_checked_at < now()-interval '8 seconds') RETURNING plan_id,amount_paise,customer_phone",
      [orderId],
    );
    if (!check.rowCount) return NextResponse.json({ status: "PENDING" }, privateOptions);

    let payments;
    try {
      payments = await fetchCashfreeOrderPayments(orderId, cashfree);
    } catch (error) {
      console.error("Cashfree payment status lookup failed", error);
      return NextResponse.json({ error: "Payment status is temporarily unavailable." }, { ...privateOptions, status: 503 });
    }

    const successful = payments.find((payment) => payment.payment_status?.toUpperCase() === "SUCCESS");
    if (!successful) {
      const knownFinalFailures = new Set(["FAILED", "USER_DROPPED", "VOID", "EXPIRED"]);
      const isFinalFailure = payments.length > 0 && payments.every((payment) =>
        knownFinalFailures.has(payment.payment_status?.toUpperCase() || ""),
      );
      return NextResponse.json({ status: isFinalFailure ? "FAILED" : "PENDING" }, privateOptions);
    }

    const paymentId = String(successful.cf_payment_id ?? "");
    const amountPaise = Math.round(Number(successful.payment_amount) * 100);
    if (!paymentId || !Number.isSafeInteger(amountPaise)) {
      return NextResponse.json({ error: "Cashfree returned incomplete payment details." }, { ...privateOptions, status: 502 });
    }
    if (amountPaise !== Number(check.rows[0].amount_paise)) {
      console.error("Cashfree order amount does not match the registered payment intent", { orderId });
      return NextResponse.json({ error: "Payment amount could not be verified." }, { ...privateOptions, status: 409 });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const lockedIntent = (
        await client.query(
          "SELECT plan_id,amount_paise,customer_phone FROM payment_intents WHERE provider_order_id=$1 FOR UPDATE",
          [orderId],
        )
      ).rows[0];
      if (!lockedIntent) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "This payment order is not registered here." }, { ...privateOptions, status: 404 });
      }

      if (amountPaise !== Number(lockedIntent.amount_paise)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Payment amount could not be verified." }, { ...privateOptions, status: 409 });
      }

      await allocateVoucher(client, {
        orderId,
        paymentId,
        planId: lockedIntent.plan_id,
        amountPaise,
        phone: lockedIntent.customer_phone,
        event: {
          type: "CASHFREE_STATUS_RECONCILIATION",
          order_id: orderId,
          cf_payment_id: paymentId,
          payment_status: "SUCCESS",
          payment_amount: successful.payment_amount,
        },
      });
      await client.query("UPDATE payment_intents SET status='SUCCESS' WHERE provider_order_id=$1", [orderId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const allocated = await readStoredPayment(orderId);
    return NextResponse.json(allocated || { status: "PENDING" }, privateOptions);
  } catch (error) {
    console.error("Could not verify Cashfree payment status", error);
    return NextResponse.json({ error: "Payment status is temporarily unavailable." }, { ...privateOptions, status: 503 });
  }
}
