import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { createPdfReport } from "../src/lib/accounting/pdf-export";
import { createWorkbook } from "../src/lib/accounting/workbook-export";
import { importAccounts, importBudgetLines, readBackup } from "../src/lib/accounting/files";
import { createEmptyWorkspace, type Project } from "../src/lib/accounting/types";

test("les exports serveur produisent un PDF lisible et un classeur avec les états comptables", async () => {
  const workspace = createEmptyWorkspace();
  workspace.reportSettings.organizationName = "Association de démonstration";
  workspace.entries = [
    {
      id: "entry-1",
      date: "2026-02-01",
      journal: "BQ",
      reference: "BQ-001",
      label: "Subvention de fonctionnement",
      createdAt: "2026-02-01T00:00:00.000Z",
      lines: [
        { id: "line-1", accountNumber: "521", debit: 100000, credit: 0 },
        { id: "line-2", accountNumber: "713", debit: 0, credit: 100000 },
      ],
    },
  ];

  const pdf = await createPdfReport(workspace, 2026, "financial");
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(pdf.length > 1500);

  const workbookBytes = createWorkbook(workspace, 2026);
  assert.equal(workbookBytes.subarray(0, 2).toString("hex"), "504b");
  const workbook = XLSX.read(workbookBytes, { type: "buffer" });
  assert.ok(workbook.SheetNames.includes("Journal"));
  assert.ok(workbook.SheetNames.includes("Balance générale"));
  assert.ok(workbook.SheetNames.includes("Compte exploitation"));
  const journal = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Journal);
  assert.equal(journal.length, 2);
  assert.equal(journal[0]?.Pièce, "BQ-001");
});

test("le rapport narratif serveur est également produit sous forme de PDF", async () => {
  const workspace = createEmptyWorkspace();
  workspace.reportSettings.organizationName = "Association de démonstration";
  const pdf = await createPdfReport(workspace, 2026, "narrative");
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(pdf.length > 1200);
});

test("le dépôt d’un plan comptable, l’import du budget et la restauration de sauvegarde sont lus", async () => {
  const planFile = new File(["Numéro,Libellé\n521,Banque de l’association\n"], "plan.csv");
  const accounts = await importAccounts(planFile);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]?.number, "521");

  const project: Project = {
    id: "project-test",
    code: "PROJ-001",
    title: "Projet de démonstration",
    partner: "",
    organization: "",
    highlights: "",
    budgetLines: [],
  };
  const budgetFile = new File(
    [
      "Niveau,Code,Intitulé,Quantité,Coût unitaire,Part bailleur\n" +
        "0,A,Section,,,\n" +
        "1,1,Résultat,,,\n" +
        "2,1.1,Produit,,,\n" +
        "3,1.1.1,Activité,,,\n" +
        "4,1.1.1.1,Fournitures,2,50,60\n",
    ],
    "budget.csv",
  );
  const budgetLines = await importBudgetLines(budgetFile, project);
  assert.equal(budgetLines.length, 5);
  assert.equal(budgetLines[4]?.kind, "expense");

  const workspace = createEmptyWorkspace();
  const backup = new File(
    [JSON.stringify({ format: "compta-sycebnl-plus", version: 1, workspace })],
    "archive.sycebnl",
  );
  const restored = await readBackup(backup);
  assert.equal(restored.schemaVersion, 1);
  assert.equal(restored.accounts.length, workspace.accounts.length);
});
