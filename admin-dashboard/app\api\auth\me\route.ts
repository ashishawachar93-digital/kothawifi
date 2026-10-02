import { NextResponse } from "next/server";
import { getAdminId } from "@/lib/auth";
export async function GET(){return NextResponse.json({authenticated:!!await getAdminId()});}
