"use client";
import { useRef, useState } from "react";
import { Cloud, Download, FileJson, HardDrive, LogOut, ShieldCheck, Upload } from "lucide-react";
import { readBackup, downloadBackup } from "@/lib/accounting/files";
import { validateWorkspace } from "@/lib/accounting/validation";
import type { Workspace } from "@/lib/accounting/types";
import type { WorkspaceSetter } from "./shared";
import type { CloudUser } from "./cloud-access";
import { Button, Panel } from "./ui";

export function DataManagementView({
  workspace,
  setWorkspace,
  cloudUser,
  cloudStatus,
  onConnect,
  onLogout,
  notify,
}: {
  workspace: Workspace;
  setWorkspace: WorkspaceSetter;
  cloudUser: CloudUser | null;
  cloudStatus: string;
  onConnect: () => void;
  onLogout: () => void;
  notify: (m: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<Workspace | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const selectFile = async (file?: File) => {
    if (!file) return;
    try {
      const backup = await readBackup(file);
      const checked = validateWorkspace(backup);
      if (!checked.success) throw new Error(checked.message);
      setPendingBackup(checked.data);
      setConfirmation(false);
      notify(
        `Sauvegarde analysée : ${backup.entries.length} écritures, ${backup.projects.length} projet(s).`,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Fichier de sauvegarde invalide.");
    }
    if (inputRef.current) inputRef.current.value = "";
  };
  const restore = () => {
    if (!pendingBackup) {
      inputRef.current?.click();
      return;
    }
    if (!confirmation) {
      setConfirmation(true);
      return;
    }
    setWorkspace(pendingBackup);
    setPendingBackup(null);
    setConfirmation(false);
    notify(
      "Sauvegarde restaurée sur cet appareil; la synchronisation cloud suivra si elle est active.",
    );
  };
  const cloudText = cloudUser ? `Connecté comme ${cloudUser.email}` : "Non connecté";
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Confidentialité & conservation</div>
          <h1>Données et sauvegardes</h1>
          <p>
            Choisissez votre espace de travail, téléchargez une copie et contrôlez les
            restaurations.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="data-card">
          <h3>
            <HardDrive size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Stockage sur cet appareil
          </h3>
          <p>
            Enregistrement automatique à chaque modification dans le navigateur utilisé. Videz le
            cache uniquement après avoir téléchargé une sauvegarde.
          </p>
          <span className="pill green">Actif · localStorage</span>
        </div>
        <div className="data-card">
          <h3>
            <Cloud size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Espace cloud privé
          </h3>
          <p>
            {cloudText}. Les espaces sont isolés par identifiant utilisateur et synchronisés environ
            1,5 seconde après une modification.
          </p>
          <div className="actions">
            {cloudUser ? (
              <>
                <span className={`pill ${cloudStatus.includes("vérifier") ? "amber" : "green"}`}>
                  {cloudStatus}
                </span>
                {cloudStatus.includes("vérifier") && (
                  <Button size="small" onClick={() => window.location.reload()}>
                    Réessayer
                  </Button>
                )}
                <Button size="small" onClick={onLogout}>
                  <LogOut size={13} />
                  Déconnexion
                </Button>
              </>
            ) : (
              <>
                <span className="pill amber">Mode appareil uniquement</span>
                <Button size="small" onClick={onConnect}>
                  <Cloud size={13} />
                  Connexion / création
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="data-card">
          <h3>
            <Download size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Sauvegarde fichier
          </h3>
          <p>
            Téléchargez l’ensemble du plan, des écritures, projets, budgets, rapprochements et
            paramètres au format JSON.
          </p>
          <Button variant="primary" size="small" onClick={() => downloadBackup(workspace)}>
            <FileJson size={14} />
            Télécharger .json
          </Button>
        </div>
        <div className="data-card">
          <h3>
            <Upload size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Restaurer une sauvegarde
          </h3>
          <p>
            Choisissez un fichier JSON valide. Vérifiez son contenu, puis confirmez en deux clics
            avant le remplacement de l’espace affiché.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void selectFile(e.target.files?.[0])}
          />
          <div className="actions">
            <Button size="small" onClick={() => inputRef.current?.click()}>
              <Upload size={13} />
              {pendingBackup ? "Choisir un autre fichier" : "Choisir un fichier"}
            </Button>
            <Button
              size="small"
              variant={confirmation ? "danger" : "default"}
              disabled={!pendingBackup}
              onClick={restore}
            >
              {confirmation ? "Confirmer — restaurer maintenant" : "1er clic — préparer"}
            </Button>
          </div>
          {pendingBackup && (
            <div className="notice warning" style={{ marginTop: 11 }}>
              Fichier prêt : {pendingBackup.entries.length} écritures ·{" "}
              {pendingBackup.projects.length} projet(s) · {pendingBackup.accounts.length} comptes.{" "}
              {confirmation
                ? "Cliquez à nouveau pour remplacer les données actuellement ouvertes."
                : "Cliquez une fois pour armer la confirmation."}
            </div>
          )}
        </div>
      </div>
      <Panel title="Protection des données" caption="À connaître avant un déploiement partagé">
        <div className="panel-body" style={{ display: "grid", gap: 10 }}>
          <div className="notice">
            <ShieldCheck size={14} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Chaque compte cloud conserve un seul espace privé ; aucun partage des mêmes livres,
            rôles ou journal d’audit n’est activé.
          </div>
          <div className="notice warning">
            Les sauvegardes contiennent des données financières sensibles. Stockez le fichier JSON
            dans un emplacement protégé. Un utilisateur déconnecté conserve son espace cloud et sa
            copie locale propre à son compte.
          </div>
          <div className="notice">
            La restauration et les suppressions sont protégées par confirmation à deux clics ; aucun
            bouton de réinitialisation globale n’est fourni.
          </div>
        </div>
      </Panel>
    </>
  );
}
