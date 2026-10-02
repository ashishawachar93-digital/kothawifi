import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/http";
export async function GET(){const a=await requireAdmin();if(a.response)return a.response;try{const [stock,payments,usage,costs,recent,goods]=await Promise.all([
 db.query("SELECT count(*) FILTER(WHERE status='unused')::int unused,count(*) FILTER(WHERE status='sold')::int sold,count(*)::int total FROM vouchers"),
 db.query("SELECT COALESCE(sum(amount_paise),0)::bigint revenue,count(*)::int paid FROM payments WHERE status IN ('SUCCESS','SUCCESS_NO_STOCK') AND paid_at>=date_trunc('month',now())"),
 db.query("SELECT COALESCE(sum(input_bytes+output_bytes),0)::numeric bytes FROM usage_sessions WHERE COALESCE(ended_at,started_at)>=date_trunc('month',now())"),
 db.query("SELECT COALESCE(sum(cost_paise),0)::bigint bill,COALESCE(sum(total_gb),0)::numeric billed_gb FROM jio_costs WHERE period_start<=current_date AND period_end>=date_trunc('month',now())::date"),
 db.query("SELECT p.provider_order_id,p.customer_phone,p.amount_paise,p.status,p.paid_at,v.username,pl.name plan_name FROM payments p JOIN plans pl ON pl.id=p.plan_id LEFT JOIN vouchers v ON v.id=p.voucher_id ORDER BY p.created_at DESC LIMIT 8"),
 db.query("SELECT COALESCE(sum(pl.cost_paise),0)::bigint cost FROM payments p JOIN plans pl ON pl.id=p.plan_id WHERE p.status='SUCCESS' AND p.voucher_id IS NOT NULL AND p.paid_at>=date_trunc('month',now())")
 ]);const bytes=Number(usage.rows[0].bytes||0);const usageGb=bytes/1_000_000_000;const billedGb=Number(costs.rows[0].billed_gb||0);const bill=Number(costs.rows[0].bill||0);const allocatedJioCost=billedGb>0?Math.round(bill*Math.min(usageGb/billedGb,1)):0;const revenue=Number(payments.rows[0].revenue||0);const goodsCost=Number(goods.rows[0].cost||0);return NextResponse.json({stock:stock.rows[0],month:{paid:payments.rows[0].paid,revenuePaise:revenue,usageGb:Number(usageGb.toFixed(3)),jioBillPaise:bill,billedGb,allocatedJioCostPaise:allocatedJioCost,planCostPaise:goodsCost,estimatedProfitPaise:revenue-goodsCost-allocatedJioCost},recent:recent.rows});}catch(e){console.error(e);return NextResponse.json({error:'Dashboard data unavailable'},{status:500});}}
