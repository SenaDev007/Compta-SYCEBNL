import * as XLSX from "xlsx";
import { validateWorkspace } from "./validation";
import type { Account, BudgetKind, Project, Workspace } from "./types";

const clean = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

async function rowsFromFile(file: File) {
  if (file.size > 16 * 1024 * 1024) throw new Error("Le fichier dépasse la limite de 16 Mo.");
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, codepage: 65001 });
  const first = workbook.Sheets[workbook.SheetNames[0]];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(first, { defval: "" });
}

function numeric(value: unknown) {
  const normalized = clean(value).replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function importAccounts(file: File): Promise<Account[]> {
  const rows = await rowsFromFile(file);
  if (!rows.length) throw new Error("Le fichier ne contient aucune ligne de compte.");
  const normalized = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([header, value]) => [key(header), value])),
  );
  const accounts: Account[] = [];

  for (const row of normalized) {
    const number = clean(
      row.numero ??
        row.numerodecompte ??
        row.numerocompte ??
        row.ncompte ??
        row.compte ??
        row.code ??
        row.accountnumber,
    )
      .replace(/\.0$/, "")
      .replace(/\s/g, "");
    const label = clean(
      row.libelle ?? row.intitule ?? row.designation ?? row.label ?? row.accountname,
    );
    if (/^\d{1,12}$/.test(number) && label) accounts.push({ number, label, source: "import" });
  }

  if (!accounts.length) {
    throw new Error("Colonnes attendues : Numéro de compte et Libellé.");
  }
  const unique = new Map<string, Account>();
  for (const account of accounts) unique.set(account.number, account);
  return [...unique.values()];
}

function budgetLevel(value: unknown): number | null {
  const normalized = key(value);
  const numericLevel = Number(normalized);
  if (normalized && Number.isInteger(numericLevel) && numericLevel >= 0 && numericLevel <= 4) {
    return numericLevel;
  }
  if (normalized.startsWith("outcome")) return 1;
  if (normalized.startsWith("output")) return 2;
  if (normalized.startsWith("activite") || normalized.startsWith("activity")) return 3;
  if (
    normalized.startsWith("depense") ||
    normalized.startsWith("ligne") ||
    normalized.startsWith("expense")
  ) {
    return 4;
  }
  if (normalized.startsWith("section") || normalized.startsWith("partie")) return 0;
  return null;
}

export async function importBudgetLines(
  file: File,
  existing: Project,
): Promise<Project["budgetLines"]> {
  const rows = await rowsFromFile(file);
  if (!rows.length) throw new Error("Le fichier ne contient aucune ligne budgétaire.");
  const normalized = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([header, value]) => [key(header), value])),
  );
  const kinds: BudgetKind[] = ["section", "outcome", "output", "activity", "expense"];
  const result: Project["budgetLines"] = [];
  const ancestors: string[] = [];

  for (const row of normalized) {
    const label = clean(
      row.intitule ?? row.libelle ?? row.activite ?? row.designation ?? row.label,
    );
    if (!label) continue;
    const inputLevel = budgetLevel(row.niveau ?? row.level ?? row.type);
    const level = inputLevel ?? 4;
    const kind = kinds[level];
    const id = crypto.randomUUID();
    const parentId = level === 0 ? undefined : ancestors[level - 1];

    if (level > 0 && level < 4 && !parentId) {
      throw new Error(
        `Hiérarchie incomplète autour de « ${label} ». Vérifiez les niveaux du fichier.`,
      );
    }

    const quantity = numeric(row.quantite ?? row.quantity);
    const unitCost = numeric(row.coutunitaire ?? row.cout ?? row.unitcost);
    const donorShare = numeric(row.partbailleur ?? row.bailleur ?? row.donor);
    const budget = quantity * unitCost;
    if (kind === "expense" && donorShare > budget) {
      throw new Error(`La part bailleur dépasse le budget de la ligne « ${label} ».`);
    }

    const code = clean(row.code ?? row.reference);
    const accountNumber = clean(row.compte ?? row.numero ?? row.accountnumber) || undefined;
    result.push({
      id,
      kind,
      code,
      label,
      ...(parentId ? { parentId } : {}),
      unit: clean(row.unite ?? row.unit) || "Unité",
      quantity,
      unitCost,
      donorShare,
      priorSpent: numeric(row.realiseanterieur ?? row.anterieur ?? row.priorspent),
      ...(accountNumber ? { accountNumber } : {}),
    });
    ancestors[level] = id;
    ancestors.length = level + 1;
  }

  if (!result.length)
    throw new Error("Aucune ligne lisible. Vérifiez la colonne Intitulé ou Libellé.");
  return [...existing.budgetLines, ...result];
}

async function downloadFromServer(
  format: "backup" | "workbook" | "pdf",
  workspace: Workspace,
  options: { year?: number; kind?: "financial" | "narrative" } = {},
) {
  const response = await fetch(`/api/exports/${format}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, ...options }),
  });
  if (!response.ok) {
    let message = "Le document n’a pas pu être créé. Réessayez dans quelques instants.";
    try {
      const result = await response.json();
      if (typeof result.error === "string") message = result.error;
    } catch {
      // Un message lisible est utilisé si le serveur ne renvoie pas de détail.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ||
    `compta-sycebnl-${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadBackup(workspace: Workspace) {
  return downloadFromServer("backup", workspace);
}

export function exportWorkbook(workspace: Workspace, year: number) {
  return downloadFromServer("workbook", workspace, { year });
}

export function exportPdf(workspace: Workspace, year: number, kind: "financial" | "narrative") {
  return downloadFromServer("pdf", workspace, { year, kind });
}

export async function readBackup(file: File): Promise<Workspace> {
  if (file.size > 16 * 1024 * 1024) throw new Error("Le fichier dépasse la limite de 16 Mo.");
  const text = await file.text();
  if (new TextEncoder().encode(text).byteLength > 16 * 1024 * 1024) {
    throw new Error("Le fichier dépasse la limite de 16 Mo.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Le fichier sélectionné ne correspond pas à une sauvegarde reconnue.");
  }

  const root = data as { format?: string; workspace?: unknown };
  const candidate = root?.format === "compta-sycebnl-plus" ? root.workspace : data;
  const checked = validateWorkspace(candidate);
  if (!checked.success) throw new Error("Cette sauvegarde ne peut pas être restaurée.");
  return { ...checked.data, updatedAt: new Date().toISOString() };
}
