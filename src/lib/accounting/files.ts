import * as XLSX from "xlsx";
import {
  balanceReport,
  employmentResources,
  operatingStatement,
  projectBudget,
  reconcileAccount,
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
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
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
    if (/^\d{1,12}$/.test(number) && label) {
      accounts.push({ number, label, source: "import" });
    }
  }

  if (!accounts.length) {
    throw new Error("Colonnes attendues : Numéro (ou Compte/Code) et Libellé (ou Intitulé).");
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
        `Hiérarchie incomplète autour de « ${label} ». Vérifiez les niveaux Section/Outcome/Output/Activité du fichier.`,
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

  if (!result.length) {
    throw new Error("Aucune ligne lisible. Vérifiez la colonne Intitulé/Libellé.");
  }
  return [...existing.budgetLines, ...result];
}

export function downloadBackup(workspace: Workspace) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "compta-sycebnl-plus",
          version: 1,
          exportedAt: new Date().toISOString(),
          workspace,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `compta-sycebnl-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readBackup(file: File): Promise<Workspace> {
  const text = await file.text();
  if (new TextEncoder().encode(text).byteLength > 16 * 1024 * 1024) {
    throw new Error("Le fichier dépasse la limite de 16 Mo.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Le fichier sélectionné n’est pas un JSON valide.");
  }

  const root = data as { format?: string; workspace?: unknown };
  const candidate = root?.format === "compta-sycebnl-plus" ? root.workspace : data;
  const checked = validateWorkspace(candidate);
  if (!checked.success) throw new Error(checked.message);
  return { ...checked.data, updatedAt: new Date().toISOString() };
}

function downloadWorkbook(book: XLSX.WorkBook, year: number) {
  XLSX.writeFile(book, `compta-sycebnl-${year}.xlsx`);
}

export function exportWorkbook(workspace: Workspace, year: number) {
  const book = XLSX.utils.book_new();
  const entries = workspace.entries.filter((entry) => Number(entry.date.slice(0, 4)) === year);
  const journal = entries.flatMap((entry) =>
    entry.lines.map((line) => ({
      Date: entry.date,
      Journal: entry.journal,
      Pièce: entry.reference,
      Libellé: entry.label,
      Projet: workspace.projects.find((project) => project.id === entry.projectId)?.code || "",
      Compte: line.accountNumber,
      Débit: line.debit,
      Crédit: line.credit,
    })),
  );
  const balance = balanceReport(workspace.accounts, entries);
  const operating = operatingStatement(workspace.accounts, entries);
  const employment = employmentResources(workspace.accounts, entries);
  const add = (name: string, rows: object[]) =>
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));

  add("Journal", journal);
  add(
    "Plan comptable",
    workspace.accounts.map((account) => ({
      Numéro: account.number,
      Libellé: account.label,
      Origine: account.source || "personnalisé",
    })),
  );
  add(
    "Balance",
    balance.rows.map((row) => ({
      Compte: row.number,
      Libellé: row.label,
      Débit: row.debit,
      Crédit: row.credit,
      "Solde débiteur": row.debitBalance,
      "Solde créditeur": row.creditBalance,
    })),
  );

  const ledgerRunning = new Map<string, number>();
  const ledger = workspace.entries
    .filter((entry) => Number(entry.date.slice(0, 4)) <= year)
    .flatMap((entry) =>
      entry.lines.map((line) => ({
        Date: entry.date,
        Journal: entry.journal,
        Pièce: entry.reference,
        Libellé: entry.label,
        Compte: line.accountNumber,
        Débit: line.debit,
        Crédit: line.credit,
      })),
    )
    .sort((a, b) => a.Date.localeCompare(b.Date) || a.Pièce.localeCompare(b.Pièce))
    .flatMap((row) => {
      const balance = (ledgerRunning.get(row.Compte) || 0) + row.Débit - row.Crédit;
      ledgerRunning.set(row.Compte, balance);
      return Number(row.Date.slice(0, 4)) === year ? [{ ...row, "Solde cumulé": balance }] : [];
    });
  add("Grand livre", ledger);

  add("Compte exploitation", [
    ...operating.products.map((row) => ({
      Type: "Produit",
      Compte: row.number,
      Libellé: row.label,
      Montant: row.amount,
    })),
    ...operating.charges.map((row) => ({
      Type: "Charge",
      Compte: row.number,
      Libellé: row.label,
      Montant: row.amount,
    })),
    { Type: "Total", Compte: "", Libellé: "Produits", Montant: operating.totalProducts },
    { Type: "Total", Compte: "", Libellé: "Charges", Montant: operating.totalCharges },
    { Type: "Résultat", Compte: "", Libellé: "Excédent / déficit", Montant: operating.result },
  ]);
  add("Emplois-ressources", [
    ...employment.rows.map((row) => ({
      Rubrique: row.label,
      Type: row.type,
      Montant: row.amount,
    })),
    { Rubrique: "Total ressources", Type: "Total", Montant: employment.resources },
    { Rubrique: "Total emplois", Type: "Total", Montant: employment.jobs },
    { Rubrique: "Solde ressources − emplois", Type: "Solde", Montant: employment.balance },
  ]);

  const accountBudgets = new Map<string, Record<string, string | number>>();
  for (const project of workspace.projects) {
    const details = projectBudget(project, entries).details;
    for (const line of details) {
      const key = line.accountNumber || "";
      const row = accountBudgets.get(key) || {
        Compte: key,
        Libellé:
          workspace.accounts.find((account) => account.number === key)?.label ||
          "Compte non affecté",
        Budget: 0,
        Bailleur: 0,
        Porteur: 0,
        Réalisé: 0,
        "Réalisé bailleur": 0,
        "Réalisé porteur": 0,
        Écart: 0,
      };
      row.Budget = Number(row.Budget) + line.budget;
      row.Bailleur = Number(row.Bailleur) + line.donorShare;
      row.Porteur = Number(row.Porteur) + line.holderShare;
      row.Réalisé = Number(row.Réalisé) + line.realized;
      row["Réalisé bailleur"] = Number(row["Réalisé bailleur"]) + line.donorRealized;
      row["Réalisé porteur"] = Number(row["Réalisé porteur"]) + line.holderRealized;
      row.Écart = Number(row.Écart) + line.remaining;
      accountBudgets.set(key, row);
    }
  }
  add("Budget par compte", [...accountBudgets.values()]);

  for (const project of workspace.projects) {
    const details = projectBudget(project, entries).details;
    add(
      `Budget ${project.code}`,
      details.map((line) => ({
        Projet: project.code,
        Code: line.code,
        Ligne: line.label,
        Compte: line.accountNumber || "",
        Budget: line.budget,
        Bailleur: line.donorShare,
        Porteur: line.holderShare,
        Réalisé: line.realized,
        "Réalisé bailleur": line.donorRealized,
        "Réalisé porteur": line.holderRealized,
        Reste: line.remaining,
        Taux: line.rate,
      })),
    );
  }

  const reconciliationDetails: object[] = [];
  const reconciliationSummary = workspace.reconciliations.map((reconciliation) => {
    const result = reconcileAccount(workspace, reconciliation);
    for (const { entry, line } of result.allRows) {
      reconciliationDetails.push({
        Compte: reconciliation.accountNumber,
        Date: entry.date,
        Pièce: entry.reference,
        Libellé: entry.label,
        Débit: line.debit,
        Crédit: line.credit,
        Pointé: reconciliation.checkedLineIds.includes(line.id) ? "Oui" : "Non",
        "Date du relevé": reconciliation.asOf,
      });
    }
    return {
      Compte: reconciliation.accountNumber,
      "Date du relevé": reconciliation.asOf,
      "Solde comptable": result.bookBalance,
      "Encaissements non pointés": result.unclearedReceipts,
      "Décaissements non pointés": result.unclearedPayments,
      "Solde théorique": result.theoretical,
      "Solde du relevé": reconciliation.statementBalance,
      Écart: result.difference,
    };
  });
  add("Rapprochement", reconciliationDetails);
  add("Synthèse rapprochement", reconciliationSummary);

  downloadWorkbook(book, year);
}
