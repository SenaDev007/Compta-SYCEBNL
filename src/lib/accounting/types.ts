export type JournalCode = "AC" | "VE" | "BQ" | "CA" | "OD";
export type BudgetKind = "section" | "outcome" | "output" | "activity" | "expense";

export type Account = { number: string; label: string; source?: "demo" | "import" | "custom" };
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

export const DEMO_ACCOUNTS: Account[] = [
  { number: "101", label: "Fonds associatifs sans droit de reprise", source: "demo" },
  { number: "106", label: "Réserves", source: "demo" },
  { number: "141", label: "Subventions d’investissement", source: "demo" },
  { number: "161", label: "Emprunts et dettes assimilées", source: "demo" },
  { number: "181", label: "Dettes liées à des participations", source: "demo" },
  { number: "211", label: "Terrains", source: "demo" },
  { number: "218", label: "Autres immobilisations corporelles", source: "demo" },
  { number: "401", label: "Fournisseurs", source: "demo" },
  { number: "411", label: "Adhérents et usagers", source: "demo" },
  { number: "421", label: "Personnel — rémunérations dues", source: "demo" },
  { number: "443", label: "Organismes internationaux — subventions", source: "demo" },
  { number: "445", label: "État et collectivités publiques", source: "demo" },
  { number: "471", label: "Comptes d’attente", source: "demo" },
  { number: "521", label: "Banques locales", source: "demo" },
  { number: "571", label: "Caisse", source: "demo" },
  { number: "601", label: "Achats de matières et fournitures", source: "demo" },
  { number: "604", label: "Achats d’études et prestations de services", source: "demo" },
  { number: "613", label: "Locations", source: "demo" },
  { number: "621", label: "Personnel extérieur à l’entité", source: "demo" },
  { number: "625", label: "Déplacements, missions et réceptions", source: "demo" },
  { number: "626", label: "Frais postaux et télécommunications", source: "demo" },
  { number: "627", label: "Services bancaires", source: "demo" },
  { number: "641", label: "Impôts et taxes directs", source: "demo" },
  { number: "658", label: "Charges diverses", source: "demo" },
  { number: "701", label: "Cotisations des membres (hypothèse à valider)", source: "demo" },
  { number: "706", label: "Services vendus et prestations fournies", source: "demo" },
  { number: "741", label: "Subventions d’exploitation", source: "demo" },
  { number: "758", label: "Produits divers", source: "demo" },
  { number: "841", label: "Contributions volontaires en nature — emploi", source: "demo" },
  {
    number: "842",
    label: "Contributions volontaires en nature — ressources (hypothèse à valider)",
    source: "demo",
  },
];

export function createEmptyWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    accounts: DEMO_ACCOUNTS.map((a) => ({ ...a })),
    entries: [],
    projects: [],
    reconciliations: [],
    reportSettings: { organizationName: "", volunteerUse: "", membershipUse: "", perspectives: "" },
  };
}

export const BUDGET_KINDS: { kind: BudgetKind; label: string; level: number }[] = [
  { kind: "section", label: "Section", level: 0 },
  { kind: "outcome", label: "Outcome", level: 1 },
  { kind: "output", label: "Output", level: 2 },
  { kind: "activity", label: "Activité", level: 3 },
  { kind: "expense", label: "Ligne de dépense", level: 4 },
];
