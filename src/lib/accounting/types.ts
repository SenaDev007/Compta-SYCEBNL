import { MAP_AFRIQUE_ACCOUNTS } from "./map-afrique-accounts";

export type JournalCode = "AC" | "VE" | "BQ" | "CA" | "OD";
export type BudgetKind = "section" | "outcome" | "output" | "activity" | "expense";

export type Account = {
  number: string;
  label: string;
  source?: "demo" | "map" | "import" | "custom";
};
export type JournalLine = {
  id: string;
  accountNumber: string;
  debit: number;
  credit: number;
  budgetLineId?: string;
};
export type Entry = {
  id: string;
  date: string;
  journal: JournalCode;
  reference: string;
  label: string;
  projectId?: string;
  lines: JournalLine[];
  createdAt: string;
};
export type BudgetLine = {
  id: string;
  kind: BudgetKind;
  code: string;
  label: string;
  parentId?: string;
  unit?: string;
  quantity?: number;
  unitCost?: number;
  donorShare?: number;
  priorSpent?: number;
  accountNumber?: string;
};
export type Project = {
  id: string;
  code: string;
  title: string;
  partner: string;
  organization: string;
  startDate?: string;
  endDate?: string;
  highlights: string;
  budgetLines: BudgetLine[];
};
export type Reconciliation = {
  accountNumber: string;
  statementBalance: number;
  checkedLineIds: string[];
  asOf: string;
};
export type ReportSettings = {
  organizationName: string;
  volunteerUse: string;
  membershipUse: string;
  perspectives: string;
};
export type Workspace = {
  schemaVersion: 1;
  updatedAt: string;
  accounts: Account[];
  entries: Entry[];
  projects: Project[];
  reconciliations: Reconciliation[];
  reportSettings: ReportSettings;
};

export function createEmptyWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    accounts: MAP_AFRIQUE_ACCOUNTS.map((account) => ({ ...account })),
    entries: [],
    projects: [],
    reconciliations: [],
    reportSettings: { organizationName: "", volunteerUse: "", membershipUse: "", perspectives: "" },
  };
}

export const BUDGET_KINDS: { kind: BudgetKind; label: string; level: number }[] = [
  { kind: "section", label: "Section", level: 0 },
  { kind: "outcome", label: "Résultat", level: 1 },
  { kind: "output", label: "Produit", level: 2 },
  { kind: "activity", label: "Activité", level: 3 },
  { kind: "expense", label: "Dépense", level: 4 },
];
