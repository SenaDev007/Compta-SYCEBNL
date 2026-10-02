import test from "node:test";
import assert from "node:assert/strict";
import {
  balanceReport,
  employmentResources,
  operatingStatement,
  projectBudget,
  reconcileAccount,
} from "../src/lib/accounting/calculations";
import { createEmptyWorkspace } from "../src/lib/accounting/types";
import { validateWorkspace } from "../src/lib/accounting/validation";
import type { Project, Workspace } from "../src/lib/accounting/types";

const projectId = "project-1";
const budgetLineId = "budget-1";
const project: Project = {
  id: projectId,
  code: "GSAT-T",
  title: "Projet de test",
  partner: "Bailleur A",
  organization: "ONG",
  highlights: "",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  budgetLines: [
    { id: "section-1", kind: "section", code: "I", label: "Activités" },
    { id: "outcome-1", kind: "outcome", code: "1", label: "Outcome", parentId: "section-1" },
    { id: "output-1", kind: "output", code: "1.1", label: "Output", parentId: "outcome-1" },
    { id: "activity-1", kind: "activity", code: "1.1.1", label: "Activité", parentId: "output-1" },
    {
      id: budgetLineId,
      kind: "expense",
      code: "1.1.1.1",
      label: "Fournitures",
      parentId: "activity-1",
      unit: "lot",
      quantity: 2,
      unitCost: 50,
      donorShare: 60,
      priorSpent: 10,
      accountNumber: "601",
    },
  ],
};
function baseWorkspace(): Workspace {
  const workspace = createEmptyWorkspace();
  workspace.projects = [project];
  workspace.entries = [
    {
      id: "income",
      date: "2026-02-01",
      journal: "BQ",
      reference: "BQ-001",
      label: "Subvention",
      projectId,
      createdAt: "2026-02-01T00:00:00.000Z",
      lines: [
        { id: "income-bank", accountNumber: "521", debit: 100, credit: 0 },
        { id: "income-grant", accountNumber: "713", debit: 0, credit: 100 },
      ],
    },
    {
      id: "expense",
      date: "2026-02-02",
      journal: "BQ",
      reference: "BQ-002",
      label: "Fournitures",
      projectId,
      createdAt: "2026-02-02T00:00:00.000Z",
      lines: [
        { id: "expense-budget", accountNumber: "601", debit: 40, credit: 0, budgetLineId },
        { id: "expense-bank", accountNumber: "521", debit: 0, credit: 40 },
      ],
    },
  ];
  return workspace;
}

test("le résultat d’exploitation classe les produits et charges et garde la balance équilibrée", () => {
  const workspace = baseWorkspace();
  const balance = balanceReport(workspace.accounts, workspace.entries);
  const operating = operatingStatement(workspace.accounts, workspace.entries);
  assert.equal(balance.totalDebit, 140);
  assert.equal(balance.totalCredit, 140);
  assert.equal(operating.totalProducts, 100);
  assert.equal(operating.totalCharges, 40);
  assert.equal(operating.result, 60);
});

test("le suivi budgétaire additionne le réalisé antérieur et les dépenses de classe 6", () => {
  const detail = projectBudget(project, baseWorkspace().entries).details[0];
  assert.equal(detail.budget, 100);
  assert.equal(detail.holderShare, 40);
  assert.equal(detail.realized, 50);
  assert.equal(detail.donorRealized, 30);
  assert.equal(detail.holderRealized, 20);
  assert.equal(detail.remaining, 50);
});

test("le rapprochement calcule le solde théorique et le pointage exact", () => {
  const workspace = baseWorkspace();
  const reconciliation = {
    accountNumber: "521",
    statementBalance: 100,
    checkedLineIds: ["income-bank"],
    asOf: "2026-12-31",
  };
  const result = reconcileAccount(workspace, reconciliation);
  assert.equal(result.bookBalance, 60);
  assert.equal(result.theoretical, 100);
  assert.equal(result.difference, 0);
  const matching = reconcileAccount(workspace, {
    ...reconciliation,
    statementBalance: 60,
    checkedLineIds: ["income-bank", "expense-bank"],
  });
  assert.equal(matching.difference, 0);
});

test("la validation serveur refuse une écriture déséquilibrée ou un compte absent", () => {
  const valid = baseWorkspace();
  assert.equal(validateWorkspace(valid).success, true);
  const unbalanced = structuredClone(valid);
  unbalanced.entries[0].lines[0].debit = 99;
  const invalidBalance = validateWorkspace(unbalanced);
  assert.equal(invalidBalance.success, false);
  const unknownAccount = structuredClone(valid);
  unknownAccount.entries[0].lines[0].accountNumber = "999999";
  const invalidAccount = validateWorkspace(unknownAccount);
  assert.equal(invalidAccount.success, false);
});

test("le tableau emplois-ressources expose un solde calculé", () => {
  const workspace = baseWorkspace();
  const report = employmentResources(workspace.accounts, workspace.entries);
  assert.equal(report.resources, 100);
  assert.equal(report.jobs, 40);
  assert.equal(report.balance, 60);
});

test("la validation vérifie les dates civiles, les identifiants projet et la hiérarchie budgétaire", () => {
  const invalidDate = baseWorkspace();
  invalidDate.entries[0].date = "2026-02-30";
  assert.equal(validateWorkspace(invalidDate).success, false);

  const duplicateProject = baseWorkspace();
  duplicateProject.projects.push({ ...structuredClone(project), code: "AUTRE" });
  assert.equal(validateWorkspace(duplicateProject).success, false);

  const invalidParent = baseWorkspace();
  invalidParent.projects[0].budgetLines[2].parentId = "section-1";
  assert.equal(validateWorkspace(invalidParent).success, false);
});
