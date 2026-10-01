import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({ user });
}
