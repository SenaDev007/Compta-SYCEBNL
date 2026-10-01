"use client";
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Entry, JournalCode, JournalLine } from "@/lib/accounting/types";
import { entryBalanced, entryCredits, entryDebits, money } from "@/lib/accounting/calculations";
import { Button, Empty, Field, Modal, Panel } from "./ui";
import type { ViewProps } from "./shared";

type DraftLine = {
  id?: string;
  accountNumber: string;
  debit: string;
  credit: string;
  budgetLineId: string;
};
const journals: JournalCode[] = ["AC", "VE", "BQ", "CA", "OD"];
const newDraftLine = (): DraftLine => ({
  accountNumber: "",
  debit: "",
  credit: "",
  budgetLineId: "",
});

export function JournalView({
  workspace,
  setWorkspace,
  year,
  notify,
  openOnMount = false,
}: ViewProps & { openOnMount?: boolean }) {
  const [query, setQuery] = useState("");
  const [journalFilter, setJournalFilter] = useState("Tous les journaux");
  const [showForm, setShowForm] = useState(openOnMount);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [journal, setJournal] = useState<JournalCode>("OD");
  const [reference, setReference] = useState("");
  const [label, setLabel] = useState("");
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine(), newDraftLine()]);
  const visible = useMemo(
    () =>
      workspace.entries
        .filter(
          (entry) =>
            Number(entry.date.slice(0, 4)) === year &&
            (journalFilter === "Tous les journaux" || entry.journal === journalFilter) &&
            `${entry.reference} ${entry.label} ${entry.projectId || ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [workspace.entries, year, journalFilter, query],
  );
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced =
    lines.length >= 2 && Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;
  const project = workspace.projects.find((p) => p.id === projectId);
  const expenseBudgets = project?.budgetLines.filter((line) => line.kind === "expense") || [];
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setReference("");
    setLabel("");
    setProjectId("");
    setLines([newDraftLine(), newDraftLine()]);
  };
  const save = () => {
    if (!date || !reference.trim() || !label.trim()) {
      notify("Renseignez la date, la pièce et le libellé.");
      return;
    }
    if (lines.length < 2) {
      notify("Une écriture doit comporter au moins deux lignes.");
      return;
    }
    if (!balanced) {
      notify("L’écriture doit être équilibrée et son montant supérieur à zéro.");
      return;
    }
    if (
      workspace.entries.some(
        (entry) =>
          entry.id !== editingId &&
          entry.journal === journal &&
          entry.reference.trim().toLocaleLowerCase("fr-FR") ===
            reference.trim().toLocaleLowerCase("fr-FR"),
      )
    ) {
      notify("Ce numéro de pièce est déjà utilisé dans ce journal.");
      return;
    }
    if (projectId && !workspace.projects.some((p) => p.id === projectId)) {
      notify("Le projet sélectionné est introuvable.");
      return;
    }
    const ledgerLines: JournalLine[] = [];
    for (const line of lines) {
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      if (!line.accountNumber || !workspace.accounts.some((a) => a.number === line.accountNumber)) {
        notify("Chaque ligne doit utiliser un compte existant.");
        return;
      }
      if (debit > 0 === credit > 0) {
        notify("Chaque ligne doit avoir un débit ou un crédit, mais pas les deux.");
        return;
      }
      if (
        line.budgetLineId &&
        (!project ||
          !project.budgetLines.some(
            (budgetLine) => budgetLine.id === line.budgetLineId && budgetLine.kind === "expense",
          ))
      ) {
        notify("La ligne budgétaire ne correspond pas au projet choisi.");
        return;
      }
      ledgerLines.push({
        id: line.id || crypto.randomUUID(),
        accountNumber: line.accountNumber,
        debit,
        credit,
        ...(line.budgetLineId ? { budgetLineId: line.budgetLineId } : {}),
      });
    }
    const entry: Entry = {
      id: editingId || crypto.randomUUID(),
      date,
      journal,
      reference: reference.trim(),
      label: label.trim(),
      ...(projectId ? { projectId } : {}),
      lines: ledgerLines,
      createdAt:
        workspace.entries.find((existing) => existing.id === editingId)?.createdAt ||
        new Date().toISOString(),
    };
    if (!entryBalanced(entry) || entryDebits(entry) <= 0 || entryCredits(entry) <= 0) {
      notify("Contrôle en partie double échoué.");
      return;
    }
    setWorkspace((current) => {
      const previous = current.entries.find((existing) => existing.id === editingId);
      const changedLineIds = new Set(previous?.lines.map((line) => line.id) || []);
      return {
        ...current,
        entries: editingId
          ? current.entries.map((existing) => (existing.id === editingId ? entry : existing))
          : [entry, ...current.entries],
        reconciliations: editingId
          ? current.reconciliations.map((item) => ({
              ...item,
              checkedLineIds: item.checkedLineIds.filter((id) => !changedLineIds.has(id)),
            }))
          : current.reconciliations,
      };
    });
    closeForm();
    notify(
      editingId
        ? "Écriture mise à jour. Vérifiez à nouveau son pointage bancaire."
        : "Écriture équilibrée enregistrée.",
    );
  };
  const remove = (entry: Entry) => {
    if (pendingDelete !== entry.id) {
      setPendingDelete(entry.id);
      return;
    }
    setWorkspace((current) => ({
      ...current,
      entries: current.entries.filter((e) => e.id !== entry.id),
      reconciliations: current.reconciliations.map((r) => ({
        ...r,
        checkedLineIds: r.checkedLineIds.filter((id) => !entry.lines.some((l) => l.id === id)),
      })),
    }));
    setPendingDelete(null);
    notify("Écriture supprimée.");
  };
  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const editEntry = (entry: Entry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setJournal(entry.journal);
    setReference(entry.reference);
    setLabel(entry.label);
    setProjectId(entry.projectId || "");
    setLines(
      entry.lines.map((line) => ({
        id: line.id,
        accountNumber: line.accountNumber,
        debit: String(line.debit),
        credit: String(line.credit),
        budgetLineId: line.budgetLineId || "",
      })),
    );
    setShowForm(true);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Saisie comptable · Exercice {year}</div>
          <h1>Journal des écritures</h1>
          <p>La validation impose l’équilibre débit/crédit et la validité des comptes.</p>
        </div>
        <div className="actions">
          <Button
            variant="primary"
            onClick={() => {
              setEditingId(null);
              setReference("");
              setLabel("");
              setProjectId("");
              setLines([newDraftLine(), newDraftLine()]);
              setDate(`${year}-${new Date().toISOString().slice(5, 10)}`);
              setShowForm(true);
            }}
          >
            <Plus />
            Nouvelle écriture
          </Button>
        </div>
      </div>
      <Panel
        title="Écritures comptabilisées"
        caption={`${visible.length} affichée${visible.length === 1 ? "" : "s"}`}
      >
        <div className="panel-body" style={{ paddingBottom: 9 }}>
          <div className="toolbar">
            <div className="search-box">
              <Search />
              <input
                className="input"
                placeholder="Pièce, libellé ou projet…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="select"
              style={{ width: "auto", minWidth: 160 }}
              value={journalFilter}
              onChange={(e) => setJournalFilter(e.target.value)}
            >
              <option>Tous les journaux</option>
              {journals.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <span className="pill">{workspace.entries.length} écriture(s) conservée(s)</span>
          </div>
        </div>
        {!visible.length ? (
          <Empty title="Aucune écriture pour cette sélection">
            Commencez par saisir une première opération comptable.
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
                  <th>Projet</th>
                  <th>Lignes</th>
                  <th className="num">Débit = Crédit</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-FR")}</td>
                    <td>
                      <span className="pill">{entry.journal}</span>
                    </td>
                    <td className="account-code">{entry.reference}</td>
                    <td>{entry.label}</td>
                    <td>{workspace.projects.find((p) => p.id === entry.projectId)?.code || "—"}</td>
                    <td>{entry.lines.length}</td>
                    <td className="num">
                      {money(entryDebits(entry))}{" "}
                      <span className="pill green">{entryBalanced(entry) ? "OK" : "Écart"}</span>
                    </td>
                    <td className="right">
                      <Button size="small" variant="ghost" onClick={() => editEntry(entry)}>
                        <Pencil size={13} /> Modifier
                      </Button>
                      <Button
                        size="small"
                        variant={pendingDelete === entry.id ? "danger" : "ghost"}
                        onClick={() => remove(entry)}
                      >
                        {pendingDelete === entry.id ? "Confirmer suppression" : "Supprimer"}
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {showForm && (
        <Modal
          title={editingId ? "Modifier une écriture" : "Nouvelle écriture"}
          subtitle="Complétez les informations, puis contrôlez l’équilibre avant enregistrement."
          wide
          onClose={closeForm}
          footer={
            <>
              <Button onClick={closeForm}>Annuler</Button>
              <Button variant="primary" onClick={save} disabled={!balanced}>
                {editingId ? "Enregistrer les modifications" : "Enregistrer l’écriture"}
              </Button>
            </>
          }
        >
          <div className="form-grid three">
            <Field label="Date">
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Journal">
              <select
                className="select"
                value={journal}
                onChange={(e) => setJournal(e.target.value as JournalCode)}
              >
                {journals.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Numéro de pièce">
              <input
                className="input"
                placeholder="Ex. BQ-2026-001"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label="Libellé">
              <input
                className="input"
                placeholder="Objet de l’opération"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <Field label="Projet (facultatif)">
              <select
                className="select"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setLines((current) => current.map((line) => ({ ...line, budgetLineId: "" })));
                }}
              >
                <option value="">Sans projet</option>
                {workspace.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Contrôle d’équilibre">
              <div className={`notice ${balanced ? "" : "warning"}`} style={{ padding: 9 }}>
                {balanced ? "Équilibrée" : "À équilibrer"} · Débit {money(totalDebit)} · Crédit{" "}
                {money(totalCredit)}
              </div>
            </Field>
          </div>
          {workspace.accounts.length === 0 ? (
            <div className="notice error" style={{ marginTop: 15 }}>
              Ajoutez ou importez le plan comptable avant de saisir des écritures.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  margin: "19px 0 9px",
                }}
              >
                <div className="panel-title">
                  Lignes de l’écriture <span className="pill">{lines.length}</span>
                </div>
                <Button
                  size="small"
                  onClick={() => setLines((current) => [...current, newDraftLine()])}
                >
                  <Plus size={14} />
                  Ajouter une ligne
                </Button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Compte</th>
                      <th className="num">Débit (FCFA)</th>
                      <th className="num">Crédit (FCFA)</th>
                      {project && <th>Ligne budgétaire</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index}>
                        <td style={{ minWidth: 220 }}>
                          <select
                            className="select"
                            value={line.accountNumber}
                            onChange={(e) => updateLine(index, { accountNumber: e.target.value })}
                          >
                            <option value="">Sélectionner un compte</option>
                            {workspace.accounts.map((a) => (
                              <option key={a.number} value={a.number}>
                                {a.number} — {a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <input
                            className="input num"
                            type="number"
                            min="0"
                            step="1"
                            value={line.debit}
                            onChange={(e) =>
                              updateLine(index, {
                                debit: e.target.value,
                                credit: e.target.value ? "0" : "",
                              })
                            }
                            placeholder="0"
                          />
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <input
                            className="input num"
                            type="number"
                            min="0"
                            step="1"
                            value={line.credit}
                            onChange={(e) =>
                              updateLine(index, {
                                credit: e.target.value,
                                debit: e.target.value ? "0" : "",
                              })
                            }
                            placeholder="0"
                          />
                        </td>
                        {project && (
                          <td style={{ minWidth: 180 }}>
                            <select
                              className="select"
                              value={line.budgetLineId}
                              onChange={(e) => updateLine(index, { budgetLineId: e.target.value })}
                            >
                              <option value="">Aucune ligne</option>
                              {expenseBudgets.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.code ? `${b.code} · ` : ""}
                                  {b.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                        <td>
                          <button
                            className="btn ghost small"
                            title="Retirer la ligne"
                            disabled={lines.length <= 2}
                            onClick={() =>
                              setLines((current) => current.filter((_, i) => i !== index))
                            }
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <th className="num">{money(totalDebit)}</th>
                      <th className="num">{money(totalCredit)}</th>
                      {project && <th />}
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {projectId && expenseBudgets.length === 0 && (
                <div className="notice warning" style={{ marginTop: 10 }}>
                  Ce projet n’a pas encore de ligne de dépense budgétaire.
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
