"use client";
import { useMemo, useRef, useState } from "react";
import { FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { isAccountReferenced, referencedAccountNumbers } from "@/lib/accounting/account-safety";
import { importAccounts } from "@/lib/accounting/files";
import { Button, Empty, Field, Modal, Panel } from "./ui";
import type { ViewProps } from "./shared";

export function AccountsView({ workspace, setWorkspace, notify }: ViewProps) {
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () =>
      workspace.accounts
        .filter((a) => `${a.number} ${a.label}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [workspace.accounts, query],
  );
  const { entries, projects, reconciliations } = workspace;
  const referencedAccounts = useMemo(
    () => referencedAccountNumbers({ entries, projects, reconciliations }),
    [entries, projects, reconciliations],
  );
  const selectableCodes = list
    .filter((account) => !referencedAccounts.has(account.number))
    .map((account) => account.number);
  const selection = selectedCodes.filter((code) => selectableCodes.includes(code));
  const allSelectableSelected =
    selectableCodes.length > 0 && selectableCodes.every((code) => selection.includes(code));

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
        ? current.accounts.map((account) => {
            if (account.number !== editingCode) return account;
            const changed = account.number !== code || account.label !== title;
            return {
              ...account,
              number: code,
              label: title,
              source: account.source === "map" && changed ? "custom" : account.source,
            };
          })
        : [...current.accounts, { number: code, label: title, source: "custom" }],
    }));
    const wasEditing = editingCode !== null;
    setEditingCode(null);
    setNumber("");
    setLabel("");
    setModal(false);
    setSelectedCodes([]);
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
      setSelectedCodes([]);
      notify(`${imported.length} comptes importés ou actualisés.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import impossible.");
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (code: string) => {
    if (isAccountReferenced(workspace, code)) {
      notify(
        "Ce compte est utilisé dans une écriture, un budget ou un rapprochement et ne peut pas être supprimé.",
      );
      return;
    }
    if (pendingDelete !== code) {
      setPendingDelete(code);
      return;
    }
    setWorkspace((current) => {
      if (isAccountReferenced(current, code)) return current;
      return {
        ...current,
        accounts: current.accounts.filter((account) => account.number !== code),
      };
    });
    setSelectedCodes((current) => current.filter((selected) => selected !== code));
    setPendingDelete(null);
    notify("Compte supprimé.");
  };

  const deleteSelected = () => {
    const removableCodes = selection.filter(
      (code) =>
        workspace.accounts.some((account) => account.number === code) &&
        !isAccountReferenced(workspace, code),
    );
    const protectedCount = selection.length - removableCodes.length;
    if (removableCodes.length === 0) {
      setConfirmBulkDelete(false);
      setSelectedCodes([]);
      notify("Aucun des comptes sélectionnés ne peut être supprimé.");
      return;
    }

    setWorkspace((current) => {
      const currentReferences = referencedAccountNumbers(current);
      const safeToRemove = new Set(removableCodes.filter((code) => !currentReferences.has(code)));
      return {
        ...current,
        accounts: current.accounts.filter((account) => !safeToRemove.has(account.number)),
      };
    });
    setSelectedCodes([]);
    setPendingDelete(null);
    setConfirmBulkDelete(false);
    const removedText = `${removableCodes.length} compte${removableCodes.length > 1 ? "s" : ""} supprimé${removableCodes.length > 1 ? "s" : ""}.`;
    notify(
      protectedCount > 0
        ? `${removedText} ${protectedCount} compte${protectedCount > 1 ? "s" : ""} utilisé${protectedCount > 1 ? "s" : ""} conservé${protectedCount > 1 ? "s" : ""}.`
        : removedText,
    );
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
            onChange={(event) => void upload(event.target.files?.[0])}
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
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedCodes([]);
                }}
                placeholder="Numéro de compte ou mot-clé…"
              />
            </div>
            <span className="pill">Référentiel MAP Afrique · imports · comptes personnalisés</span>
          </div>
          <div className="account-bulk-toolbar">
            <span aria-live="polite">
              {selection.length === 0
                ? "Cochez les comptes à supprimer dans la liste."
                : `${selection.length} compte${selection.length > 1 ? "s" : ""} sélectionné${selection.length > 1 ? "s" : ""}.`}
            </span>
            <Button
              size="small"
              variant="danger"
              disabled={selection.length === 0}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 size={13} />
              Supprimer la sélection{selection.length > 0 ? ` (${selection.length})` : ""}
            </Button>
          </div>
          {workspace.accounts.some((account) => account.source === "demo") && (
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
                  <th className="account-select-cell">
                    <input
                      type="checkbox"
                      className="account-select-checkbox"
                      aria-label="Sélectionner tous les comptes supprimables affichés"
                      checked={allSelectableSelected}
                      disabled={selectableCodes.length === 0}
                      onChange={(event) =>
                        setSelectedCodes(event.target.checked ? selectableCodes : [])
                      }
                    />
                  </th>
                  <th>Numéro</th>
                  <th>Libellé</th>
                  <th>Origine</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((account) => {
                  const referenced = referencedAccounts.has(account.number);
                  return (
                    <tr key={account.number}>
                      <td className="account-select-cell">
                        <input
                          type="checkbox"
                          className="account-select-checkbox"
                          aria-label={`Sélectionner le compte ${account.number} — ${account.label}`}
                          title={
                            referenced
                              ? "Ce compte est déjà utilisé et ne peut pas être supprimé."
                              : undefined
                          }
                          checked={selection.includes(account.number)}
                          disabled={referenced}
                          onChange={(event) => {
                            setSelectedCodes((current) =>
                              event.target.checked
                                ? current.includes(account.number)
                                  ? current
                                  : [...current, account.number]
                                : current.filter((code) => code !== account.number),
                            );
                          }}
                        />
                      </td>
                      <td className="account-code">{account.number}</td>
                      <td>{account.label}</td>
                      <td>
                        <span
                          className={`pill ${account.source === "import" || account.source === "map" ? "green" : account.source === "demo" ? "amber" : ""}`}
                        >
                          {account.source === "map"
                            ? "MAP Afrique"
                            : account.source === "import"
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {confirmBulkDelete && selection.length > 0 && (
        <Modal
          title={`Supprimer ${selection.length} compte${selection.length > 1 ? "s" : ""} ?`}
          subtitle="Vérifiez votre sélection avant de continuer."
          onClose={() => setConfirmBulkDelete(false)}
          footer={
            <>
              <Button onClick={() => setConfirmBulkDelete(false)}>Annuler</Button>
              <Button variant="danger" onClick={deleteSelected}>
                <Trash2 size={14} /> Confirmer la suppression
              </Button>
            </>
          }
        >
          <div className="notice warning">
            Les comptes liés à une écriture, à un budget ou à un rapprochement ne seront pas
            supprimés.
          </div>
          <p style={{ marginBottom: 0, color: "#53645a", fontSize: 12 }}>
            {selection.length} compte{selection.length > 1 ? "s" : ""} sélectionné
            {selection.length > 1 ? "s" : ""} dans le plan comptable.
          </p>
        </Modal>
      )}
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
                onChange={(event) => setNumber(event.target.value)}
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
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Intitulé du compte"
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
