import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { issueSession, originIsAllowed, setSessionCookie } from "@/lib/auth/session";
import { database } from "@/lib/db/client";
import { consumeAuthLimit, requestIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
const inputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "La demande n’a pas pu être traitée." }, { status: 403 });
  }
  if (
    !process.env.DATABASE_URL ||
    !process.env.AUTH_SECRET ||
    process.env.AUTH_SECRET.length < 32
  ) {
    return NextResponse.json(
      { error: "La connexion est temporairement indisponible. Réessayez plus tard." },
      { status: 503 },
    );
  }

  const ip = requestIp(request);
  const ipRetry = consumeAuthLimit("login-ip", ip, "all", 30, 15 * 60 * 1000);
  if (ipRetry !== null) {
    return NextResponse.json(
      { error: "Trop de tentatives depuis ce réseau. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(ipRetry) } },
    );
  }

  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const emailRetry = consumeAuthLimit("login-email", ip, email, 10, 15 * 60 * 1000);
    if (emailRetry !== null) {
      return NextResponse.json(
        { error: "Trop de tentatives pour ce compte. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(emailRetry) } },
      );
    }
    const sql = database();
    const rows = await sql`
      SELECT id, email, password_hash
      FROM app_users
      WHERE email = ${email}
      LIMIT 1
    `;
    const row = rows[0];
    if (
      !row ||
      typeof row.password_hash !== "string" ||
      !(await compare(parsed.data.password, row.password_hash))
    ) {
      return NextResponse.json(
        { error: "Adresse courriel ou mot de passe incorrect." },
        { status: 401 },
      );
    }

    const user = { id: String(row.id), email: String(row.email) };
    const token = await issueSession(user);
    return setSessionCookie(NextResponse.json({ user }), token);
  } catch {
    return NextResponse.json(
      { error: "Impossible de vous connecter pour le moment. Réessayez plus tard." },
      { status: 503 },
    );
  }
}
