import { NextRequest,NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/secret";
export async function GET(req:NextRequest){
  const orderId=req.nextUrl.searchParams.get('orderId');
  const options={headers:{'Cache-Control':'no-store, private'}};
  if(!orderId||!/^kw_[a-f0-9]{24}$/.test(orderId)){
    return NextResponse.json({error:'Invalid order ID'},{...options,status:400});
  }
  const r=await db.query(
    "SELECT p.status,p.voucher_id,v.username,v.password,v.code,pl.name plan_name FROM payments p JOIN plans pl ON pl.id=p.plan_id LEFT JOIN vouchers v ON v.id=p.voucher_id WHERE p.provider_order_id=$1 ORDER BY p.created_at DESC LIMIT 1",
    [orderId],
  );
  if(!r.rowCount)return NextResponse.json({status:'PENDING'},options);
  return NextResponse.json({
    status:r.rows[0].status,
    plan:r.rows[0].plan_name,
    credential:r.rows[0].username,
    password:decryptSecret(r.rows[0].password),
    code:r.rows[0].code,
  },options);
}

