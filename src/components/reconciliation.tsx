"use client";
import { useState } from "react";
import { BadgeCheck, Landmark } from "lucide-react";
import { money, reconcileAccount } from "@/lib/accounting/calculations";
import type { Reconciliation } from "@/lib/accounting/types";
import { Button, Empty, Field, Panel } from "./ui";
import type { ViewProps } from "./shared";

export function ReconciliationView({ workspace, setWorkspace, year, notify }: ViewProps) {
  const bankAccounts = workspace.accounts.filter((a) => a.number.startsWith("52"));
  const [accountNumber, setAccountNumber] = useState(bankAccounts[0]?.number || "");
  const [statementDraft, setStatementDraft] = useState("");
  const [asOfDraft, setAsOfDraft] = useState(`${year}-12-31`);
  const selected = workspace.reconciliations.find((r) => r.accountNumber === accountNumber);
  const reconciliation: Reconciliation = selected || {
    accountNumber,
    statementBalance: 0,
    checkedLineIds: [],
    asOf: asOfDraft,
  };
  const result = accountNumber ? reconcileAccount(workspace, reconciliation) : null;
  const saveStatement = () => {
    const balance = Number(statementDraft);
    if (!Number.isFinite(balance)) {
      notify("Saisissez un solde bancaire valide.");
      return;
    }
    if (!asOfDraft) {
      notify("Indiquez la date du relevé.");
      return;
    }
    setWorkspace((w) => {
      const next: Reconciliation = {
        accountNumber,
        statementBalance: balance,
        checkedLineIds: selected?.checkedLineIds || [],
        asOf: asOfDraft,
      };
      return {
        ...w,
        reconciliations: [
          ...w.reconciliations.filter((r) => r.accountNumber !== accountNumber),
          next,
        ],
      };
    });
    notify("Solde du relevé enregistré.");
  };
  const toggle = (lineId: string) => {
    if (!accountNumber) return;
    setWorkspace((w) => {
      const old = w.reconciliations.find((r) => r.accountNumber === accountNumber) || {
        accountNumber,
        statementBalance: Number(statementDraft) || 0,
        checkedLineIds: [],
        asOf: asOfDraft,
      };
      const checked = old.checkedLineIds.includes(lineId)
        ? old.checkedLineIds.filter((id) => id !== lineId)
        : [...old.checkedLineIds, lineId];
      return {
        ...w,
        reconciliations: [
          ...w.reconciliations.filter((r) => r.accountNumber !== accountNumber),
          { ...old, checkedLineIds: checked, asOf: asOfDraft },
        ],
      };
    });
  };
  const setDate = (date: string) => {
    setAsOfDraft(date);
    if (selected)
      setWorkspace((w) => ({
        ...w,
        reconciliations: w.reconciliations.map((r) =>
          r.accountNumber === accountNumber ? { ...r, asOf: date } : r,
        ),
      }));
  };
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Contrôle de trésorerie</div>
          <h1>Rapprochement bancaire</h1>
          <p>Pointez les opérations qui apparaissent sur votre relevé bancaire.</p>
        </div>
        <div className="actions">
          <span className="pill">
            <Landmark size={13} /> Un compte à la fois
          </span>
        </div>
      </div>
      {!bankAccounts.length ? (
        <Panel title="Comptes bancaires">
          <Empty title="Aucun compte de banque (classe 52) dans le référentiel">
            Importez le plan comptable SYCEBNL ou ajoutez un compte de banque classe 52.
          </Empty>
        </Panel>
      ) : (
        <>
          <Panel
            title="Paramètres du relevé"
            caption="Choisissez le compte bancaire et le solde du relevé."
          >
            <div className="panel-body">
              <div className="form-grid three">
                <Field label="Compte de banque">
                  <select
                    className="select"
                    value={accountNumber}
                    onChange={(e) => {
                      setAccountNumber(e.target.value);
                      setStatementDraft("");
                    }}
                  >
                    {bankAccounts.map((a) => (
                      <option key={a.number} value={a.number}>
                        {a.number} — {a.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date de fin du relevé">
                  <input
                    className="input"
                    type="date"
                    value={selected?.asOf || asOfDraft}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <Field label="Solde indiqué sur le relevé (FCFA)">
                  <input
                    className="input"
                    type="number"
                    step="1"
                    value={
                      statementDraft === "" ? (selected?.statementBalance ?? "") : statementDraft
                    }
                    onChange={(e) => setStatementDraft(e.target.value)}
                    placeholder="Saisir le solde"
                  />
                </Field>
              </div>
              <div className="actions" style={{ marginTop: 13 }}>
                <Button variant="primary" onClick={saveStatement}>
                  Enregistrer le solde
                </Button>
                <span className="panel-caption">
                  Les opérations postérieures à la date choisie ne sont pas incluses.
                </span>
              </div>
            </div>
          </Panel>
          {result && (
            <>
              <div className="grid stats-grid" style={{ marginTop: 15 }}>
                <div className="stat-card">
                  <div className="stat-label">
                    Solde comptable{" "}
                    <span className="stat-icon">
                      <Landmark />
                    </span>
                  </div>
                  <div className="stat-value num">{money(result.bookBalance)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Encaissements non pointés</div>
                  <div className="stat-value num">{money(result.unclearedReceipts)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Décaissements non pointés</div>
                  <div className="stat-value num">{money(result.unclearedPayments)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Écart relevé / théorique</div>
                  <div
                    className="stat-value num"
                    style={{ color: Math.abs(result.difference) < 0.005 ? "#23724d" : "#a34f42" }}
                  >
                    {money(result.difference)}
                  </div>
                  <div className="stat-meta">
                    {Math.abs(result.difference) < 0.005
                      ? "Rapprochement équilibré"
                      : "Écart à investiguer"}
                  </div>
                </div>
              </div>
              <Panel
                title="Opérations du compte"
                caption={`${result.allRows.length} mouvement(s) jusqu’au ${new Date(`${reconciliation.asOf}T12:00:00`).toLocaleDateString("fr-FR")}`}
                action={
                  <span
                    className={`pill ${Math.abs(result.difference) < 0.005 ? "green" : "amber"}`}
                  >
                    {Math.abs(result.difference) < 0.005 ? (
                      <>
                        <BadgeCheck size={12} /> Équilibré
                      </>
                    ) : (
                      "À vérifier"
                    )}
                  </span>
                }
              >
                <div className="notice" style={{ margin: "14px 17px 0" }}>
                  Solde théorique = solde comptable − encaissements non pointés + décaissements non
                  pointés. Cochez les opérations présentes sur le relevé.
                </div>
                {!result.allRows.length ? (
                  <Empty title="Aucun mouvement sur ce compte à cette date">
                    Saisissez les opérations bancaires au journal (journal BQ recommandé).
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Pointé</th>
                          <th>Date</th>
                          <th>Pièce</th>
                          <th>Libellé</th>
                          <th className="num">Débit</th>
                          <th className="num">Crédit</th>
                          <th className="num">Solde de ligne</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...result.allRows]
                          .sort((a, b) => a.entry.date.localeCompare(b.entry.date))
                          .map(({ entry, line }) => (
                            <tr key={line.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label="Opération pointée"
                                  checked={reconciliation.checkedLineIds.includes(line.id)}
                                  onChange={() => toggle(line.id)}
                                />
                              </td>
                              <td>
                                {new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-FR")}
                              </td>
                              <td className="account-code">{entry.reference}</td>
                              <td>{entry.label}</td>
                              <td className="num">{money(line.debit)}</td>
                              <td className="num">{money(line.credit)}</td>
                              <td className="num">{money(line.debit - line.credit)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="summary-strip">
                  <span>
                    Solde du relevé <strong>{money(reconciliation.statementBalance)}</strong>
                  </span>
                  <span>
                    Solde théorique <strong>{money(result.theoretical)}</strong>
                  </span>
                  <span>
                    Écart <strong>{money(result.difference)}</strong>
                  </span>
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </>
  );
}
