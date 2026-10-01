import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import {
  balanceReport,
  employmentResources,
  operatingStatement,
  projectBudget,
  reconcileAccount,
  yearEntries,
} from "./calculations";
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadLocalBackup(workspace: Workspace) {
  const checked = validateWorkspace(workspace);
  if (!checked.success) throw new Error("La sauvegarde ne peut pas être préparée.");
  const content = JSON.stringify(
    {
      format: "compta-sycebnl-plus",
      exportedAt: new Date().toISOString(),
      workspace: checked.data,
    },
    null,
    2,
  );
  downloadBlob(
    new Blob([content], { type: "application/octet-stream" }),
    "compta-sycebnl-sauvegarde.sycebnl",
  );
}

async function createLocalWorkbook(workspace: Workspace, year: number) {
  const workbook = XLSXStyle.utils.book_new();
  const headerStyle = {
    fill: { fgColor: { rgb: "17382D" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: { bottom: { style: "medium", color: { rgb: "C29655" } } },
  };
  const bodyStyle = {
    font: { color: { rgb: "26352E" }, sz: 10 },
    alignment: { vertical: "center" },
    border: { bottom: { style: "hair", color: { rgb: "E4EAE5" } } },
  };
  const addSheet = (
    name: string,
    headers: string[],
    rows: Array<Array<string | number>>,
    widths: number[],
    amountHeaders: string[] = [],
  ) => {
    const sheet = XLSXStyle.utils.aoa_to_sheet([headers, ...rows]);
    const range = XLSXStyle.utils.decode_range(sheet["!ref"] || "A1:A1");
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    sheet["!autofilter"] = { ref: XLSXStyle.utils.encode_range(range) };
    sheet["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen",
    };
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSXStyle.utils.encode_cell({ r: 0, c: column })];
      if (cell) cell.s = headerStyle;
    }
    for (let row = 1; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cell = sheet[XLSXStyle.utils.encode_cell({ r: row, c: column })];
        if (!cell) continue;
        const header = headers[column] || "";
        cell.s = {
          ...bodyStyle,
          alignment: {
            ...bodyStyle.alignment,
            horizontal: amountHeaders.includes(header) ? "right" : "left",
          },
          ...(amountHeaders.includes(header)
            ? { numFmt: header === "Taux" ? "0.0%" : "#,##0;[Red]-#,##0;–" }
            : {}),
          ...(row % 2 === 0 ? { fill: { fgColor: { rgb: "F3F6F3" } } } : {}),
        };
      }
    }
    sheet["!rows"] = [{ hpt: 27 }];
    XLSXStyle.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  };

  const entries = yearEntries(workspace.entries, year);
  const balance = balanceReport(workspace.accounts, entries);
  const operating = operatingStatement(workspace.accounts, entries);
  const employment = employmentResources(workspace.accounts, entries);
  addSheet(
    "Journal",
    ["Date", "Journal", "Pièce", "Libellé", "Projet", "Compte", "Débit", "Crédit"],
    entries.flatMap((entry) =>
      entry.lines.map((line) => [
        entry.date,
        entry.journal,
        entry.reference,
        entry.label,
        workspace.projects.find((project) => project.id === entry.projectId)?.code || "",
        line.accountNumber,
        line.debit,
        line.credit,
      ]),
    ),
    [14, 12, 18, 38, 18, 14, 16, 16],
    ["Débit", "Crédit"],
  );
  addSheet(
    "Plan comptable",
    ["Numéro", "Libellé", "Origine"],
    workspace.accounts.map((account) => [
      account.number,
      account.label,
      account.source === "import"
        ? "Importé"
        : account.source === "demo"
          ? "Exemple"
          : "Personnalisé",
    ]),
    [15, 54, 18],
  );
  addSheet(
    "Balance générale",
    [
      "Compte",
      "Libellé",
      "Mouvement débit",
      "Mouvement crédit",
      "Solde débiteur",
      "Solde créditeur",
    ],
    [
      ...balance.rows.map((row) => [
        row.number,
        row.label,
        row.debit,
        row.credit,
        row.debitBalance,
        row.creditBalance,
      ]),
      [
        "",
        "Totaux",
        balance.totalDebit,
        balance.totalCredit,
        balance.totalDebitBalance,
        balance.totalCreditBalance,
      ],
    ],
    [14, 42, 20, 20, 20, 20],
    ["Mouvement débit", "Mouvement crédit", "Solde débiteur", "Solde créditeur"],
  );
  addSheet(
    "Compte exploitation",
    ["Nature", "Compte", "Libellé", "Montant"],
    [
      ...operating.products.map((row) => ["Produit", row.number, row.label, row.amount]),
      ...operating.charges.map((row) => ["Charge", row.number, row.label, row.amount]),
      ["Résultat", "", "Excédent / déficit", operating.result],
    ],
    [16, 14, 48, 20],
    ["Montant"],
  );
  addSheet(
    "Emplois et ressources",
    ["Rubrique", "Nature", "Montant"],
    [
      ...employment.rows.map((row) => [row.label, row.type, row.amount]),
      ["Total des ressources", "Ressources", employment.resources],
      ["Total des emplois", "Emplois", employment.jobs],
      ["Solde ressources − emplois", "Solde", employment.balance],
    ],
    [48, 20, 20],
    ["Montant"],
  );
  addSheet(
    "Budget par projet",
    [
      "Code projet",
      "Projet",
      "Code ligne",
      "Ligne de dépense",
      "Compte",
      "Budget",
      "Part bailleur",
      "Part porteur",
      "Réalisé",
      "Reste",
      "Taux",
    ],
    workspace.projects.flatMap((project) =>
      projectBudget(project, entries).details.map((line) => [
        project.code,
        project.title,
        line.code,
        line.label,
        line.accountNumber || "Non affecté",
        line.budget,
        line.donorShare,
        line.holderShare,
        line.realized,
        line.remaining,
        line.rate,
      ]),
    ),
    [16, 36, 16, 42, 14, 18, 18, 18, 18, 18, 14],
    ["Budget", "Part bailleur", "Part porteur", "Réalisé", "Reste", "Taux"],
  );
  addSheet(
    "Rapprochement",
    ["Compte", "Date du relevé", "Solde du relevé", "Solde comptable théorique", "Écart"],
    workspace.reconciliations.map((item) => {
      const result = reconcileAccount(workspace, item);
      return [
        item.accountNumber,
        item.asOf,
        item.statementBalance,
        result.theoretical,
        result.difference,
      ];
    }),
    [16, 18, 22, 28, 20],
    ["Solde du relevé", "Solde comptable théorique", "Écart"],
  );

  const bytes = XLSXStyle.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  downloadBlob(
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `compta-sycebnl-etats-${year}.xlsx`,
  );
}

