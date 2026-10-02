import { z } from "zod";
import type { Workspace } from "./types";
import { entryBalanced, entryCredits, entryDebits } from "./calculations";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const accountSchema = z.object({
  number: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/),
  label: z.string().trim().min(1).max(240),
  source: z.enum(["demo", "map", "import", "custom"]).optional(),
});

const budgetLineSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["section", "outcome", "output", "activity", "expense"]),
  code: z.string().max(50),
  label: z.string().trim().min(1).max(240),
  parentId: z.string().optional(),
  unit: z.string().max(60).optional(),
  quantity: z.number().finite().nonnegative().optional(),
  unitCost: z.number().finite().nonnegative().optional(),
  donorShare: z.number().finite().nonnegative().optional(),
  priorSpent: z.number().finite().nonnegative().optional(),
  accountNumber: z.string().optional(),
});

const lineSchema = z.object({
  id: z.string().min(1).max(100),
  accountNumber: z.string().min(1).max(12),
  debit: z.number().finite().nonnegative(),
  credit: z.number().finite().nonnegative(),
  budgetLineId: z.string().optional(),
});

const entrySchema = z.object({
  id: z.string().min(1).max(100),
  date: isoDate,
  journal: z.enum(["AC", "VE", "BQ", "CA", "OD"]),
  reference: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(500),
  projectId: z.string().optional(),
  lines: z.array(lineSchema).min(2).max(1000),
  createdAt: z.string().min(1).max(80),
});

const projectSchema = z.object({
  id: z.string().min(1).max(100),
  code: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(240),
  partner: z.string().max(240),
  organization: z.string().max(240),
  startDate: z.union([isoDate, z.literal("")]).optional(),
  endDate: z.union([isoDate, z.literal("")]).optional(),
  highlights: z.string().max(10000),
  budgetLines: z.array(budgetLineSchema).max(3000),
});

const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().min(1).max(80),
  accounts: z.array(accountSchema).max(5000),
  entries: z.array(entrySchema).max(50000),
  projects: z.array(projectSchema).max(1000),
  reconciliations: z
    .array(
      z.object({
        accountNumber: z.string().min(1).max(12),
        statementBalance: z.number().finite(),
        checkedLineIds: z.array(z.string().max(100)).max(100000),
        asOf: isoDate,
      }),
    )
    .max(1000),
  reportSettings: z.object({
    organizationName: z.string().max(240),
    volunteerUse: z.string().max(10000),
    membershipUse: z.string().max(10000),
    perspectives: z.string().max(10000),
  }),
});

const budgetKinds = ["section", "outcome", "output", "activity", "expense"] as const;

