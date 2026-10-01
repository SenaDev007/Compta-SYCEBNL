"use client";
import { ArrowDownLeft, ArrowUpRight, BookOpen, FolderKanban, Landmark, Plus } from "lucide-react";
import {
  balanceReport,
  money,
  operatingStatement,
  percent,
  projectBudget,
  yearEntries,
} from "@/lib/accounting/calculations";
import { Button, Empty, Panel, StatCard } from "./ui";
import type { ViewProps } from "./shared";

export function Dashboard({ workspace, year, notify }: ViewProps) {
  const entries = yearEntries(workspace.entries, year);
  const operating = operatingStatement(workspace.accounts, entries);
  const balance = balanceReport(workspace.accounts, entries);
  const projects = workspace.projects.map((project) => ({
    project,
    ...projectBudget(project, entries),
  }));
  const turnover = Math.max(operating.totalProducts, 1);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Vue d’ensemble · Exercice {year}</div>
          <h1>Bonjour, votre comptabilité.</h1>
          <p>Un regard clair sur les ressources, les projets et les écritures de l’exercice.</p>
        </div>
        <div className="actions">
          <Button onClick={() => notify("Ouvrez le Journal pour saisir une nouvelle écriture.")}>
            <Plus />
            Nouvelle écriture
          </Button>
        </div>
      </div>
      {workspace.accounts.some((a) => a.source === "demo") && (
        <div className="notice warning" style={{ marginBottom: 16 }}>
          <strong>Plan de démonstration.</strong> Les comptes affichés sont un jeu de départ non
          officiel. Importez le plan SYCEBNL MAP AFRIQUE pour retrouver les 1 130 libellés attendus.
        </div>
      )}
      <div className="grid stats-grid">
        <StatCard
          label="Ressources de l’exercice"
          value={money(operating.totalProducts)}
          hint={`${entries.length} écriture${entries.length > 1 ? "s" : ""} comptabilisée${entries.length > 1 ? "s" : ""}`}
          icon={<ArrowDownLeft />}
        />
        <StatCard
          label="Charges de l’exercice"
          value={money(operating.totalCharges)}
          hint="Comptes de charges selon le référentiel paramétré"
          icon={<ArrowUpRight />}
        />
        <StatCard
          label={operating.result >= 0 ? "Excédent de l’exercice" : "Déficit de l’exercice"}
          value={money(Math.abs(operating.result))}
          hint="Produits moins charges"
          icon={<BookOpen />}
        />
        <StatCard
          label="Projets actifs"
          value={String(workspace.projects.length)}
          hint={`${workspace.projects.filter((p) => p.partner).length} partenaire${workspace.projects.filter((p) => p.partner).length === 1 ? "" : "s"} financier${workspace.projects.filter((p) => p.partner).length === 1 ? "" : "s"}`}
          icon={<FolderKanban />}
        />
      </div>
      <div className="grid dashboard-grid">
        <Panel
          title="Dernières écritures"
          caption={`Exercice ${year}`}
          action={<span className="pill">{entries.length} au total</span>}
        >
          {entries.length === 0 ? (
            <Empty title="Aucune écriture pour cet exercice">
              Le journal sera votre point de départ.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pièce</th>
                    <th>Libellé</th>
                    <th>Journal</th>
                    <th className="num">Débit</th>
                    <th className="num">Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 7)
                    .map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-FR")}</td>
                        <td className="account-code">{entry.reference}</td>
                        <td>{entry.label}</td>
                        <td>
                          <span className="pill">{entry.journal}</span>
                        </td>
                        <td className="num">
                          {money(entry.lines.reduce((s, l) => s + l.debit, 0))}
                        </td>
                        <td className="num">
                          {money(entry.lines.reduce((s, l) => s + l.credit, 0))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel
          title="Exécution des projets"
          caption="Budget prévu et réalisé par projet"
          action={<Landmark size={16} color="#71917f" />}
        >
          {projects.length === 0 ? (
            <Empty title="Aucun projet créé">
              Ajoutez un projet pour suivre son budget et ses réalisations.
            </Empty>
          ) : (
            <div className="chart-bars">
              {projects.map(({ project, totalBudget, totalRealized, rate }) => (
                <div key={project.id}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 7,
                      fontSize: 11,
                    }}
                  >
                    <span className="project-chip">
                      <i />
                      {project.code} · {project.title}
                    </span>
                    <strong className="num">{percent(rate)}</strong>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.min(100, Math.max(0, rate * 100))}%` }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#89948e",
                      fontSize: 10,
                      marginTop: 5,
                    }}
                  >
                    <span>Réalisé {money(totalRealized)}</span>
                    <span>Budget {money(totalBudget)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel
          title="Équilibre de la balance"
          caption="Mouvements cumulés sur l’exercice"
          className=""
          action={
            <span className="pill green">
              {Math.abs(balance.totalDebit - balance.totalCredit) < 0.005
                ? "Équilibrée"
                : "À vérifier"}
            </span>
          }
        >
          <div className="summary-strip" style={{ justifyContent: "space-between", margin: 0 }}>
            <span>
              Total débit <strong>{money(balance.totalDebit)}</strong>
            </span>
            <span>
              Total crédit <strong>{money(balance.totalCredit)}</strong>
            </span>
          </div>
        </Panel>
        <Panel title="Repères de gestion" caption="Calculés depuis le journal validé">
          <div style={{ display: "grid", gap: 13, fontSize: 11, color: "#748078" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              Comptes mouvementés{" "}
              <strong className="num" style={{ color: "#24372e" }}>
                {balance.rows.length}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              Taux de couverture des ressources{" "}
              <strong className="num" style={{ color: "#24372e" }}>
                {percent(operating.totalProducts ? operating.totalCharges / turnover : 0)}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              Écritures à contrôler{" "}
              <strong className="num" style={{ color: "#24372e" }}>
                {
                  entries.filter(
                    (entry) =>
                      Math.abs(entry.lines.reduce((s, l) => s + l.debit - l.credit, 0)) >= 0.005,
                  ).length
                }
              </strong>
            </div>
            <div className="notice">
              Les calculs suivent les hypothèses du cahier des charges (notamment la classification
              des comptes 8), à valider avec le plan comptable officiel.
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
