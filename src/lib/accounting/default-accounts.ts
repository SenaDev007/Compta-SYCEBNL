import { isAccountReferenced } from "./account-safety";
import { MAP_AFRIQUE_ACCOUNTS } from "./map-afrique-accounts";
import type { Account, Workspace } from "./types";

/** Remplace les anciens comptes d’exemple par MAP Afrique en préservant les données liées. */
export function installMapAfriqueDefaults(workspace: Workspace): Workspace {
  if (!workspace.accounts.some((account) => account.source === "demo")) return workspace;

  const existingByNumber = new Map(workspace.accounts.map((account) => [account.number, account]));
  const migrated = new Map<string, Account>();

  for (const officialAccount of MAP_AFRIQUE_ACCOUNTS) {
    const existing = existingByNumber.get(officialAccount.number);
    migrated.set(
      officialAccount.number,
      existing && existing.source !== "demo" ? existing : { ...officialAccount },
    );
  }

  for (const existing of workspace.accounts) {
    if (migrated.has(existing.number)) continue;
    if (existing.source !== "demo") {
      migrated.set(existing.number, existing);
    } else if (isAccountReferenced(workspace, existing.number)) {
      migrated.set(existing.number, { ...existing, source: "custom" });
    }
  }

  const accounts = [...migrated.values()].sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }),
  );
  return { ...workspace, accounts, updatedAt: new Date().toISOString() };
}
