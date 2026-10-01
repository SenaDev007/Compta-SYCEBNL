"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  balanceReport,
  employmentResources,
  ledgerReport,
  money,
  operatingStatement,
  percent,
  projectBudget,
  yearEntries,
} from "@/lib/accounting/calculations";
import { exportPdf, exportWorkbook } from "@/lib/accounting/files";
import { Button, Empty, Panel } from "./ui";
import type { ViewProps } from "./shared";

type ReportTab = "ledger" | "balance" | "operating" | "employment" | "budget";
type BudgetDisplay = "line" | "account";
type BudgetAccountTotal = {
  number: string;
  label: string;
  budget: number;
  donorShare: number;
  holderShare: number;
  realized: number;
  donorRealized: number;
  holderRealized: number;
  remaining: number;
};

const tabs: { id: ReportTab; label: string }[] = [
  { id: "ledger", label: "Grand livre" },
  { id: "balance", label: "Balance générale" },
  { id: "operating", label: "Compte d’exploitation" },
  { id: "employment", label: "Emplois-ressources" },
  { id: "budget", label: "Suivi budgétaire" },
];

export function ReportsView({ workspace, year, notify }: ViewProps) {
  const [tab, setTab] = useState<ReportTab>("balance");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [projectId, setProjectId] = useState("Tous les projets");
  const [budgetDisplay, setBudgetDisplay] = useState<BudgetDisplay>("line");
  const entries = useMemo(() => yearEntries(workspace.entries, year), [workspace.entries, year]);
  const balance = useMemo(
    () => balanceReport(workspace.accounts, entries),
    [workspace.accounts, entries],
  );
  const operating = useMemo(
    () => operatingStatement(workspace.accounts, entries),
    [workspace.accounts, entries],
  );
  const ledgerEntries = workspace.entries.filter((entry) => Number(entry.date.slice(0, 4)) <= year);
  const ledger = ledgerReport(
    workspace.accounts,
    ledgerEntries,
    accountNumber || workspace.accounts[0]?.number || "",
  );
  const ledgerRows = ledger.rows.filter((row) => Number(row.date.slice(0, 4)) === year);
  const employment = employmentResources(workspace.accounts, entries);
  const filteredProjects = useMemo(
    () =>
      workspace.projects.filter(
        (project) => projectId === "Tous les projets" || project.id === projectId,
      ),
    [workspace.projects, projectId],
  );
  const budgetByAccount = useMemo(() => {
    const totals = new Map<string, BudgetAccountTotal>();
    for (const project of filteredProjects) {
      for (const line of projectBudget(project, entries).details) {
        const number = line.accountNumber || "Non affecté";
        const account = workspace.accounts.find((candidate) => candidate.number === number);
        const total =
          totals.get(number) ||
          ({
            number,
            label:
              account?.label ||
              (number === "Non affecté" ? "Compte non affecté" : "Compte inconnu"),
            budget: 0,
            donorShare: 0,
            holderShare: 0,
            realized: 0,
            donorRealized: 0,
            holderRealized: 0,
            remaining: 0,
          } satisfies BudgetAccountTotal);
        total.budget += line.budget;
        total.donorShare += line.donorShare;
        total.holderShare += line.holderShare;
        total.realized += line.realized;
        total.donorRealized += line.donorRealized;
        total.holderRealized += line.holderRealized;
        total.remaining += line.remaining;
        totals.set(number, total);
      }
    }
    return [...totals.values()].sort((a, b) =>
      a.number.localeCompare(b.number, "fr", { numeric: true }),
    );
  }, [filteredProjects, entries, workspace.accounts]);
  const download = async (format: "excel" | "pdf") => {
    if (exporting) return;
    setExporting(format);
    try {
      if (format === "excel") {
        const source = await exportWorkbook(workspace, year);
        notify(
          source === "device"
            ? "Le classeur a été créé sur cet appareil."
            : "Le classeur a été téléchargé.",
        );
      } else {
        const source = await exportPdf(workspace, year, "financial");
        notify(
          source === "print"
            ? "Le rapport est prêt à être imprimé ou enregistré au format PDF."
            : "Le rapport PDF a été téléchargé.",
        );
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Le document n’a pas pu être créé.");
    } finally {
      setExporting(null);
    }
  };
  const totalBudgetByAccount = budgetByAccount.reduce(
    (total, row) => ({
      budget: total.budget + row.budget,
      donor: total.donor + row.donorShare,
      holder: total.holder + row.holderShare,
      realized: total.realized + row.realized,
      donorRealized: total.donorRealized + row.donorRealized,
      holderRealized: total.holderRealized + row.holderRealized,
      remaining: total.remaining + row.remaining,
    }),
    {
      budget: 0,
      donor: 0,
      holder: 0,
      realized: 0,
      donorRealized: 0,
      holderRealized: 0,
      remaining: 0,
    },
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">États comptables · Exercice {year}</div>
          <h1>Rapports & états</h1>
          <p>États calculés depuis les écritures équilibrées du journal.</p>
        </div>
        <div className="actions">
          <Button disabled={exporting !== null} onClick={() => void download("excel")}>
            <Download />
            {exporting === "excel" ? "Préparation…" : "Télécharger Excel"}
          </Button>
          <Button
            variant="primary"
            disabled={exporting !== null}
            onClick={() => void download("pdf")}
          >
            <Download />
            {exporting === "pdf" ? "Préparation…" : "Télécharger PDF"}
          </Button>
        </div>
      </div>

      <Panel title="État financier" caption="Montants en FCFA, arrondis à l’unité.">
        <div className="panel-body" style={{ paddingBottom: 0 }}>
          <div className="tabs">
            {tabs.map((item) => (
              <button
                className={`tab ${tab === item.id ? "active" : ""}`}
                onClick={() => setTab(item.id)}
                key={item.id}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "ledger" && (
            <>
              <div className="toolbar">
                <label style={{ fontSize: 11, color: "#758078" }}>Compte</label>
                <select
                  className="select"
                  style={{ width: "min(520px,100%)" }}
                  value={accountNumber || workspace.accounts[0]?.number || ""}
                  onChange={(event) => setAccountNumber(event.target.value)}
                >
                  {workspace.accounts.map((account) => (
                    <option key={account.number} value={account.number}>
                      {account.number} — {account.label}
                    </option>
                  ))}
                </select>
              </div>
              {!ledgerRows.length ? (
                <Empty title="Aucun mouvement sur ce compte">
                  Choisissez un autre compte ou vérifiez l’exercice.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Journal</th>
                        <th>Pièce</th>
                        <th>Libellé</th>
                        <th className="num">Débit</th>
                        <th className="num">Crédit</th>
                        <th className="num">Solde cumulé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((row, index) => (
                        <tr key={`${row.entryId}-${index}`}>
                          <td>{new Date(`${row.date}T12:00:00`).toLocaleDateString("fr-FR")}</td>
                          <td>{row.journal}</td>
                          <td className="account-code">{row.reference}</td>
                          <td>{row.label}</td>
                          <td className="num">{money(row.debit)}</td>
                          <td className="num">{money(row.credit)}</td>
                          <td className="num">{money(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="summary-strip">
                Compte{" "}
                <strong>
                  {ledger.account?.number} — {ledger.account?.label}
                </strong>
                <span>
                  Solde final <strong>{money(ledger.closingBalance)}</strong>
                </span>
              </div>
            </>
          )}

          {tab === "balance" && (
            <>
              {!balance.rows.length ? (
                <Empty title="Balance vide pour cet exercice">
                  Les comptes apparaîtront après les premières écritures.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Compte</th>
                        <th>Libellé</th>
                        <th className="num">Mouv. débit</th>
                        <th className="num">Mouv. crédit</th>
                        <th className="num">Solde débiteur</th>
                        <th className="num">Solde créditeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balance.rows.map((row) => (
                        <tr key={row.number}>
                          <td className="account-code">{row.number}</td>
                          <td>{row.label}</td>
                          <td className="num">{money(row.debit)}</td>
                          <td className="num">{money(row.credit)}</td>
                          <td className="num">{money(row.debitBalance)}</td>
                          <td className="num">{money(row.creditBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2}>Totaux</th>
                        <th className="num">{money(balance.totalDebit)}</th>
                        <th className="num">{money(balance.totalCredit)}</th>
                        <th className="num">{money(balance.totalDebitBalance)}</th>
                        <th className="num">{money(balance.totalCreditBalance)}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div className="summary-strip">
                <span>
                  Équilibre des mouvements{" "}
                  <strong>
                    {Math.abs(balance.totalDebit - balance.totalCredit) < 0.005
                      ? "Équilibré"
                      : "Écart"}
                  </strong>
                </span>
                <span>
                  Comptes mouvementés <strong>{balance.rows.length}</strong>
                </span>
              </div>
            </>
          )}

          {tab === "operating" && (
            <>
              <div className="notice warning" style={{ marginBottom: 13 }}>
                Compte d’exploitation selon l’hypothèse du cahier des charges : charges en classe 6
                et classe 8 à deuxième chiffre impair ; produits en classe 7 et classe 8 à deuxième
                chiffre pair. Confirmez cette règle avec votre plan comptable.
              </div>
              <div className="grid dashboard-grid">
                <Panel title="Produits" caption="Crédit − débit">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Compte</th>
                          <th>Libellé</th>
                          <th className="num">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operating.products.map((row) => (
                          <tr key={row.number}>
                            <td className="account-code">{row.number}</td>
                            <td>{row.label}</td>
                            <td className="num">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={2}>Total produits</th>
                          <th className="num">{money(operating.totalProducts)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Panel>
                <Panel title="Charges" caption="Débit − crédit">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Compte</th>
                          <th>Libellé</th>
                          <th className="num">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operating.charges.map((row) => (
                          <tr key={row.number}>
                            <td className="account-code">{row.number}</td>
                            <td>{row.label}</td>
                            <td className="num">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={2}>Total charges</th>
                          <th className="num">{money(operating.totalCharges)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Panel>
              </div>
              <div className="summary-strip">
                {operating.result >= 0 ? "Excédent" : "Déficit"} de l’exercice{" "}
                <strong>{money(Math.abs(operating.result))}</strong>
              </div>
            </>
          )}

          {tab === "employment" && (
            <>
              <div className="notice warning" style={{ marginBottom: 13 }}>
                Version simplifiée selon la spécification : ressources = produits, comptes 10, 14,
                16, 18 ; emplois = charges et acquisitions en 21–25. À adapter au modèle de l’entité
                et du bailleur.
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Rubrique</th>
                      <th>Type</th>
                      <th className="num">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employment.rows.map((row, index) => (
                      <tr key={`${row.label}-${index}`}>
                        <td>{row.label}</td>
                        <td>
                          <span className={`pill ${row.type === "Ressources" ? "green" : "amber"}`}>
                            {row.type}
                          </span>
                        </td>
                        <td className="num">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>Total ressources</th>
                      <th className="num">{money(employment.resources)}</th>
                    </tr>
                    <tr>
                      <th colSpan={2}>Total emplois</th>
                      <th className="num">{money(employment.jobs)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="summary-strip">
                Solde ressources − emplois <strong>{money(employment.balance)}</strong>
              </div>
            </>
          )}

          {tab === "budget" && (
            <>
              <div className="toolbar">
                <label style={{ fontSize: 11, color: "#758078" }}>Périmètre</label>
                <select
                  className="select"
                  style={{ width: "min(360px,100%)" }}
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option>Tous les projets</option>
                  {workspace.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} — {project.title}
                    </option>
                  ))}
                </select>
                <div className="tabs" role="group" aria-label="Regroupement budgétaire">
                  <button
                    className={`tab ${budgetDisplay === "line" ? "active" : ""}`}
                    onClick={() => setBudgetDisplay("line")}
                  >
                    Par ligne
                  </button>
                  <button
                    className={`tab ${budgetDisplay === "account" ? "active" : ""}`}
                    onClick={() => setBudgetDisplay("account")}
                  >
                    Par compte
                  </button>
                </div>
              </div>
              {!filteredProjects.length ? (
                <Empty title="Aucun budget à afficher">
                  Créez un projet puis ajoutez ses lignes budgétaires.
                </Empty>
              ) : budgetDisplay === "account" ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Compte</th>
                        <th>Libellé</th>
                        <th className="num">Budget</th>
                        <th className="num">Bailleur</th>
                        <th className="num">Porteur</th>
                        <th className="num">Réalisé</th>
                        <th className="num">Réalisé bailleur</th>
                        <th className="num">Réalisé porteur</th>
                        <th className="num">Écart</th>
                        <th className="num">Taux</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetByAccount.map((row) => (
                        <tr key={row.number}>
                          <td className="account-code">
                            {row.number === "Non affecté" ? "—" : row.number}
                          </td>
                          <td>{row.label}</td>
                          <td className="num">{money(row.budget)}</td>
                          <td className="num">{money(row.donorShare)}</td>
                          <td className="num">{money(row.holderShare)}</td>
                          <td className="num">{money(row.realized)}</td>
                          <td className="num">{money(row.donorRealized)}</td>
                          <td className="num">{money(row.holderRealized)}</td>
                          <td className="num">{money(row.remaining)}</td>
                          <td className="num">
                            {percent(row.budget > 0 ? row.realized / row.budget : 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2}>Total du périmètre sélectionné</th>
                        <th className="num">{money(totalBudgetByAccount.budget)}</th>
                        <th className="num">{money(totalBudgetByAccount.donor)}</th>
                        <th className="num">{money(totalBudgetByAccount.holder)}</th>
                        <th className="num">{money(totalBudgetByAccount.realized)}</th>
                        <th className="num">{money(totalBudgetByAccount.donorRealized)}</th>
                        <th className="num">{money(totalBudgetByAccount.holderRealized)}</th>
                        <th className="num">{money(totalBudgetByAccount.remaining)}</th>
                        <th className="num">
                          {percent(
                            totalBudgetByAccount.budget > 0
                              ? totalBudgetByAccount.realized / totalBudgetByAccount.budget
                              : 0,
                          )}
                        </th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <div key={project.id} style={{ marginBottom: 17 }}>
                    <div className="panel-title" style={{ padding: "10px 0" }}>
                      {project.code} · {project.title}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Ligne de dépense</th>
                            <th>Compte</th>
                            <th className="num">Budget</th>
                            <th className="num">Bailleur</th>
                            <th className="num">Porteur</th>
                            <th className="num">Réalisé</th>
                            <th className="num">Réalisé bailleur</th>
                            <th className="num">Réalisé porteur</th>
                            <th className="num">Reste</th>
                            <th className="num">Taux</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectBudget(project, entries).details.map((line) => (
                            <tr key={line.id}>
                              <td>
                                {line.code ? `${line.code} · ` : ""}
                                {line.label}
                              </td>
                              <td className="account-code">{line.accountNumber || "—"}</td>
                              <td className="num">{money(line.budget)}</td>
                              <td className="num">{money(line.donorShare)}</td>
                              <td className="num">{money(line.holderShare)}</td>
                              <td className="num">{money(line.realized)}</td>
                              <td className="num">{money(line.donorRealized)}</td>
                              <td className="num">{money(line.holderRealized)}</td>
                              <td className="num">{money(line.remaining)}</td>
                              <td className="num">{percent(line.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </Panel>

      <div className="notice" style={{ marginTop: 13 }}>
        Montants affichés arrondis à l’unité FCFA. Le grand livre présente le solde débiteur positif
        et créditeur négatif selon la formule débit moins crédit.
      </div>
    </>
  );
}
