export type CashfreeConfig = {
  appId: string;
  secret: string;
  apiVersion: string;
  mode: "sandbox" | "production";
  baseUrl: string;
};

export type CashfreeOrderPayment = {
  cf_payment_id?: string | number;
  payment_status?: string;
  payment_amount?: number | string;
};

export type CashfreeOrderDetails = {
  order_id?: string;
  order_amount?: number | string;
  order_currency?: string;
  order_meta?: { return_url?: string };
  customer_details?: { customer_phone?: string };
};

export function getCashfreeConfig(): CashfreeConfig | null {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  const mode = process.env.CASHFREE_ENV;
  if (!appId || !secret || (mode !== "sandbox" && mode !== "production")) return null;

  return {
    appId,
    secret,
    apiVersion: process.env.CASHFREE_API_VERSION || "2025-01-01",
    mode,
    baseUrl: mode === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg",
  };
}

export async function fetchCashfreeOrderPayments(orderId: string, config: CashfreeConfig) {
  const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
    headers: {
      "x-client-id": config.appId,
      "x-client-secret": config.secret,
      "x-api-version": config.apiVersion,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const body: unknown = await response.json();
  if (!response.ok || !Array.isArray(body)) {
    throw new Error(`Cashfree payment status lookup failed (${response.status})`);
  }

  return body as CashfreeOrderPayment[];
}

export async function fetchCashfreeOrderDetails(orderId: string, config: CashfreeConfig) {
  const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      "x-client-id": config.appId,
      "x-client-secret": config.secret,
      "x-api-version": config.apiVersion,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const body: unknown = await response.json();
  if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Cashfree order lookup failed (${response.status})`);
  }

  return body as CashfreeOrderDetails;
}
