"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { downloadVoucherPdf } from "@/lib/voucher-pdf";

declare global {
  interface Window {
    Cashfree?: (options: { mode: string }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown>;
    };
  }
}

type Plan = {
  id: string;
  name: string;
  price_paise: number;
  validity_hours: number | null;
  quota_mb: number | null;
  simultaneous_users: number;
  stock: number;
};

type CheckoutStatus = {
  status: string;
  plan?: string;
  credential?: string | null;
  password?: string | null;
  code?: string | null;
  error?: string;
};

async function readCheckoutStatus(orderId: string): Promise<CheckoutStatus> {
  const response = await fetch(
    "/api/checkout/status?orderId=" + encodeURIComponent(orderId),
    { cache: "no-store" },
  );
  const result = (await response.json()) as CheckoutStatus;
  if (!response.ok) throw new Error(result.error || "Could not check payment status.");
  return result;
}

export default function BuyPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [phone, setPhone] = useState("");
  const [orderId, setOrderId] = useState("");
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [pdfMessage, setPdfMessage] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const autoDownloadedOrder = useRef("");

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      try {
        const response = await fetch("/api/public/plans", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Plans are temporarily unavailable.");
        if (!cancelled) setPlans(Array.isArray(result.plans) ? result.plans : []);
      } catch (error) {
        if (!cancelled) {
          setPlansError(error instanceof Error ? error.message : "Plans are temporarily unavailable.");
        }
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    }

    void loadPlans();

    const returnedOrderId = new URLSearchParams(window.location.search).get("order_id");
    if (returnedOrderId) setOrderId(returnedOrderId);

    let script = document.querySelector<HTMLScriptElement>("script[data-cashfree-sdk]");
    if (!script) {
      script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.dataset.cashfreeSdk = "true";
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orderId) return;

    let stopped = false;
    let attempts = 0;
    let timer: number | undefined;

    const checkStatus = async () => {
      try {
        const nextStatus = await readCheckoutStatus(orderId);
        if (stopped) return;
        setStatus(nextStatus);
        setStatusError("");

        if (nextStatus.status === "PENDING" && attempts < 15) {
          attempts += 1;
          timer = window.setTimeout(() => void checkStatus(), 4000);
        }
      } catch (error) {
        if (stopped) return;
        setStatusError(error instanceof Error ? error.message : "Could not check payment status.");
        if (attempts < 15) {
          attempts += 1;
          timer = window.setTimeout(() => void checkStatus(), 4000);
        }
      }
    };

    void checkStatus();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [orderId]);

  useEffect(() => {
    const voucher = status?.code || status?.credential;
    if (status?.status !== "SUCCESS" || !orderId || !voucher) return;
    if (autoDownloadedOrder.current === orderId) return;

    autoDownloadedOrder.current = orderId;
    setPdfMessage("Preparing your voucher PDF…");
    void downloadVoucherPdf(status, orderId)
      .then(() => setPdfMessage("Voucher PDF downloaded. Keep it private."))
      .catch(() => {
        autoDownloadedOrder.current = "";
        setPdfMessage("Automatic download did not start. Use the button below.");
      });
  }, [status, orderId]);

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan) return;

    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan.id, phone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Checkout failed.");

      setOrderId(result.orderId);
      if (!window.Cashfree) {
        await new Promise<void>((resolve, reject) => {
          const script = document.querySelector<HTMLScriptElement>("script[data-cashfree-sdk]");
          if (window.Cashfree) {
            resolve();
            return;
          }
          script?.addEventListener("load", () => resolve(), { once: true });
          script?.addEventListener(
            "error",
            () => reject(new Error("Cashfree checkout script failed to load.")),
            { once: true },
          );
          window.setTimeout(
            () =>
              window.Cashfree
                ? resolve()
                : reject(new Error("Cashfree checkout script timed out.")),
            8000,
          );
        });
      }

      if (!window.Cashfree) throw new Error("Cashfree checkout did not load.");
      await window.Cashfree({ mode: result.mode }).checkout({
        paymentSessionId: result.paymentSessionId,
        redirectTarget: "_self",
      });
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Payment could not start.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function refreshPayment() {
    if (!orderId) return;
    setStatusError("");
    try {
      setStatus(await readCheckoutStatus(orderId));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Could not check payment status.");
    }
  }

  async function downloadAgain() {
    if (!status || !orderId) return;
    try {
      setPdfMessage("Preparing your voucher PDF…");
      await downloadVoucherPdf(status, orderId);
      setPdfMessage("Voucher PDF downloaded. Keep it private.");
    } catch {
      setPdfMessage("PDF download could not start. Please try again.");
    }
  }

  return (
    <main className="buy-shell">
      <div className="buy-inner">
        <div className="buy-top">
          <div className="brand">
            <span className="brandmark">KW</span>
            <span>
              <b>Kotha WiFi</b>
              <small>QUICK CONNECT</small>
            </span>
          </div>
          <a href="/">Admin sign in ↗</a>
        </div>

        <div className="buy-title">
          <p className="eyebrow">FAST · SIMPLE · LOCAL</p>
          <h1>Get online with Kotha WiFi</h1>
          <p>Choose a plan and complete secure payment.</p>
        </div>

        {status?.status === "SUCCESS" && (
          <section className="credentials card" aria-live="polite">
            <p className="eyebrow">PAYMENT COMPLETE</p>
            <h2>Your WiFi voucher</h2>
            <p className="muted">{status.plan} · Keep these details private.</p>
            <label>{status.code ? "Voucher code" : "Username / voucher code"}</label>
            <code>{status.code || status.credential || "Not allocated yet"}</code>
            {status.code && status.credential && status.code !== status.credential && (
              <>
                <label>Username</label>
                <code>{status.credential}</code>
              </>
            )}
            {status.password && (
              <>
                <label>Password</label>
                <code>{status.password}</code>
              </>
            )}
            {status.code || status.credential ? (
              <button className="primary pending-button" type="button" onClick={downloadAgain}>
                Download voucher PDF
              </button>
            ) : (
              <p className="notice">Payment is confirmed, but the voucher has not been allocated yet.</p>
            )}
            {pdfMessage && <p className="muted" role="status">{pdfMessage}</p>}
            <p className="muted">
              If the voucher is not shown yet, contact the WiFi operator with order ID <b>{orderId}</b>.
            </p>
          </section>
        )}

        {status?.status === "SUCCESS_NO_STOCK" && (
          <div className="notice" role="status">
            Payment received, but voucher stock is temporarily empty. Please contact the WiFi operator
            and quote {orderId}.
          </div>
        )}

        {status?.status === "PENDING" && orderId && (
          <div className="notice" role="status">
            Payment is being confirmed. Order: {orderId}. We will check automatically for about a
            minute. <button className="quiet" onClick={refreshPayment}>Check again</button>
          </div>
        )}

        {statusError && <p className="notice" role="alert">{statusError}</p>}

        {plansLoading && <p className="muted" role="status">Loading plans…</p>}
        {plansError && <p className="notice" role="alert">{plansError}</p>}
        {!plansLoading && !plansError && plans.length === 0 && (
          <p className="muted">There are no active plans available right now.</p>
        )}

        <section className="plan-cards">
          {plans.map((plan) => (
            <article className="buy-plan card" key={plan.id}>
              <p className="eyebrow">WIFI ACCESS</p>
              <h2>{plan.name}</h2>
              <strong>
                ₹{(plan.price_paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </strong>
              <p>
                {plan.validity_hours ? plan.validity_hours + " hours" : ""}
                {plan.validity_hours && plan.quota_mb ? " · " : ""}
                {plan.quota_mb ? plan.quota_mb + " MB data" : ""}
                {plan.simultaneous_users > 1 ? " · " + plan.simultaneous_users + " devices" : ""}
              </p>
              <button
                className="primary"
                disabled={!plan.stock}
                onClick={() => {
                  setSelectedPlan(plan);
                  setStatus(null);
                  setCheckoutError("");
                }}
              >
                {plan.stock ? "Choose plan" : "Sold out"}
              </button>
            </article>
          ))}
        </section>

        {selectedPlan && (
          <form className="buy-checkout card stack" onSubmit={pay}>
            <h2>Continue with {selectedPlan.name}</h2>
            <label>
              Mobile number
              <input
                required
                inputMode="tel"
                minLength={10}
                maxLength={15}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="10 digit mobile number"
              />
            </label>
            {checkoutError && <p className="notice" role="alert">{checkoutError}</p>}
            <button className="primary" disabled={checkoutLoading}>
              {checkoutLoading
                ? "Opening secure payment…"
                : "Pay ₹" + (selectedPlan.price_paise / 100).toFixed(2)}
            </button>
            <button type="button" className="quiet" onClick={() => setSelectedPlan(null)}>
              Cancel
            </button>
          </form>
        )}

        <p className="footnote">
          Payments are securely processed by Cashfree. Voucher allocation follows payment confirmation.
        </p>
      </div>
    </main>
  );
}

