import type { Account, Entry, Project, Reconciliation, Workspace } from "./types";

export const amount = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value || 0));
export const money = (value: number) => `${amount(value)} FCFA`;
export const percent = (value: number) =>
  `${(value * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export const entryDebits = (entry: Entry) => entry.lines.reduce((sum, line) => sum + line.debit, 0);
export const entryCredits = (entry: Entry) =>
  entry.lines.reduce((sum, line) => sum + line.credit, 0);
export const entryBalanced = (entry: Entry) =>
  Math.abs(entryDebits(entry) - entryCredits(entry)) < 0.005;
export const yearEntries = (entries: Entry[], year: number) =>
  entries.filter((entry) => Number(entry.date.slice(0, 4)) === year);
export const debitCreditNet = (entries: Entry[], accountNumber: string) =>
  entries.reduce(
    (sum, entry) =>
      sum +
      entry.lines
        .filter((line) => line.accountNumber === accountNumber)
        .reduce((net, line) => net + line.debit - line.credit, 0),
    0,
  );

export function balanceReport(accounts: Account[], entries: Entry[]) {
  const rows = accounts
    .map((account) => {
      const lines = entries.flatMap((entry) =>
        entry.lines.filter((line) => line.accountNumber === account.number),
      );
      const debit = lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = lines.reduce((sum, line) => sum + line.credit, 0);
      const balance = debit - credit;
      return {
        ...account,
        debit,
        credit,
        debitBalance: Math.max(balance, 0),
        creditBalance: Math.max(-balance, 0),
        balance,
      };
    })
    .filter((row) => row.debit || row.credit || row.debitBalance || row.creditBalance);

  return {
    rows,
    totalDebit: rows.reduce((sum, row) => sum + row.debit, 0),
    totalCredit: rows.reduce((sum, row) => sum + row.credit, 0),
    totalDebitBalance: rows.reduce((sum, row) => sum + row.debitBalance, 0),
    totalCreditBalance: rows.reduce((sum, row) => sum + row.creditBalance, 0),
  };
}

export function ledgerReport(accounts: Account[], entries: Entry[], accountNumber: string) {
  const account = accounts.find((item) => item.number === accountNumber);
  let running = 0;
  const rows = entries
    .flatMap((entry) =>
      entry.lines
        .filter((line) => line.accountNumber === accountNumber)
        .map((line) => ({
          date: entry.date,
          journal: entry.journal,
          reference: entry.reference,
          label: entry.label,
          debit: line.debit,
          credit: line.credit,
          entryId: entry.id,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference))
    .map((row) => ({ ...row, balance: (running += row.debit - row.credit) }));

  return { account, rows, closingBalance: running };
}

export function operatingStatement(accounts: Account[], entries: Entry[]) {
  const movements = balanceReport(accounts, entries).rows;
  const charges = movements
    .filter(
      (account) =>
        account.number.startsWith("6") ||
        (account.number.startsWith("8") && Number(account.number[1]) % 2 === 1),
    )
    .map((account) => ({ ...account, amount: account.debit - account.credit }))
    .filter((account) => account.amount !== 0);
  const products = movements
    .filter(
      (account) =>
        account.number.startsWith("7") ||
        (account.number.startsWith("8") && Number(account.number[1]) % 2 === 0),
    )
    .map((account) => ({ ...account, amount: account.credit - account.debit }))
    .filter((account) => account.amount !== 0);
  const totalCharges = charges.reduce((sum, account) => sum + account.amount, 0);
  const totalProducts = products.reduce((sum, account) => sum + account.amount, 0);

  return { charges, products, totalCharges, totalProducts, result: totalProducts - totalCharges };
}

const isChargeAccount = (number: string) =>
  number.startsWith("6") || (number.startsWith("8") && Number(number[1]) % 2 === 1);

export function projectBudget(project: Project, entries: Entry[]) {
  const expenseLines = project.budgetLines.filter((line) => line.kind === "expense");
  const details = expenseLines.map((line) => {
    const budget = (line.quantity || 0) * (line.unitCost || 0);
    const realizedJournal = entries
      .filter((entry) => entry.projectId === project.id)
      .flatMap((entry) =>
        entry.lines.filter(
          (entryLine) =>
            entryLine.budgetLineId === line.id && isChargeAccount(entryLine.accountNumber),
        ),
      )
      .reduce((sum, entryLine) => sum + entryLine.debit - entryLine.credit, 0);
    const realized = (line.priorSpent || 0) + realizedJournal;
    const donorShare = Math.min(budget, Math.max(0, line.donorShare || 0));
    const donorRealized = budget > 0 ? (realized * donorShare) / budget : 0;

    return {
      ...line,
      budget,
      donorShare,
      holderShare: budget - donorShare,
      realized,
      donorRealized,
      holderRealized: realized - donorRealized,
      remaining: budget - realized,
      rate: budget > 0 ? realized / budget : 0,
    };
  });
  const totalBudget = details.reduce((sum, line) => sum + line.budget, 0);
  const totalRealized = details.reduce((sum, line) => sum + line.realized, 0);

  return {
    details,
    totalBudget,
    totalRealized,
    totalDonor: details.reduce((sum, line) => sum + line.donorShare, 0),
    totalHolder: details.reduce((sum, line) => sum + line.holderShare, 0),
    remaining: totalBudget - totalRealized,
    rate: totalBudget > 0 ? totalRealized / totalBudget : 0,
  };
}

export function budgetSubtotals(project: Project, entries: Entry[]) {
  const { details } = projectBudget(project, entries);
  const totals = new Map<string, number>();

  for (const detail of details) {
    let parent = detail.parentId;
    while (parent) {
      totals.set(parent, (totals.get(parent) || 0) + detail.budget);
      parent = project.budgetLines.find((line) => line.id === parent)?.parentId;
    }
  }

  return totals;
}

export function employmentResources(accounts: Account[], entries: Entry[]) {
  const operating = operatingStatement(accounts, entries);
  const balances = balanceReport(accounts, entries).rows;
  const special = (prefixes: string[]) =>
    balances.filter((account) => prefixes.some((prefix) => account.number.startsWith(prefix)));
  const capitalResources = special(["10", "14", "16", "18"]);
  const investmentJobs = special(["21", "22", "23", "24", "25"]);
  const resources =
    operating.totalProducts +
    capitalResources.reduce((sum, account) => sum + account.credit - account.debit, 0);
  const jobs =
    operating.totalCharges +
    investmentJobs.reduce((sum, account) => sum + account.debit - account.credit, 0);
  const rows = [
    {
      label: "Produits de l’exercice",
      amount: operating.totalProducts,
      type: "Ressources",
    },
    ...capitalResources.map((account) => ({
      label: `${account.number} — ${account.label}`,
      amount: account.credit - account.debit,
      type: "Ressources",
    })),
    { label: "Charges de l’exercice", amount: operating.totalCharges, type: "Emplois" },
    ...investmentJobs.map((account) => ({
      label: `${account.number} — ${account.label}`,
      amount: account.debit - account.credit,
      type: "Emplois",
    })),
  ];

  return { resources, jobs, balance: resources - jobs, rows };
}

export function reconcileAccount(workspace: Workspace, reconciliation: Reconciliation) {
  const relevantEntries = workspace.entries.filter((entry) => entry.date <= reconciliation.asOf);
  const allRows = relevantEntries.flatMap((entry) =>
    entry.lines
      .filter((line) => line.accountNumber === reconciliation.accountNumber)
      .map((line) => ({ entry, line })),
  );
  const checked = allRows.filter(({ line }) => reconciliation.checkedLineIds.includes(line.id));
  const unchecked = allRows.filter(({ line }) => !reconciliation.checkedLineIds.includes(line.id));
  const bookBalance = allRows.reduce((sum, { line }) => sum + line.debit - line.credit, 0);
  const unclearedReceipts = unchecked.reduce((sum, { line }) => sum + line.debit, 0);
  const unclearedPayments = unchecked.reduce((sum, { line }) => sum + line.credit, 0);
  const theoretical = bookBalance - unclearedReceipts + unclearedPayments;

  return {
    allRows,
    checked,
    unchecked,
    bookBalance,
    unclearedReceipts,
    unclearedPayments,
    theoretical,
    difference: reconciliation.statementBalance - theoretical,
  };
}

export function narrativeMetrics(workspace: Workspace, entries: Entry[]) {
  const products = operatingStatement(workspace.accounts, entries).products;
  const projectFunding = products.filter((row) => row.number !== "842" && row.number !== "701");
  const volunteers = products
    .filter((row) => row.number === "842")
    .reduce((sum, row) => sum + row.amount, 0);
  const membership = products
    .filter((row) => row.number === "701")
    .reduce((sum, row) => sum + row.amount, 0);
  const byProject = workspace.projects.map((project) => ({
    project,
    expenses: entries
      .filter((entry) => entry.projectId === project.id)
      .flatMap((entry) => entry.lines.filter((line) => line.debit > 0))
      .reduce((sum, line) => sum + line.debit, 0),
  }));

  return {
    resources: operatingStatement(workspace.accounts, entries).totalProducts,
    projectFunding: projectFunding.reduce((sum, account) => sum + account.amount, 0),
    volunteers,
    membership,
    projectsCount: workspace.projects.length,
    partnersCount: new Set(
      workspace.projects.map((project) => project.partner.trim()).filter(Boolean),
    ).size,
    sources: projectFunding,
    byProject,
  };
}
