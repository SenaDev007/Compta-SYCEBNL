"use client";
import { useRef, useState } from "react";
import { ArrowLeft, FileUp, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import type { BudgetKind, BudgetLine, Project } from "@/lib/accounting/types";
import { BUDGET_KINDS } from "@/lib/accounting/types";
import {
  budgetSubtotals,
  money,
  percent,
  projectBudget,
  yearEntries,
} from "@/lib/accounting/calculations";
import { importBudgetLines } from "@/lib/accounting/files";
import { Button, Empty, Field, Modal, Panel } from "./ui";
import type { ViewProps } from "./shared";

export function ProjectsView({ workspace, setWorkspace, year, notify }: ViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newLineOpen, setNewLineOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const budgetInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [partner, setPartner] = useState("");
  const [organization, setOrganization] = useState("");
  const [highlights, setHighlights] = useState("");
  const [projectFormId, setProjectFormId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [kind, setKind] = useState<BudgetKind>("section");
  const [parentId, setParentId] = useState("");
  const [lineCode, setLineCode] = useState("");
  const [lineLabel, setLineLabel] = useState("");
  const [unit, setUnit] = useState("Unité");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [donorShare, setDonorShare] = useState("");
  const [priorSpent, setPriorSpent] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const project = workspace.projects.find((p) => p.id === selectedId);
  const entries = yearEntries(workspace.entries, year);
  const totalFor = (p: Project) => projectBudget(p, entries);
  const openProjectForm = (p?: Project) => {
    setProjectFormId(p?.id || null);
    setCode(p?.code || "");
    setTitle(p?.title || "");
    setPartner(p?.partner || "");
    setOrganization(p?.organization || "");
    setHighlights(p?.highlights || "");
    setStartDate(p?.startDate || "");
    setEndDate(p?.endDate || "");
    setNewProjectOpen(true);
  };
  const saveProject = () => {
    if (!code.trim() || !title.trim()) {
      notify("Le code et l’intitulé du projet sont obligatoires.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      notify("La date de fin ne peut pas précéder la date de début.");
      return;
    }
    if (
      workspace.projects.some(
        (p) => p.id !== projectFormId && p.code.toLowerCase() === code.trim().toLowerCase(),
      )
    ) {
      notify("Ce code projet existe déjà.");
      return;
    }
    if (projectFormId) {
      setWorkspace((w) => ({
        ...w,
        projects: w.projects.map((p) =>
          p.id === projectFormId
            ? {
                ...p,
                code: code.trim(),
                title: title.trim(),
                partner: partner.trim(),
                organization: organization.trim(),
                highlights: highlights.trim(),
                startDate,
                endDate,
              }
            : p,
        ),
      }));
      setNewProjectOpen(false);
      notify("Fiche projet mise à jour.");
      return;
    }
    const next: Project = {
      id: crypto.randomUUID(),
      code: code.trim(),
      title: title.trim(),
      partner: partner.trim(),
      organization: organization.trim(),
      highlights: highlights.trim(),
      startDate,
      endDate,
      budgetLines: [],
    };
    setWorkspace((w) => ({ ...w, projects: [next, ...w.projects] }));
    setSelectedId(next.id);
    setNewProjectOpen(false);
    notify("Projet créé. Vous pouvez ajouter son budget détaillé.");
  };
  const openLine = (nextKind: BudgetKind = "section") => {
    setEditingLineId(null);
    setKind(nextKind);
    setParentId("");
    setLineCode("");
    setLineLabel("");
    setUnit("Unité");
    setQuantity("1");
    setUnitCost("");
    setDonorShare("");
    setPriorSpent("");
    setAccountNumber("");
    setNewLineOpen(true);
  };
  const editLine = (line: BudgetLine) => {
    setEditingLineId(line.id);
    setKind(line.kind);
    setParentId(line.parentId || "");
    setLineCode(line.code);
    setLineLabel(line.label);
    setUnit(line.unit || "Unité");
    setQuantity(String(line.quantity ?? 1));
    setUnitCost(String(line.unitCost ?? ""));
    setDonorShare(String(line.donorShare ?? ""));
    setPriorSpent(String(line.priorSpent ?? ""));
    setAccountNumber(line.accountNumber || "");
    setNewLineOpen(true);
  };
  const addBudgetLine = () => {
    if (!project || !lineLabel.trim()) {
      notify("L’intitulé de la ligne budgétaire est obligatoire.");
      return;
    }
    const index = BUDGET_KINDS.findIndex((x) => x.kind === kind);
    const expectedParent = index > 0 ? BUDGET_KINDS[index - 1].kind : undefined;
    const parent = project.budgetLines.find((line) => line.id === parentId);
    if (expectedParent && (!parent || parent.kind !== expectedParent)) {
      notify(`Choisissez un parent de type ${BUDGET_KINDS[index - 1].label}.`);
      return;
    }
    const qty = kind === "expense" ? Math.max(0, Number(quantity) || 0) : 0;
    const cost = kind === "expense" ? Math.max(0, Number(unitCost) || 0) : 0;
    const budget = qty * cost;
    const donor = kind === "expense" ? Math.max(0, Number(donorShare) || 0) : 0;
    if (donor > budget) {
      notify("La part bailleur ne peut pas dépasser le montant de la ligne.");
      return;
    }
    const line: BudgetLine = {
      id: editingLineId || crypto.randomUUID(),
      kind,
      code: lineCode.trim(),
      label: lineLabel.trim(),
      ...(parentId ? { parentId } : {}),
      ...(kind === "expense"
        ? {
            unit: unit.trim() || "Unité",
            quantity: qty,
            unitCost: cost,
            donorShare: donor,
            priorSpent: Math.max(0, Number(priorSpent) || 0),
            ...(accountNumber ? { accountNumber } : {}),
          }
        : {}),
    };
    setWorkspace((w) => ({
      ...w,
      projects: w.projects.map((p) =>
        p.id === project.id
          ? {
              ...p,
              budgetLines: editingLineId
                ? p.budgetLines.map((current) => (current.id === editingLineId ? line : current))
                : [...p.budgetLines, line],
            }
          : p,
      ),
    }));
    setNewLineOpen(false);
    setEditingLineId(null);
    notify(editingLineId ? "Ligne budgétaire mise à jour." : "Ligne budgétaire ajoutée.");
  };
  const deleteLine = (lineId: string) => {
    if (!project) return;
    if (confirm !== lineId) {
      setConfirm(lineId);
      return;
    }
    const descendantIds = new Set([lineId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const line of project.budgetLines)
        if (line.parentId && descendantIds.has(line.parentId) && !descendantIds.has(line.id)) {
          descendantIds.add(line.id);
          changed = true;
        }
    }
    if (
      workspace.entries.some(
        (e) =>
          e.projectId === project.id &&
          e.lines.some((l) => l.budgetLineId && descendantIds.has(l.budgetLineId)),
      )
    ) {
      notify("Cette ligne est déjà utilisée dans une écriture rattachée au projet.");
      setConfirm(null);
      return;
    }
    setWorkspace((w) => ({
      ...w,
      projects: w.projects.map((p) =>
        p.id === project.id
          ? { ...p, budgetLines: p.budgetLines.filter((l) => !descendantIds.has(l.id)) }
          : p,
      ),
    }));
    setConfirm(null);
    notify("Ligne budgétaire supprimée.");
  };
  const deleteProject = (p: Project) => {
    if (confirm !== `project:${p.id}`) {
      setConfirm(`project:${p.id}`);
      return;
    }
    if (workspace.entries.some((e) => e.projectId === p.id)) {
      notify("Ce projet possède des écritures comptables et ne peut pas être supprimé.");
      setConfirm(null);
      return;
    }
    setWorkspace((w) => ({ ...w, projects: w.projects.filter((x) => x.id !== p.id) }));
    setSelectedId(null);
    setConfirm(null);
    notify("Projet supprimé.");
  };
  const uploadBudget = async (file?: File) => {
    if (!file || !project) return;
    try {
      const added = await importBudgetLines(file, project);
      setWorkspace((w) => ({
        ...w,
        projects: w.projects.map((p) => (p.id === project.id ? { ...p, budgetLines: added } : p)),
      }));
      notify("Lignes budgétaires importées. Vérifiez leur hiérarchie et leurs montants.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Import impossible.");
    }
    if (budgetInput.current) budgetInput.current.value = "";
  };
  if (project) {
    const totals = totalFor(project);
    const subtotals = budgetSubtotals(project, entries);
    const ordered = [...project.budgetLines].sort((a, b) => {
      const rank = (k: BudgetKind) => BUDGET_KINDS.findIndex((x) => x.kind === k);
      return (
        rank(a.kind) - rank(b.kind) ||
        a.code.localeCompare(b.code, undefined, { numeric: true }) ||
        a.label.localeCompare(b.label)
      );
    });
    const parentKind = BUDGET_KINDS.find((x) => x.kind === kind);
    const validParents = project.budgetLines.filter(
      (l) =>
        l.kind ===
        BUDGET_KINDS[
          (parentKind ? BUDGET_KINDS.findIndex((x) => x.kind === parentKind.kind) : 0) - 1
        ]?.kind,
    );
    return (
      <>
        <div className="page-head">
          <div>
            <button className="btn ghost small" onClick={() => setSelectedId(null)}>
              <ArrowLeft size={14} />
              Tous les projets
            </button>
            <div className="page-kicker" style={{ marginTop: 10 }}>
              Projet · {project.code}
            </div>
            <h1>{project.title}</h1>
            <p>
              {project.partner || "Partenaire non renseigné"}
              {project.organization ? ` · ${project.organization}` : ""}
            </p>
          </div>
          <div className="actions">
            <Button onClick={() => openProjectForm(project)}>
              <Pencil />
              Modifier la fiche
            </Button>
            <Button onClick={() => budgetInput.current?.click()}>
              <FileUp />
              Importer budget
            </Button>
            <Button variant="primary" onClick={() => openLine("expense")}>
              <Plus />
              Ajouter ligne
            </Button>
            <input
              ref={budgetInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => void uploadBudget(e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="grid stats-grid">
          <div className="stat-card">
            <div className="stat-label">
              Budget total{" "}
              <span className="stat-icon">
                <FolderPlus />
              </span>
            </div>
            <div className="stat-value num">{money(totals.totalBudget)}</div>
            <div className="stat-meta">
              Bailleur {money(totals.totalDonor)} · Porteur {money(totals.totalHolder)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Réalisé à ce jour{" "}
              <span className="stat-icon">
                <FolderPlus />
              </span>
            </div>
            <div className="stat-value num">{money(totals.totalRealized)}</div>
            <div className="stat-meta">Réalisé antérieur + écritures de {year}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Solde disponible{" "}
              <span className="stat-icon">
                <FolderPlus />
              </span>
            </div>
            <div className="stat-value num">{money(totals.remaining)}</div>
            <div className="stat-meta">Budget total moins réalisé</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Taux d’exécution{" "}
              <span className="stat-icon">
                <FolderPlus />
              </span>
            </div>
            <div className="stat-value num">{percent(totals.rate)}</div>
            <div className="progress">
              <span style={{ width: `${Math.min(100, Math.max(0, totals.rate * 100))}%` }} />
            </div>
          </div>
        </div>
        {project.highlights && (
          <div className="notice" style={{ marginBottom: 15 }}>
            <strong>Réalisations majeures : </strong>
            {project.highlights}
          </div>
        )}
        <Panel
          title="Budget détaillé"
          caption="Section › Résultat › Produit › Activité › Dépense"
          action={
            <Button size="small" onClick={() => openLine("section")}>
              <Plus size={14} />
              Ajouter un niveau
            </Button>
          }
        >
          {ordered.length === 0 ? (
            <Empty title="Aucune ligne de budget">
              Créez une structure ou importez le budget fourni par votre partenaire financier.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Structure / ligne budgétaire</th>
                    <th>Unité</th>
                    <th className="num">Qté</th>
                    <th className="num">Coût unit.</th>
                    <th className="num">Budget</th>
                    <th className="num">Bailleur</th>
                    <th className="num">Porteur</th>
                    <th className="num">Réalisé</th>
                    <th className="num">Reste</th>
                    <th className="num">Taux</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((line) => {
                    const expense = line.kind === "expense";
                    const detail = totals.details.find((d) => d.id === line.id);
                    const subtotal = subtotals.get(line.id) || 0;
                    const depth = BUDGET_KINDS.find((x) => x.kind === line.kind)?.level || 0;
                    return (
                      <tr
                        key={line.id}
                        style={
                          !expense ? { background: depth < 2 ? "#fbfcfa" : "#fff" } : undefined
                        }
                      >
                        <td style={{ paddingLeft: 14 + depth * 15, minWidth: 210 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {line.code && <span className="account-code">{line.code}</span>}
                            <strong
                              style={{
                                fontWeight: expense ? 540 : 700,
                                color: expense ? "#405047" : "#263c31",
                              }}
                            >
                              {line.label}
                            </strong>
                            {!expense && (
                              <span className="pill">
                                {BUDGET_KINDS.find((x) => x.kind === line.kind)?.label}
                              </span>
                            )}
                          </div>
                        </td>
                        {expense ? (
                          <>
                            <td>{line.unit}</td>
                            <td className="num">{line.quantity}</td>
                            <td className="num">{money(line.unitCost || 0)}</td>
                            <td className="num">{money(detail?.budget || 0)}</td>
                            <td className="num">{money(detail?.donorShare || 0)}</td>
                            <td className="num">{money(detail?.holderShare || 0)}</td>
                            <td className="num">{money(detail?.realized || 0)}</td>
                            <td className="num">{money(detail?.remaining || 0)}</td>
                            <td className="num">
                              <span className={`pill ${(detail?.rate || 0) > 1 ? "red" : "green"}`}>
                                {percent(detail?.rate || 0)}
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td />
                            <td />
                            <td />
                            <td className="num">
                              <strong>{money(subtotal)}</strong>
                            </td>
                            <td />
                            <td />
                            <td />
                            <td />
                            <td />
                          </>
                        )}
                        <td className="right">
                          <Button size="small" onClick={() => editLine(line)}>
                            <Pencil size={12} />
                            Modifier
                          </Button>
                          <Button
                            size="small"
                            variant={confirm === line.id ? "danger" : "ghost"}
                            onClick={() => deleteLine(line.id)}
                          >
                            {confirm === line.id ? "Confirmer" : "Supprimer"}
                            <Trash2 size={12} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        {newLineOpen && (
          <Modal
            title={editingLineId ? "Modifier la ligne budgétaire" : "Ajouter au budget"}
            subtitle="Les sous-totaux des niveaux supérieurs sont calculés automatiquement."
            onClose={() => setNewLineOpen(false)}
            footer={
              <>
                <Button onClick={() => setNewLineOpen(false)}>Annuler</Button>
                <Button variant="primary" onClick={addBudgetLine}>
                  Enregistrer
                </Button>
              </>
            }
          >
            <div className="form-grid">
              <Field label="Niveau">
                <select
                  className="select"
                  disabled={Boolean(editingLineId)}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as BudgetKind);
                    setParentId("");
                  }}
                >
                  {BUDGET_KINDS.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Code (facultatif)">
                <input
                  className="input"
                  value={lineCode}
                  onChange={(e) => setLineCode(e.target.value)}
                  placeholder="Ex. 1.1.2"
                />
              </Field>
              <Field label="Intitulé">
                <input
                  className="input"
                  value={lineLabel}
                  onChange={(e) => setLineLabel(e.target.value)}
                  placeholder="Intitulé budgétaire"
                />
              </Field>
              {kind !== "section" && (
                <Field label="Parent — niveau supérieur">
                  <select
                    className="select"
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                  >
                    <option value="">Choisir un parent</option>
                    {validParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `${p.code} · ` : ""}
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {kind === "expense" && (
                <>
                  <Field label="Unité">
                    <input
                      className="input"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="Ex. mois, personne, forfait"
                    />
                  </Field>
                  <Field label="Quantité">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </Field>
                  <Field label="Coût unitaire (FCFA)">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                    />
                  </Field>
                  <Field label="Part bailleur (FCFA)">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      value={donorShare}
                      onChange={(e) => setDonorShare(e.target.value)}
                    />
                  </Field>
                  <Field label="Réalisé antérieur (FCFA)">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      value={priorSpent}
                      onChange={(e) => setPriorSpent(e.target.value)}
                    />
                  </Field>
                  <Field label="Compte de charge (facultatif)">
                    <select
                      className="select"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                    >
                      <option value="">Non affecté</option>
                      {workspace.accounts.map((a) => (
                        <option key={a.number} value={a.number}>
                          {a.number} — {a.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </div>
            {kind === "expense" && (
              <div className="summary-strip">
                <span>
                  Budget de la ligne{" "}
                  <strong>{money((Number(quantity) || 0) * (Number(unitCost) || 0))}</strong>
                </span>
                <span>
                  Part porteur calculée{" "}
                  <strong>
                    {money(
                      (Number(quantity) || 0) * (Number(unitCost) || 0) - (Number(donorShare) || 0),
                    )}
                  </strong>
                </span>
              </div>
            )}
          </Modal>
        )}
      </>
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Gestion par projet</div>
          <h1>Projets & budgets</h1>
          <p>Suivez les financements, les dépenses et les réalisations de chaque partenaire.</p>
        </div>
        <div className="actions">
          <Button variant="primary" onClick={() => openProjectForm()}>
            <FolderPlus />
            Nouveau projet
          </Button>
        </div>
      </div>
      {workspace.projects.length === 0 ? (
        <Panel title="Vos projets" caption="Chaque projet possède son propre budget et son suivi.">
          <Empty title="Aucun projet créé">
            Ajoutez un projet, son bailleur et sa structure de budget.
          </Empty>
        </Panel>
      ) : (
        <Panel
          title="Portefeuille de projets"
          caption={`${workspace.projects.length} projet${workspace.projects.length === 1 ? "" : "s"}`}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Projet</th>
                  <th>Partenaire</th>
                  <th className="num">Budget</th>
                  <th className="num">Réalisé</th>
                  <th>Exécution</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {workspace.projects.map((p) => {
                  const totals = totalFor(p);
                  return (
                    <tr key={p.id}>
                      <td className="account-code">{p.code}</td>
                      <td>
                        <button
                          className="btn ghost small"
                          style={{ padding: 0 }}
                          onClick={() => setSelectedId(p.id)}
                        >
                          {p.title}
                        </button>
                      </td>
                      <td>{p.partner || "—"}</td>
                      <td className="num">{money(totals.totalBudget)}</td>
                      <td className="num">{money(totals.totalRealized)}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div className="progress" style={{ width: 78 }}>
                            <span
                              style={{ width: `${Math.min(100, Math.max(0, totals.rate * 100))}%` }}
                            />
                          </div>
                          <span className="pill">{percent(totals.rate)}</span>
                        </div>
                      </td>
                      <td className="right">
                        <Button
                          size="small"
                          variant={confirm === `project:${p.id}` ? "danger" : "ghost"}
                          onClick={() => deleteProject(p)}
                        >
                          {confirm === `project:${p.id}` ? "Confirmer" : "Supprimer"}
                          <Trash2 size={12} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {newProjectOpen && (
        <Modal
          title={projectFormId ? "Modifier la fiche projet" : "Créer un projet"}
          subtitle="Les projets et écritures restent privés à cet espace utilisateur."
          onClose={() => setNewProjectOpen(false)}
          footer={
            <>
              <Button onClick={() => setNewProjectOpen(false)}>Annuler</Button>
              <Button variant="primary" onClick={saveProject}>
                {projectFormId ? "Enregistrer les changements" : "Créer le projet"}
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Code projet">
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex. PROJ-001"
              />
            </Field>
            <Field label="Intitulé">
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nom du projet"
              />
            </Field>
            <Field label="Partenaire financier">
              <input
                className="input"
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                placeholder="Bailleur / partenaire"
              />
            </Field>
            <Field label="Organisation porteuse">
              <input
                className="input"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Nom de l’organisation"
              />
            </Field>
            <Field label="Date de début">
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Date de fin">
              <input
                className="input"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <Field label="Réalisations majeures">
              <textarea
                className="textarea"
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                placeholder="Synthèse des réalisations du projet"
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