export function validateWorkspace(
  input: unknown,
): { success: true; data: Workspace } | { success: false; message: string } {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Les données de cette sauvegarde ne sont pas reconnues." };
  }
  const workspace = parsed.data as Workspace;
  const accountNumbers = new Set(workspace.accounts.map((account) => account.number));
  if (accountNumbers.size !== workspace.accounts.length) {
    return { success: false, message: "Le plan comptable contient des numéros en double." };
  }

  const projectMap = new Map(workspace.projects.map((project) => [project.id, project]));
  if (projectMap.size !== workspace.projects.length) {
    return { success: false, message: "Deux projets utilisent la même référence." };
  }

  const entryIds = new Set<string>();
  for (const entry of workspace.entries) {
    if (entryIds.has(entry.id)) {
      return {
        success: false,
        message: "Le journal contient une référence d’écriture en double.",
      };
    }
    entryIds.add(entry.id);

    if (!entryBalanced(entry) || entryDebits(entry) <= 0 || entryCredits(entry) <= 0) {
      return { success: false, message: `L’écriture ${entry.reference} n’est pas équilibrée.` };
    }
    if (entry.projectId && !projectMap.has(entry.projectId)) {
      return {
        success: false,
        message: `Le projet de l’écriture ${entry.reference} est introuvable.`,
      };
    }

    const lineIds = new Set<string>();
    for (const line of entry.lines) {
      if (lineIds.has(line.id)) {
        return {
          success: false,
          message: `L’écriture ${entry.reference} contient une ligne en double.`,
        };
      }
      lineIds.add(line.id);
      if (!accountNumbers.has(line.accountNumber)) {
        return {
          success: false,
          message: `Le compte ${line.accountNumber} est absent du plan comptable.`,
        };
      }
      if (line.debit > 0 && line.credit > 0) {
        return {
          success: false,
          message: "Une ligne ne peut pas comporter simultanément un débit et un crédit.",
        };
      }
      if (line.debit + line.credit <= 0) {
        return {
          success: false,
          message: "Chaque ligne d’écriture doit porter un montant positif.",
        };
      }
      if (line.budgetLineId) {
        const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;
        if (
          !project ||
          !project.budgetLines.some(
            (budgetLine) => budgetLine.id === line.budgetLineId && budgetLine.kind === "expense",
          )
        ) {
          return {
            success: false,
            message: `La ligne budgétaire de l’écriture ${entry.reference} n’appartient pas à son projet.`,
          };
        }
      }
    }
  }

  const projectCodes = new Set<string>();
  const reconciliationAccounts = new Set<string>();
  for (const reconciliation of workspace.reconciliations) {
    if (
      !accountNumbers.has(reconciliation.accountNumber) ||
      !reconciliation.accountNumber.startsWith("52")
    ) {
      return {
        success: false,
        message: "Le rapprochement doit utiliser un compte de banque classe 52.",
      };
    }
    if (reconciliationAccounts.has(reconciliation.accountNumber)) {
      return { success: false, message: "Un seul rapprochement est autorisé par compte bancaire." };
    }
    reconciliationAccounts.add(reconciliation.accountNumber);
  }

  for (const project of workspace.projects) {
    const normalizedCode = project.code.trim().toLocaleLowerCase("fr-FR");
    if (projectCodes.has(normalizedCode)) {
      return { success: false, message: "Les codes projets doivent être uniques." };
    }
    projectCodes.add(normalizedCode);

    const ids = new Set(project.budgetLines.map((line) => line.id));
    if (ids.size !== project.budgetLines.length) {
      return {
        success: false,
        message: `La hiérarchie budgétaire du projet ${project.code} contient une ligne en double.`,
      };
    }

    for (const line of project.budgetLines) {
      const level = budgetKinds.indexOf(line.kind);
      if (
        line.accountNumber &&
        (!accountNumbers.has(line.accountNumber) ||
          (!line.accountNumber.startsWith("6") &&
            !(line.accountNumber.startsWith("8") && Number(line.accountNumber[1]) % 2 === 1)))
      ) {
        return {
          success: false,
          message: `Le compte budgétaire ${line.accountNumber} du projet ${project.code} doit exister et être un compte de charge.`,
        };
      }
      if (line.kind === "expense") {
        const budget = (line.quantity || 0) * (line.unitCost || 0);
        if ((line.donorShare || 0) > budget) {
          return {
            success: false,
            message: `La part bailleur dépasse le budget de la ligne ${line.label}.`,
          };
        }
      }
      if (line.kind === "section" && line.parentId) {
        return { success: false, message: `La section ${line.label} ne peut pas avoir de parent.` };
      }
      if (line.parentId) {
        const parent = project.budgetLines.find((candidate) => candidate.id === line.parentId);
        if (!parent || budgetKinds.indexOf(parent.kind) !== level - 1) {
          return {
            success: false,
            message: `La hiérarchie budgétaire de la ligne ${line.label} est invalide.`,
          };
        }
      } else if (line.kind === "outcome" || line.kind === "output" || line.kind === "activity") {
        return {
          success: false,
          message: `La ligne ${line.label} doit être rattachée à son niveau supérieur.`,
        };
      }
    }

    if (project.startDate && project.endDate && project.startDate > project.endDate) {
      return {
        success: false,
        message: `La date de début du projet ${project.code} est postérieure à sa date de fin.`,
      };
    }
  }

  return { success: true, data: workspace };
}