export async function downloadBackup(workspace: Workspace): Promise<"downloaded" | "device"> {
  if (!navigator.onLine) {
    downloadLocalBackup(workspace);
    return "device";
  }
  try {
    await downloadFromServer("backup", workspace);
    return "downloaded";
  } catch (cause) {
    if (!(cause instanceof TypeError) && navigator.onLine) throw cause;
    downloadLocalBackup(workspace);
    return "device";
  }
}

export async function exportWorkbook(
  workspace: Workspace,
  year: number,
): Promise<"downloaded" | "device"> {
  if (!navigator.onLine) {
    await createLocalWorkbook(workspace, year);
    return "device";
  }
  try {
    await downloadFromServer("workbook", workspace, { year });
    return "downloaded";
  } catch (cause) {
    if (!(cause instanceof TypeError) && navigator.onLine) throw cause;
    await createLocalWorkbook(workspace, year);
    return "device";
  }
}

export async function exportPdf(
  workspace: Workspace,
  year: number,
  kind: "financial" | "narrative",
): Promise<"downloaded" | "print"> {
  if (!navigator.onLine) {
    window.print();
    return "print";
  }
  try {
    await downloadFromServer("pdf", workspace, { year, kind });
    return "downloaded";
  } catch (cause) {
    if (!(cause instanceof TypeError) && navigator.onLine) throw cause;
    window.print();
    return "print";
  }
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
