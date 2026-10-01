import * as XLSX from "xlsx-js-style";
import {
  balanceReport,
  employmentResources,
  operatingStatement,
  projectBudget,
  reconcileAccount,
  yearEntries,
} from "./calculations";
import type { Workspace } from "./types";

type Row = Record<string, string | number>;

const headingStyle = {
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
const amountFormat = "#,##0;[Red]-#,##0;–";

function addSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Row[],
  widths: number[],
  amountHeaders: string[] = [],
) {
  const values = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  const sheet = XLSX.utils.aoa_to_sheet(values);
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  sheet["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = headingStyle;
  }
  for (let row = 1; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (!cell) continue;
      const header = headers[column] || "";
      cell.s = {
        ...bodyStyle,
        alignment: {
          ...bodyStyle.alignment,
          horizontal: amountHeaders.includes(header) ? "right" : "left",
        },
        ...(amountHeaders.includes(header) ? { numFmt: amountFormat } : {}),
      };
      if (row % 2 === 0) {
        cell.s.fill = { fgColor: { rgb: "F3F6F3" } };
      }
    }
  }
  sheet["!rows"] = [{ hpt: 27 }];
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}

export function createWorkbook(workspace: Workspace, year: number): Buffer {
  const workbook = XLSX.utils.book_new();
  const entries = yearEntries(workspace.entries, year);
  const balance = balanceReport(workspace.accounts, entries);
  const operating = operatingStatement(workspace.accounts, entries);
  const employment = employmentResources(workspace.accounts, entries);

  addSheet(
    workbook,
    "Journal",
    ["Date", "Journal", "Pièce", "Libellé", "Projet", "Compte", "Débit", "Crédit"],
    entries.flatMap((entry) =>
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
    ),
    [14, 12, 18, 38, 18, 14, 16, 16],
    ["Débit", "Crédit"],
  );

  addSheet(
    workbook,
    "Plan comptable",
    ["Numéro", "Libellé", "Origine"],
    workspace.accounts.map((account) => ({
      Numéro: account.number,
      Libellé: account.label,
      Origine:
        account.source === "import"
          ? "Importé"
          : account.source === "demo"
            ? "Exemple"
            : "Personnalisé",
    })),
    [15, 54, 18],
  );

  addSheet(
    workbook,
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
      ...balance.rows.map((row) => ({
        Compte: row.number,
        Libellé: row.label,
        "Mouvement débit": row.debit,
        "Mouvement crédit": row.credit,
        "Solde débiteur": row.debitBalance,
        "Solde créditeur": row.creditBalance,
      })),
      {
        Compte: "",
        Libellé: "Totaux",
        "Mouvement débit": balance.totalDebit,
        "Mouvement crédit": balance.totalCredit,
        "Solde débiteur": balance.totalDebitBalance,
        "Solde créditeur": balance.totalCreditBalance,
      },
    ],
    [14, 42, 20, 20, 20, 20],
    ["Mouvement débit", "Mouvement crédit", "Solde débiteur", "Solde créditeur"],
  );

  addSheet(
    workbook,
    "Compte exploitation",
    ["Nature", "Compte", "Libellé", "Montant"],
    [
      ...operating.products.map((row) => ({
        Nature: "Produit",
        Compte: row.number,
        Libellé: row.label,
        Montant: row.amount,
      })),
      ...operating.charges.map((row) => ({
        Nature: "Charge",
        Compte: row.number,
        Libellé: row.label,
        Montant: row.amount,
      })),
      { Nature: "Résultat", Compte: "", Libellé: "Excédent / déficit", Montant: operating.result },
    ],
    [16, 14, 48, 20],
    ["Montant"],
  );

  addSheet(
    workbook,
    "Emplois et ressources",
    ["Rubrique", "Nature", "Montant"],
    [
      ...employment.rows.map((row) => ({
        Rubrique: row.label,
        Nature: row.type,
        Montant: row.amount,
      })),
      { Rubrique: "Total des ressources", Nature: "Ressources", Montant: employment.resources },
      { Rubrique: "Total des emplois", Nature: "Emplois", Montant: employment.jobs },
      { Rubrique: "Solde ressources − emplois", Nature: "Solde", Montant: employment.balance },
    ],
    [48, 20, 20],
    ["Montant"],
  );

  addSheet(
    workbook,
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
      projectBudget(project, entries).details.map((line) => ({
        "Code projet": project.code,
        Projet: project.title,
        "Code ligne": line.code,
        "Ligne de dépense": line.label,
        Compte: line.accountNumber || "Non affecté",
        Budget: line.budget,
        "Part bailleur": line.donorShare,
        "Part porteur": line.holderShare,
        Réalisé: line.realized,
        Reste: line.remaining,
        Taux: line.rate,
      })),
    ),
    [16, 36, 16, 42, 14, 18, 18, 18, 18, 18, 14],
    ["Budget", "Part bailleur", "Part porteur", "Réalisé", "Reste"],
  );

  addSheet(
    workbook,
    "Rapprochement",
    ["Compte", "Date du relevé", "Solde du relevé", "Solde comptable théorique", "Écart"],
    workspace.reconciliations.map((item) => {
      const result = reconcileAccount(workspace, item);
      return {
        Compte: item.accountNumber,
        "Date du relevé": item.asOf,
        "Solde du relevé": item.statementBalance,
        "Solde comptable théorique": result.theoretical,
        Écart: result.difference,
      };
    }),
    [16, 18, 22, 28, 20],
    ["Solde du relevé", "Solde comptable théorique", "Écart"],
  );

  const output = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true });
  return Buffer.isBuffer(output) ? output : Buffer.from(output as Uint8Array);
}
