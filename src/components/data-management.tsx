"use client";

import { useRef, useState } from "react";
import { Download, FileText, HardDrive, LogOut, ShieldCheck, Upload } from "lucide-react";
import { downloadBackup, readBackup } from "@/lib/accounting/files";
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
  offlineReady,
  offlineMode,
  onLogout,
  onRetry,
  notify,
}: {
  workspace: Workspace;
  setWorkspace: WorkspaceSetter;
  cloudUser: CloudUser;
  cloudStatus: string;
  offlineReady: boolean;
  offlineMode: boolean;
  onLogout: () => void;
  onRetry: () => void;
  notify: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<Workspace | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectFile = async (file?: File) => {
    if (!file) return;
    try {
      const backup = await readBackup(file);
      const checked = validateWorkspace(backup);
      if (!checked.success) throw new Error("Cette sauvegarde ne peut pas être restaurée.");
      setPendingBackup(checked.data);
      setConfirmation(false);
      notify(
        `Sauvegarde prête : ${backup.entries.length} écritures et ${backup.projects.length} projet(s).`,
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Le fichier ne peut pas être restauré.");
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
    notify("Sauvegarde restaurée. La mise à jour de votre espace démarre maintenant.");
  };

  const saveBackup = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const source = await downloadBackup(workspace);
      notify(
        source === "device"
          ? "Votre sauvegarde a été créée sur cet appareil."
          : "Votre sauvegarde a été téléchargée.",
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Le téléchargement a échoué.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Confidentialité et conservation</div>
          <h1>Données et sauvegardes</h1>
          <p>Consultez votre espace, téléchargez une copie ou restaurez une sauvegarde.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="data-card">
          <h3>
            <HardDrive size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Accès hors connexion
          </h3>
          <p>
            {offlineReady
              ? "Une copie protégée de votre espace est disponible sur cet appareil. Vous pouvez vous reconnecter et poursuivre votre travail hors connexion."
              : "Connectez-vous avec une connexion Internet pour préparer votre accès hors connexion sur cet appareil."}
          </p>
          <span className={`pill ${offlineReady ? "green" : "amber"}`}>
            {offlineReady
              ? offlineMode
                ? "Disponible hors connexion"
                : "Prête sur cet appareil"
              : "À préparer"}
          </span>
        </div>
        <div className="data-card">
          <h3>Votre espace privé</h3>
          <p>
            Connecté comme <strong>{cloudUser.email}</strong>. Les modifications sont enregistrées
            automatiquement et transmises au retour de la connexion.
          </p>
          <div className="actions">
            <span
              className={`pill ${
                offlineMode ||
                cloudStatus.includes("rétablir") ||
                cloudStatus.includes("comparer") ||
                cloudStatus.includes("Enregistrement")
                  ? "amber"
                  : "green"
              }`}
            >
              {cloudStatus}
            </span>
            {(cloudStatus.includes("rétablir") || offlineMode) && (
              <Button size="small" onClick={onRetry}>
                Rétablir la connexion
              </Button>
            )}
            <Button size="small" onClick={onLogout}>
              <LogOut size={13} />
              Déconnexion
            </Button>
          </div>
        </div>
        <div className="data-card">
          <h3>
            <Download size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Télécharger une sauvegarde
          </h3>
          <p>
            La sauvegarde comprend le plan comptable, les écritures, les projets et les budgets.
          </p>
          <Button
            variant="primary"
            size="small"
            disabled={downloading}
            onClick={() => void saveBackup()}
          >
            <FileText size={14} />
            {downloading ? "Préparation…" : "Télécharger une copie"}
          </Button>
        </div>
        <div className="data-card">
          <h3>
            <Upload size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Restaurer une sauvegarde
          </h3>
          <p>
            Choisissez un fichier de sauvegarde, vérifiez son contenu, puis confirmez le
            remplacement.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".sycebnl,.json,application/json"
            hidden
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
          <div className="actions">
            <Button size="small" onClick={() => inputRef.current?.click()}>
              <Upload size={13} />
              {pendingBackup ? "Choisir une autre copie" : "Choisir un fichier"}
            </Button>
            <Button
              size="small"
              variant={confirmation ? "danger" : "default"}
              disabled={!pendingBackup}
              onClick={restore}
            >
              {confirmation ? "Confirmer la restauration" : "Préparer la restauration"}
            </Button>
          </div>
          {pendingBackup && (
            <div className="notice warning" style={{ marginTop: 11 }}>
              {pendingBackup.entries.length} écritures · {pendingBackup.projects.length} projet(s) ·{" "}
              {pendingBackup.accounts.length} comptes.{" "}
              {confirmation
                ? "Confirmez pour remplacer les données actuelles."
                : "Le contenu est vérifié. Préparez la confirmation."}
            </div>
          )}
        </div>
      </div>
      <Panel
        className="privacy-panel"
        title="Protection des données"
        caption="Quelques règles simples pour préserver vos documents"
      >
        <div className="panel-body privacy-content">
          <div className="notice">
            <ShieldCheck size={14} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Chaque compte possède son propre espace privé. Le partage avec d’autres personnes n’est
            pas activé.
          </div>
          <div className="notice warning">
            Les sauvegardes contiennent des données financières sensibles. Conservez-les dans un
            emplacement protégé et réservez-en l’accès aux personnes autorisées.
          </div>
          <div className="notice">
            La restauration demande une confirmation. Cet écran ne propose pas de réinitialisation
            générale des données.
          </div>
        </div>
      </Panel>
    </>
  );
}
