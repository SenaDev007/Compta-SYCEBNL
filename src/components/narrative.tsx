"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  money,
  operatingStatement,
  percent,
  projectBudget,
  yearEntries,
} from "@/lib/accounting/calculations";
import { exportPdf } from "@/lib/accounting/files";
import { Button, Empty, Field, Panel } from "./ui";
import type { ViewProps } from "./shared";

export function NarrativeView({ workspace, setWorkspace, year, notify }: ViewProps) {
  const [exporting, setExporting] = useState(false);
  const entries = yearEntries(workspace.entries, year);
  const operating = operatingStatement(workspace.accounts, entries);
  const metrics = useMemo(() => {
    const products = operating.products;
    const volunteer = products.find((p) => p.number === "842")?.amount || 0;
    const membership = products.find((p) => p.number === "701")?.amount || 0;
    const projectSources = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.projectId) continue;
      for (const line of entry.lines) {
        const account = workspace.accounts.find((a) => a.number === line.accountNumber);
        if (!account) continue;
        const product =
          account.number.startsWith("7") ||
          (account.number.startsWith("8") && Number(account.number[1]) % 2 === 0);
        if (!product || account.number === "842" || account.number === "701") continue;
        const value = line.credit - line.debit;
        if (value !== 0)
          projectSources.set(account.number, (projectSources.get(account.number) || 0) + value);
      }
    }
    const sources = [...projectSources]
      .filter(([, value]) => value !== 0)
      .map(([number, value]) => ({
        number,
        label: workspace.accounts.find((a) => a.number === number)?.label || "",
        value,
      }))
      .sort((a, b) => b.value - a.value);
    const totalFunding = sources.reduce((s, a) => s + a.value, 0);
    const byProject = workspace.projects.map((project) => {
      const categories = new Map<string, number>();
      for (const entry of entries.filter((e) => e.projectId === project.id)) {
        for (const line of entry.lines) {
          const account = workspace.accounts.find((a) => a.number === line.accountNumber);
          const isCharge =
            account?.number.startsWith("6") ||
            (account?.number.startsWith("8") && Number(account.number[1]) % 2 === 1);
          const amount = line.debit - line.credit;
          if (account && isCharge && amount !== 0)
            categories.set(account.number, (categories.get(account.number) || 0) + amount);
        }
      }
      return {
        project,
        categories: [...categories].map(([number, value]) => ({
          number,
          label: workspace.accounts.find((a) => a.number === number)?.label || "",
          value,
        })),
        total: [...categories.values()].reduce((s, v) => s + v, 0),
      };
    });
    const plannedCharges = workspace.projects
      .flatMap((project) =>
        projectBudget(project, entries)
          .details.filter(
            (line) =>
              line.accountNumber?.startsWith("6") ||
              (line.accountNumber?.startsWith("8") && Number(line.accountNumber[1]) % 2 === 1),
          )
          .map((line) => ({ project: project.code, label: line.label, value: line.budget })),
      )
      .reduce((s, line) => s + line.value, 0);
    return {
      volunteer,
      membership,
      sources,
      totalFunding,
      byProject,
      plannedCharges,
      partnerCount: new Set(workspace.projects.map((p) => p.partner.trim()).filter(Boolean)).size,
    };
  }, [workspace, entries, operating.products]);
  const updateText = (
    field: "organizationName" | "volunteerUse" | "membershipUse" | "perspectives",
    value: string,
  ) => setWorkspace((w) => ({ ...w, reportSettings: { ...w.reportSettings, [field]: value } }));
  const createPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const source = await exportPdf(workspace, year, "narrative");
      notify(
        source === "print"
          ? "Le rapport est prêt à être imprimé ou enregistré au format PDF."
          : "Le rapport narratif a été téléchargé.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Le rapport n’a pas pu être créé.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <div className="page-head no-print">
        <div>
          <div className="page-kicker">Rapport de gestion · Exercice {year}</div>
          <h1>Rapport financier narratif</h1>
          <p>
            Chiffres automatiques et commentaires personnalisables, prêts à partager ou archiver.
          </p>
        </div>
        <div className="actions">
          <Button variant="primary" disabled={exporting} onClick={() => void createPdf()}>
            <Download />
            {exporting ? "Préparation…" : "Télécharger le PDF"}
          </Button>
        </div>
      </div>
      <div className="print-only" style={{ marginBottom: 18 }}>
        <strong>Compta SYCEBNL+ · Rapport financier {year}</strong>
        <div>{workspace.reportSettings.organizationName || "Organisation"}</div>
      </div>
      <Panel
        title="Paramètres du rapport"
        caption="Les textes libres sont enregistrés avec vos données."
      >
        <div className="panel-body">
          <div className="form-grid">
            <Field label="Nom de l’organisation">
              <input
                className="input"
                value={workspace.reportSettings.organizationName}
                onChange={(e) => updateText("organizationName", e.target.value)}
                placeholder="Nom légal de l’organisation"
              />
            </Field>
            <Field label="Exercice">
              <div className="narrative-exercise" aria-label={`Exercice ${year}`}>
                {year}
              </div>
            </Field>
            <Field label="Affectation du bénévolat valorisé">
              <textarea
                className="textarea"
                value={workspace.reportSettings.volunteerUse}
                onChange={(e) => updateText("volunteerUse", e.target.value)}
                placeholder="Décrire les activités soutenues par les contributions volontaires"
              />
            </Field>
            <Field label="Affectation des cotisations des membres">
              <textarea
                className="textarea"
                value={workspace.reportSettings.membershipUse}
                onChange={(e) => updateText("membershipUse", e.target.value)}
                placeholder="Décrire les usages et actions financés par les cotisations"
              />
            </Field>
            <Field label="Perspectives">
              <textarea
                className="textarea"
                value={workspace.reportSettings.perspectives}
                onChange={(e) => updateText("perspectives", e.target.value)}
                placeholder="Orientations et priorités du prochain exercice"
              />
            </Field>
          </div>
        </div>
      </Panel>
      <div style={{ display: "grid", gap: 14, marginTop: 15 }}>
        <Panel title="1. Chiffres clés" caption={`Synthèse de l’exercice ${year}`}>
          <div className="panel-body">
            <div className="grid stats-grid" style={{ margin: 0 }}>
              <div>
                <div className="stat-label">Ressources totales</div>
                <div className="stat-value num">{money(operating.totalProducts)}</div>
              </div>
              <div>
                <div className="stat-label">Financements affectés à des projets</div>
                <div className="stat-value num">{money(metrics.totalFunding)}</div>
              </div>
              <div>
                <div className="stat-label">Bénévolat valorisé</div>
                <div className="stat-value num">{money(metrics.volunteer)}</div>
              </div>
              <div>
                <div className="stat-label">Cotisations des membres</div>
                <div className="stat-value num">{money(metrics.membership)}</div>
              </div>
            </div>
            <div className="summary-strip">
              <span>
                Projets <strong>{workspace.projects.length}</strong>
              </span>
              <span>
                Partenaires financiers <strong>{metrics.partnerCount}</strong>
              </span>
              <span>
                Résultat de l’exercice <strong>{money(operating.result)}</strong>
              </span>
            </div>
          </div>
        </Panel>
        <Panel
          title="2. Répartition des financements par source"
          caption="Produits affectés à un projet, hors comptes 842 et 701"
        >
          <div className="table-wrap">
            {!metrics.sources.length ? (
              <Empty title="Aucun financement de projet comptabilisé">
                Rattachez les produits concernés à un projet dans le journal.
              </Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Compte / source</th>
                    <th>Libellé</th>
                    <th className="num">Montant</th>
                    <th className="num">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.sources.map((source) => (
                    <tr key={source.number}>
                      <td className="account-code">{source.number}</td>
                      <td>{source.label}</td>
                      <td className="num">{money(source.value)}</td>
                      <td className="num">
                        {percent(metrics.totalFunding ? source.value / metrics.totalFunding : 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={2}>Total financements de projets</th>
                    <th className="num">{money(metrics.totalFunding)}</th>
                    <th className="num">100 %</th>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </Panel>
        <Panel
          title="3. Réalisations majeures et dépenses par projet"
          caption="Synthèse qualitative saisie dans chaque fiche projet"
        >
          <div className="panel-body" style={{ display: "grid", gap: 16 }}>
            {!workspace.projects.length ? (
              <Empty title="Aucun projet à présenter">
                Créez une fiche projet et renseignez ses réalisations majeures.
              </Empty>
            ) : (
              metrics.byProject.map(({ project, categories, total }) => (
                <div
                  key={project.id}
                  style={{ borderBottom: "1px solid #edf0ed", paddingBottom: 13 }}
                >
                  <div className="project-chip">
                    <i />
                    {project.code} · {project.title}
                  </div>
                  <div style={{ marginTop: 7, color: "#68766e", fontSize: 12, lineHeight: 1.6 }}>
                    {project.highlights || "Aucune réalisation majeure renseignée."}
                  </div>
                  <div className="summary-strip">
                    <span>
                      Partenaire <strong>{project.partner || "—"}</strong>
                    </span>
                    <span>
                      Dépenses par comptes de charge <strong>{money(total)}</strong>
                    </span>
                  </div>
                  {categories.length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Catégorie de charge</th>
                            <th className="num">Dépense</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.map((c) => (
                            <tr key={c.number}>
                              <td>
                                {c.number} · {c.label}
                              </td>
                              <td className="num">{money(c.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Panel>
        <Panel
          title="4. Bénévolat valorisé et cotisations"
          caption="Montants calculés, affectations décrites par l’organisation"
        >
          <div className="panel-body">
            <div className="form-grid">
              <div>
                <div className="panel-title">Contributions volontaires en nature · 842</div>
                <p className="panel-caption" style={{ lineHeight: 1.6 }}>
                  {workspace.reportSettings.volunteerUse ||
                    "Affectation à compléter par l’organisation."}
                </p>
                <strong className="num">{money(metrics.volunteer)}</strong>
              </div>
              <div>
                <div className="panel-title">Cotisations des membres · 701</div>
                <p className="panel-caption" style={{ lineHeight: 1.6 }}>
                  {workspace.reportSettings.membershipUse ||
                    "Affectation à compléter par l’organisation."}
                </p>
                <strong className="num">{money(metrics.membership)}</strong>
              </div>
            </div>
            <div className="notice warning" style={{ marginTop: 13 }}>
              Les comptes 842 (bénévolat) et 701 (cotisations) sont des hypothèses de lecture du
              plan et restent à valider.
            </div>
          </div>
        </Panel>
        <Panel
          title="5. Perspectives"
          caption="Texte libre et prévision de charges issue des lignes budgétaires saisies"
        >
          <div className="panel-body">
            <p style={{ color: "#58685f", fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {workspace.reportSettings.perspectives ||
                "Perspectives à compléter par l’organisation."}
            </p>
            <div className="summary-strip">
              Budget prévisionnel de charges rattachées à un compte de classe 6{" "}
              <strong>{money(metrics.plannedCharges)}</strong>
            </div>
          </div>
        </Panel>
      </div>
      <div className="notice no-print" style={{ marginTop: 14 }}>
        Les financements affectés sont identifiés par rattachement du produit à un projet. Les parts
        bailleur/porteur du réalisé suivent la règle de prorata budgétaire décrite dans la
        spécification.
      </div>
    </>
  );
}
