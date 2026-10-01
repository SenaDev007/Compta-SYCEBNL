import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPdfReport } from "@/lib/accounting/pdf-export";
import { validateWorkspace } from "@/lib/accounting/validation";
import { createWorkbook } from "@/lib/accounting/workbook-export";
import { originIsAllowed, readSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 12 * 1024 * 1024;
const requestSchema = z.object({
  workspace: z.unknown(),
  year: z.number().int().min(1900).max(2100).optional(),
  kind: z.enum(["financial", "narrative"]).optional(),
});

function attachment(body: Buffer | string, type: string, filename: string) {
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ format: string }> }) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "La demande n’a pas pu être traitée." }, { status: 403 });
  }
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Connectez-vous pour continuer." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: "Le document est trop volumineux." }, { status: 413 });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "Le document n’a pas pu être lu." }, { status: 400 });
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
    return NextResponse.json({ error: "Le document est trop volumineux." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Le document transmis est invalide." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Les informations du document sont incomplètes." },
      { status: 400 },
    );
  }
  const checked = validateWorkspace(parsed.data.workspace);
  if (!checked.success) return NextResponse.json({ error: checked.message }, { status: 422 });

  const { format } = await context.params;
  const stamp = new Date().toISOString().slice(0, 10);
  const year = parsed.data.year || new Date().getFullYear();
  try {
    if (format === "backup") {
      const backup = JSON.stringify(
        {
          format: "compta-sycebnl-plus",
          version: 1,
          exportedAt: new Date().toISOString(),
          workspace: checked.data,
        },
        null,
        2,
      );
      return attachment(
        backup,
        "application/vnd.compta-sycebnl.backup+json; charset=utf-8",
        `compta-sycebnl-sauvegarde-${stamp}.sycebnl`,
      );
    }
    if (format === "workbook") {
      const bytes = createWorkbook(checked.data, year);
      return attachment(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `compta-sycebnl-etats-${year}.xlsx`,
      );
    }
    if (format === "pdf") {
      const bytes = await createPdfReport(checked.data, year, parsed.data.kind || "financial");
      return attachment(bytes, "application/pdf", `compta-sycebnl-rapport-${year}.pdf`);
    }
    return NextResponse.json(
      { error: "Ce type de document n’est pas disponible." },
      { status: 404 },
    );
  } catch {
    return NextResponse.json(
      { error: "Le document n’a pas pu être créé. Réessayez dans quelques instants." },
      { status: 500 },
    );
  }
}
