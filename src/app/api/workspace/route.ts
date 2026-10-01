import { NextRequest, NextResponse } from "next/server";
import { createEmptyWorkspace } from "@/lib/accounting/types";
import { validateWorkspace } from "@/lib/accounting/validation";
import { originIsAllowed, readSession } from "@/lib/auth/session";
import { database } from "@/lib/db/client";

export const runtime = "nodejs";
const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const sql = database();
    const initial = createEmptyWorkspace();
    await sql`
      INSERT INTO workspaces (user_id, version, state, updated_at)
      VALUES (${user.id}, 1, ${JSON.stringify(initial)}::jsonb, NOW())
      ON CONFLICT (user_id) DO NOTHING
    `;
    const rows = await sql`
      SELECT version, state, updated_at
      FROM workspaces
      WHERE user_id = ${user.id}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Espace utilisateur introuvable." }, { status: 404 });
    }
    const checked = validateWorkspace(row.state);
    if (!checked.success) {
      return NextResponse.json({ error: "Les données cloud sont invalides." }, { status: 500 });
    }
    return NextResponse.json({
      version: Number(row.version),
      state: checked.data,
      updatedAt: row.updated_at,
    });
  } catch {
    return NextResponse.json(
      { error: "Espace cloud indisponible. Vérifiez la migration de la base." },
      { status: 503 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  }
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: "L’espace dépasse la limite de 8 Mo." }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "L’espace dépasse la limite de 8 Mo." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("version" in body) ||
    !Number.isInteger((body as { version: unknown }).version) ||
    !("state" in body)
  ) {
    return NextResponse.json({ error: "Format de synchronisation invalide." }, { status: 400 });
  }

  const input = body as { version: number; state: unknown };
  const checked = validateWorkspace(input.state);
  if (!checked.success) return NextResponse.json({ error: checked.message }, { status: 422 });

  try {
    const sql = database();
    const updated = await sql`
      UPDATE workspaces
      SET version = version + 1,
          state = ${JSON.stringify(checked.data)}::jsonb,
          updated_at = NOW()
      WHERE user_id = ${user.id}
        AND version = ${input.version}
      RETURNING version, updated_at
    `;
    const row = updated[0];
    if (!row) {
      const rows = await sql`
        SELECT version
        FROM workspaces
        WHERE user_id = ${user.id}
        LIMIT 1
      `;
      return NextResponse.json(
        {
          error: "Une version cloud plus récente existe. Choisissez quelle version conserver.",
          currentVersion: rows[0] ? Number(rows[0].version) : null,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ version: Number(row.version), updatedAt: row.updated_at });
  } catch {
    return NextResponse.json(
      { error: "Échec de la sauvegarde cloud. La copie locale est conservée." },
      { status: 503 },
    );
  }
}
