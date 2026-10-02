import { PoolClient } from "pg";
/** Atomically consume one unused voucher; unique provider/payment ID protects webhook retries. */
export async function allocateVoucher(client: PoolClient, input: { orderId: string; paymentId: string; planId: string; amountPaise: number; phone?: string; event: unknown }) {
  const prior = await client.query("SELECT p.*,v.username,v.password,v.code FROM payments p LEFT JOIN vouchers v ON v.id=p.voucher_id WHERE p.provider='cashfree' AND (p.provider_payment_id=$1 OR p.provider_order_id=$2)", [input.paymentId,input.orderId]);
  if (prior.rowCount) return prior.rows[0];
  const selected = await client.query("SELECT id,username,password,code FROM vouchers WHERE plan_id=$1 AND status='unused' ORDER BY imported_at,id FOR UPDATE SKIP LOCKED LIMIT 1", [input.planId]);
  const voucher = selected.rows[0];
  const inserted = await client.query("INSERT INTO payments(provider,provider_order_id,provider_payment_id,plan_id,amount_paise,customer_phone,status,voucher_id,raw_event,paid_at) VALUES('cashfree',$1,$2,$3,$4,$5,$6,$7,$8::jsonb,now()) ON CONFLICT DO NOTHING RETURNING id", [input.orderId,input.paymentId,input.planId,input.amountPaise,input.phone ?? null,voucher ? 'SUCCESS' : 'SUCCESS_NO_STOCK',voucher?.id ?? null,JSON.stringify(input.event)]);
  if (!inserted.rowCount) return (await client.query("SELECT p.*,v.username,v.password,v.code FROM payments p LEFT JOIN vouchers v ON v.id=p.voucher_id WHERE p.provider='cashfree' AND (p.provider_payment_id=$1 OR p.provider_order_id=$2)", [input.paymentId,input.orderId])).rows[0];
  if (voucher) await client.query("UPDATE vouchers SET status='sold',sold_at=now(),payment_id=$1 WHERE id=$2 AND status='unused'", [input.paymentId,voucher.id]);
  return { ...inserted.rows[0], ...voucher, status: voucher ? 'SUCCESS' : 'SUCCESS_NO_STOCK' };
}
