import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEmptyWorkspace } from "@/lib/accounting/types";
import { issueSession, originIsAllowed, setSessionCookie } from "@/lib/auth/session";
import { database } from "@/lib/db/client";
import { consumeAuthLimit, requestIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
const inputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
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
      {
        error: "La création de compte est temporairement indisponible. Réessayez plus tard.",
      },
      { status: 503 },
    );
  }

  const ip = requestIp(request);
  const ipRetry = consumeAuthLimit("register-ip", ip, "all", 5, 60 * 60 * 1000);
  if (ipRetry !== null) {
    return NextResponse.json(
      { error: "Trop de créations de compte depuis ce réseau. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(ipRetry) } },
    );
  }

  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Saisissez une adresse courriel valide et un mot de passe d’au moins 10 caractères.",
        },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const emailRetry = consumeAuthLimit("register-email", ip, email, 3, 24 * 60 * 60 * 1000);
    if (emailRetry !== null) {
      return NextResponse.json(
        { error: "Trop de demandes pour cette adresse courriel. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(emailRetry) } },
      );
    }
    const passwordHash = await hash(parsed.data.password, 12);
    const id = randomUUID();
    const workspace = createEmptyWorkspace();
    const sql = database();
    const inserted = await sql`
      WITH created_user AS (
        INSERT INTO app_users (id, email, password_hash)
        VALUES (${id}, ${email}, ${passwordHash})
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email
      ), created_workspace AS (
        INSERT INTO workspaces (user_id, version, state, updated_at)
        SELECT id, 1, ${JSON.stringify(workspace)}::jsonb, NOW()
        FROM created_user
        RETURNING user_id
      )
      SELECT created_user.id, created_user.email
      FROM created_user
      INNER JOIN created_workspace ON created_workspace.user_id = created_user.id
    `;
    const userRow = inserted[0];
    if (!userRow) {
      return NextResponse.json(
        { error: "Un compte existe déjà pour cette adresse." },
        { status: 409 },
      );
    }

    const user = { id: String(userRow.id), email: String(userRow.email) };
    const token = await issueSession(user);
    return setSessionCookie(NextResponse.json({ user, version: 1, state: workspace }), token);
  } catch {
    return NextResponse.json(
      {
        error: "Impossible de créer le compte pour le moment. Réessayez plus tard.",
      },
      { status: 503 },
    );
  }
}
