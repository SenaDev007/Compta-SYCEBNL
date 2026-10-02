import type { Workspace } from "./types";

type AccountReferenceData = Pick<Workspace, "entries" | "projects" | "reconciliations">;

export function referencedAccountNumbers(workspace: AccountReferenceData): Set<string> {
  const referenced = new Set<string>();
  for (const entry of workspace.entries) {
    for (const line of entry.lines) referenced.add(line.accountNumber);
  }
  for (const project of workspace.projects) {
    for (const line of project.budgetLines) {
      if (line.accountNumber) referenced.add(line.accountNumber);
    }
  }
  for (const reconciliation of workspace.reconciliations) {
    referenced.add(reconciliation.accountNumber);
  }
  return referenced;
}

export function isAccountReferenced(
  workspace: AccountReferenceData,
  accountNumber: string,
): boolean {
  return referencedAccountNumbers(workspace).has(accountNumber);
}
