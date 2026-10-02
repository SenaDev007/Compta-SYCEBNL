import test from "node:test";
import assert from "node:assert/strict";
import { isAccountReferenced } from "../src/lib/accounting/account-safety";
import { createEmptyWorkspace } from "../src/lib/accounting/types";

test("un compte utilisé dans le journal ne peut pas être supprimé", () => {
  const workspace = createEmptyWorkspace();
  workspace.entries.push({
    id: "entry-1",
    date: "2026-01-10",
    journal: "AC",
    reference: "ACH-001",
    label: "Achat de fournitures",
    lines: [{ id: "line-1", accountNumber: "601", debit: 100, credit: 0 }],
    createdAt: "2026-01-10T10:00:00.000Z",
  });
  assert.equal(isAccountReferenced(workspace, "601"), true);
});

test("un compte affecté à un budget ou un rapprochement reste protégé", () => {
  const budgetWorkspace = createEmptyWorkspace();
  budgetWorkspace.projects.push({
    id: "project-1",
    code: "PROJ-1",
    title: "Projet associatif",
    partner: "Partenaire",
    organization: "Association",
    highlights: "",
    budgetLines: [
      { id: "line-1", kind: "expense", code: "1.1", label: "Fournitures", accountNumber: "601" },
    ],
  });
  assert.equal(isAccountReferenced(budgetWorkspace, "601"), true);

  const reconciliationWorkspace = createEmptyWorkspace();
  reconciliationWorkspace.reconciliations.push({
    accountNumber: "521",
    statementBalance: 0,
    checkedLineIds: [],
    asOf: "2026-01-31",
  });
  assert.equal(isAccountReferenced(reconciliationWorkspace, "521"), true);
});

test("un compte jamais utilisé peut être supprimé", () => {
  assert.equal(isAccountReferenced(createEmptyWorkspace(), "999"), false);
});
