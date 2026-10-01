"use client";
import { useMemo, useRef, useState } from "react";
import { FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { importAccounts } from "@/lib/accounting/files";
import { Button, Empty, Field, Modal, Panel } from "./ui";
import type { ViewProps } from "./shared";

export function AccountsView({ workspace, setWorkspace, notify }: ViewProps) {
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () =>
      workspace.accounts
        .filter((a) => `${a.number} ${a.label}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [workspace.accounts, query],
  );
  const save = () => {
    const code = number.trim();
    const title = label.trim();
    if (!/^\d{1,12}$/.test(code) || !title) {
      notify("Le numéro doit être numérique et le libellé obligatoire.");
      return;
    }
    if (workspace.accounts.some((a) => a.number === code && a.number !== editingCode)) {
      notify("Ce numéro de compte existe déjà.");
      return;
    }
    if (
      workspace.accounts.some(
        (account) =>
          account.number !== editingCode &&
          account.label.trim().toLocaleLowerCase("fr-FR") === title.toLocaleLowerCase("fr-FR"),
      )
    ) {
      notify("Ce libellé existe déjà dans le plan comptable.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      accounts: editingCode
        ? current.accounts.map((account) =>
            account.number === editingCode ? { ...account, number: code, label: title } : account,
          )
        : [...current.accounts, { number: code, label: title, source: "custom" }],
    }));
    const wasEditing = editingCode !== null;
    setEditingCode(null);
    setNumber("");
    setLabel("");
    setModal(false);
    notify(wasEditing ? "Compte mis à jour." : "Compte ajouté au plan comptable.");
  };
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importAccounts(file);
      setWorkspace((current) => {
        const map = new Map(current.accounts.map((a) => [a.number, a]));
        for (const account of imported) map.set(account.number, { ...account, source: "import" });
        return { ...current, accounts: [...map.values()] };
      });
      notify(`${imported.length} comptes importés ou actualisés.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import impossible.");
    }
    if (inputRef.current) inputRef.current.value = "";
  };
  const remove = (code: string) => {
    const referenced =
      workspace.entries.some((e) => e.lines.some((l) => l.accountNumber === code)) ||
      workspace.projects.some((p) => p.budgetLines.some((l) => l.accountNumber === code)) ||
      workspace.reconciliations.some((item) => item.accountNumber === code);
    if (referenced) {
      notify(
        "Ce compte est utilisé dans une écriture, un budget ou un rapprochement et ne peut pas être supprimé.",
      );
      return;
    }
    if (pendingDelete !== code) {
      setPendingDelete(code);
      return;
    }
    setWorkspace((current) => ({
      ...current,
      accounts: current.accounts.filter((a) => a.number !== code),
    }));
    setPendingDelete(null);
    notify("Compte supprimé.");
  };
  const edit = (account: (typeof workspace.accounts)[number]) => {
    setEditingCode(account.number);
    setNumber(account.number);
    setLabel(account.label);
    setModal(true);
  };
  const numberLocked = Boolean(
    editingCode &&
    (workspace.entries.some((entry) =>
      entry.lines.some((line) => line.accountNumber === editingCode),
    ) ||
      workspace.projects.some((project) =>
        project.budgetLines.some((line) => line.accountNumber === editingCode),
      ) ||
      workspace.reconciliations.some((item) => item.accountNumber === editingCode)),
  );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Référentiel</div>
          <h1>Plan comptable</h1>
          <p>
            Recherchez un compte, importez le référentiel de votre organisation ou créez un compte.
          </p>
        </div>
        <div className="actions">
          <Button onClick={() => inputRef.current?.click()}>
            <FileUp />
            Importer des comptes
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setEditingCode(null);
              setNumber("");
              setLabel("");
              setModal(true);
            }}
          >
            <Plus />
            Ajouter un compte
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
      </div>
      <Panel
        title={`${list.length.toLocaleString("fr-FR")} comptes`}
        caption="Recherche par numéro ou libellé"
      >
        <div className="panel-body" style={{ paddingBottom: 10 }}>
          <div className="toolbar">
            <div className="search-box">
              <Search />
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Numéro de compte ou mot-clé…"
              />
            </div>
            <span className="pill">Types : référentiel, personnalisés et exemples</span>
          </div>
          {workspace.accounts.some((a) => a.source === "demo") && (
            <div className="notice warning">
              Les comptes proposés au départ sont des exemples à confirmer. Importez le référentiel
              comptable de votre organisation (numéro et libellé) pour le remplacer ou le compléter.
            </div>
          )}
        </div>
        {list.length === 0 ? (
          <Empty title="Aucun compte trouvé">
            Modifiez votre recherche ou importez le plan comptable.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Libellé</th>
                  <th>Origine</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((account) => (
                  <tr key={account.number}>
                    <td className="account-code">{account.number}</td>
                    <td>{account.label}</td>
                    <td>
                      <span
                        className={`pill ${account.source === "import" ? "green" : account.source === "demo" ? "amber" : ""}`}
                      >
                        {account.source === "import"
                          ? "Importé"
                          : account.source === "demo"
                            ? "Exemple"
                            : "Personnalisé"}
                      </span>
                    </td>
                    <td className="right">
                      <Button size="small" variant="ghost" onClick={() => edit(account)}>
                        <Pencil size={13} /> Modifier
                      </Button>
                      <Button
                        size="small"
                        variant={pendingDelete === account.number ? "danger" : "ghost"}
                        onClick={() => remove(account.number)}
                      >
                        {pendingDelete === account.number ? "Confirmer suppression" : "Supprimer"}
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
      {modal && (
        <Modal
          title={editingCode ? "Modifier un compte" : "Ajouter un compte"}
          subtitle="Les comptes personnalisés restent dans votre espace."
          onClose={() => setModal(false)}
          footer={
            <>
              <Button
                onClick={() => {
                  setModal(false);
                  setEditingCode(null);
                }}
              >
                Annuler
              </Button>
              <Button variant="primary" onClick={save}>
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <Field
              label="Numéro de compte"
              help={
                numberLocked
                  ? "Ce numéro est déjà utilisé dans les écritures ou les budgets."
                  : undefined
              }
            >
              <input
                className="input"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                inputMode="numeric"
                placeholder="Ex. 521"
                maxLength={12}
                disabled={numberLocked}
              />
            </Field>
            <Field label="Libellé">
              <input
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Intitulé du compte"
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
