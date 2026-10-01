import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, originIsAllowed } from "@/lib/auth/session";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!originIsAllowed(request))
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
