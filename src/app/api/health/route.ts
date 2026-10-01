import { NextResponse } from "next/server";
import { database } from "@/lib/db/client";
export const runtime = "nodejs";
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ status: "ok", storage: "local-only" });
  try {
    await database()`SELECT 1 AS connected`;
    return NextResponse.json({ status: "ok", storage: "postgres" });
  } catch {
    return NextResponse.json({ status: "degraded", storage: "unavailable" }, { status: 503 });
  }
}
