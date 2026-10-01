"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Database,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createEmptyWorkspace, type Workspace } from "@/lib/accounting/types";
import { validateWorkspace } from "@/lib/accounting/validation";
import type { WorkspaceSetter } from "./shared";
import { AccountsView } from "./accounts";
import { CloudAccessPage, type CloudUser } from "./cloud-access";
import { Dashboard } from "./dashboard";
import { DataManagementView } from "./data-management";
import { JournalView } from "./journal";
import { NarrativeView } from "./narrative";
import { ProjectsView } from "./projects";
import { ReconciliationView } from "./reconciliation";
import { ReportsView } from "./reports";
import { Button, Modal } from "./ui";

const navItems: { id: string; label: string; icon: LucideIcon; section: string }[] = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, section: "PILOTAGE" },
  { id: "journal", label: "Journal", icon: ScrollText, section: "COMPTABILITÉ" },
  { id: "accounts", label: "Plan comptable", icon: BookOpen, section: "COMPTABILITÉ" },
  {
    id: "projects",
    label: "Projets & budgets",
    icon: FolderKanban,
    section: "GESTION DES PROJETS",
  },
  { id: "reports", label: "Rapports & états", icon: BarChart3, section: "ÉTATS FINANCIERS" },
  {
    id: "reconciliation",
    label: "Rapprochement",
    icon: ArrowLeftRight,
    section: "ÉTATS FINANCIERS",
  },
  { id: "narrative", label: "Rapport narratif", icon: FileText, section: "ÉTATS FINANCIERS" },
  { id: "data", label: "Données & sauvegardes", icon: Database, section: "PARAMÈTRES" },
];

type SyncState = "loading" | "saving" | "synced" | "error" | "conflict";
const userKey = (id: string) => `compta-sycebnl.workspace.${id}`;

function parseStoredWorkspace(raw: string | null): Workspace | null {
  if (!raw) return null;
  try {
    const checked = validateWorkspace(JSON.parse(raw));
    if (checked.success) return checked.data;
  } catch {
    return null;
  }
  return null;
}

function readLocalWorkspace(key: string): Workspace | null {
  try {
    return parseStoredWorkspace(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function AppShell() {
  const [workspace, setRawWorkspace] = useState<Workspace>(() => createEmptyWorkspace());
  const [currentKey, setCurrentKey] = useState("");
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState("dashboard");
  const [year, setYear] = useState(new Date().getFullYear());
  const [toast, setToast] = useState("");
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const versionRef = useRef<number | null>(null);
  const lastSyncRef = useRef("");
  const syncInProgressRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageWarningShown = useRef(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);

  const setWorkspace: WorkspaceSetter = useCallback(
    (action) =>
      setRawWorkspace((current) => {
        const next = typeof action === "function" ? action(current) : action;
        if (next === current) return current;
        return { ...next, updatedAt: new Date().toISOString() };
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      let chosen = createEmptyWorkspace();
      let user: CloudUser | null = null;
      let key = "";
      let cloudVersion: number | null = null;
      let nextSyncState: SyncState = "error";
      let syncedSnapshot = "";

      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Session indisponible");
        const data = await response.json();
        if (!data.user) {
          if (!cancelled) {
            setCurrentKey("");
            setRawWorkspace(createEmptyWorkspace());
            setCloudUser(null);
            setSyncState("error");
            setReady(true);
          }
          return;
        }

        user = data.user as CloudUser;
        key = userKey(user.id);
        const userLocal = readLocalWorkspace(key);
        if (userLocal) chosen = userLocal;

        const remoteResponse = await fetch("/api/workspace", {
          credentials: "include",
          cache: "no-store",
        });
        if (!remoteResponse.ok) throw new Error("Espace indisponible");
        const remote = (await remoteResponse.json()) as {
          version: number;
          state: Workspace;
          updatedAt: string;
        };
        const checkedRemote = validateWorkspace(remote.state);
        if (!checkedRemote.success) throw new Error("Espace à vérifier");
        cloudVersion = remote.version;
        const remoteDate = Date.parse(checkedRemote.data.updatedAt || remote.updatedAt || "");
        const localDate = Date.parse(userLocal?.updatedAt || "");

        if (userLocal && Number.isFinite(localDate) && localDate > remoteDate) {
          chosen = userLocal;
          nextSyncState = "conflict";
          syncedSnapshot = JSON.stringify(checkedRemote.data);
        } else {
          chosen = checkedRemote.data;
          nextSyncState = "synced";
          syncedSnapshot = JSON.stringify(chosen);
        }
      } catch {
        nextSyncState = "error";
      }

      if (cancelled) return;
      setCurrentKey(key);
      setRawWorkspace(chosen);
      setCloudUser(user);
      versionRef.current = cloudVersion;
      lastSyncRef.current = syncedSnapshot;
      setSyncState(nextSyncState);
      setReady(true);
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !cloudUser || !currentKey) return;
    try {
      localStorage.setItem(currentKey, JSON.stringify(workspace));
      storageWarningShown.current = false;
    } catch {
      if (!storageWarningShown.current) {
        storageWarningShown.current = true;
        window.setTimeout(
          () =>
            notify(
              "L’espace disponible sur cet appareil est insuffisant. Téléchargez une sauvegarde.",
            ),
          0,
        );
      }
    }
  }, [workspace, currentKey, ready, cloudUser, notify]);

  useEffect(() => {
    if (
      !ready ||
      !cloudUser ||
      syncState === "conflict" ||
      syncState === "error" ||
      syncInProgressRef.current
    ) {
      return;
    }
    const serialized = JSON.stringify(workspace);
    if (serialized === lastSyncRef.current) return;

    const timer = setTimeout(async () => {
      syncInProgressRef.current = true;
      setSyncState("saving");
      try {
        const response = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ version: versionRef.current, state: workspace }),
        });
        if (response.status === 409) {
          setSyncState("conflict");
          return;
        }
        if (!response.ok) throw new Error("Échec de l’enregistrement");
        const result = await response.json();
        versionRef.current = result.version;
        lastSyncRef.current = serialized;
        setSyncState("synced");
      } catch {
        setSyncState("error");
      } finally {
        syncInProgressRef.current = false;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [workspace, ready, cloudUser, syncState]);

  const connectCloud = async (user: CloudUser) => {
    try {
      const response = await fetch("/api/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Impossible de charger votre espace.");
      }
      const remote = (await response.json()) as { version: number; state: Workspace };
      const checkedRemote = validateWorkspace(remote.state);
      if (!checkedRemote.success) throw new Error("Votre espace doit être vérifié.");
      const key = userKey(user.id);
      const cached = readLocalWorkspace(key);
      let chosen = checkedRemote.data;
      const version = remote.version;
      const localDate = Date.parse(cached?.updatedAt || "");
      const remoteDate = Date.parse(checkedRemote.data.updatedAt || "");
      const hasNewerLocal = Boolean(cached && Number.isFinite(localDate) && localDate > remoteDate);
      if (hasNewerLocal && cached) chosen = cached;

      setCurrentKey(key);
      setRawWorkspace(chosen);
      setCloudUser(user);
      versionRef.current = version;
      lastSyncRef.current = JSON.stringify(hasNewerLocal ? checkedRemote.data : chosen);
      setSyncState(hasNewerLocal ? "conflict" : "synced");
      setReady(true);
    } catch {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        // Le prochain contrôle de session gardera les données masquées.
      }
      throw new Error("Votre espace n’a pas pu être ouvert. Réessayez dans quelques instants.");
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // L’écran d’accès masque les données même si la fermeture de session échoue.
    }
    setCloudUser(null);
    setCurrentKey("");
    versionRef.current = null;
    lastSyncRef.current = "";
    setRawWorkspace(createEmptyWorkspace());
    setSyncState("error");
    setReady(true);
    setActive("dashboard");
  };

  const resolveConflict = async (choice: "remote" | "local") => {
    try {
      const remoteResponse = await fetch("/api/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!remoteResponse.ok) throw new Error("Impossible de charger l’autre version.");
      const remote = (await remoteResponse.json()) as { version: number; state: Workspace };

      if (choice === "remote") {
        setRawWorkspace(remote.state);
        versionRef.current = remote.version;
        lastSyncRef.current = JSON.stringify(remote.state);
        setSyncState("synced");
      } else {
        const save = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ version: remote.version, state: workspace }),
        });
        if (!save.ok) throw new Error("Cette version n’a pas pu être conservée.");
        const result = await save.json();
        versionRef.current = result.version;
        lastSyncRef.current = JSON.stringify(workspace);
        setSyncState("synced");
      }
      notify(
        choice === "remote"
          ? "L’autre version a été chargée."
          : "Cette version a été conservée et enregistrée.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Conflit non résolu.");
    }
  };

  const title =
    active === "new-entry"
      ? "Journal des écritures"
      : navItems.find((item) => item.id === active)?.label || "Tableau de bord";
  const syncLabels: Record<SyncState, string> = {
    loading: "Vérification…",
    saving: "Enregistrement…",
    synced: "Tout est à jour",
    error: "Enregistrement à vérifier",
    conflict: "Versions à comparer",
  };
  const statusClass =
    syncState === "error" || syncState === "conflict"
      ? "error"
      : syncState === "saving" || syncState === "loading"
        ? "warning"
        : "";
  const viewProps = { workspace, setWorkspace, year, notify };

  let content;
  switch (active) {
    case "journal":
      content = <JournalView {...viewProps} />;
      break;
    case "new-entry":
      content = <JournalView {...viewProps} openOnMount />;
      break;
    case "accounts":
      content = <AccountsView {...viewProps} />;
      break;
    case "projects":
      content = <ProjectsView {...viewProps} />;
      break;
    case "reports":
      content = <ReportsView {...viewProps} />;
      break;
    case "reconciliation":
      content = <ReconciliationView {...viewProps} />;
      break;
    case "narrative":
      content = <NarrativeView {...viewProps} />;
      break;
    case "data":
      content = (
        <DataManagementView
          workspace={workspace}
          setWorkspace={setWorkspace}
          cloudUser={cloudUser!}
          cloudStatus={syncLabels[syncState]}
          onLogout={() => void logout()}
          notify={notify}
        />
      );
      break;
    default:
      content = <Dashboard {...viewProps} onNewEntry={() => setActive("new-entry")} />;
  }

  const mobileItems = ["dashboard", "journal", "projects", "reports", "data"];
  if (!ready) {
    return (
      <div className="auth-screen">
        <div className="auth-visual">
          <div className="brand">
            <div className="brand-mark">S+</div>
            <div>
              <div className="brand-title">Compta SYCEBNL+</div>
              <div className="brand-sub">Gestion comptable associative</div>
            </div>
          </div>
          <div className="auth-quote">
            <h1>Une comptabilité au service de vos projets.</h1>
            <p>Préparation de l’accès à votre espace.</p>
          </div>
          <div className="auth-foot">Référentiel OHADA · SYCEBNL</div>
        </div>
        <div className="auth-box-wrap">
          <div className="auth-box">
            <div className="brand-mark" style={{ marginBottom: 25 }}>
              S+
            </div>
            <h2>Préparation de votre espace</h2>
            <p>Nous préparons votre accès sécurisé.</p>
            <div className="progress">
              <span style={{ width: "65%" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!cloudUser) return <CloudAccessPage onSuccess={connectCloud} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S+</div>
          <div>
            <div className="brand-title">Compta SYCEBNL+</div>
            <div className="brand-sub">Gestion comptable</div>
          </div>
        </div>
        {[...new Set(navItems.map((item) => item.section))].map((section) => (
          <div key={section}>
            <div className="nav-caption">{section}</div>
            <nav className="nav-list">
              {navItems
                .filter((item) => item.section === section)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className={`nav-item ${active === item.id || (item.id === "journal" && active === "new-entry") ? "active" : ""}`}
                      key={item.id}
                      onClick={() => setActive(item.id)}
                      title={item.label}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
            </nav>
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <strong>Clair, juste, utile.</strong>Vos écritures et budgets, au même endroit.
          </div>
          <div className="profile-row">
            <div className="avatar">
              {cloudUser ? cloudUser.email.slice(0, 1).toUpperCase() : "L"}
            </div>
            <div>
              <div className="profile-name">{cloudUser.email}</div>
              <div className="profile-mode">Compte connecté</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Compta SYCEBNL+ / {title}</div>
            <div className="topbar-title">{title}</div>
          </div>
          <div className="topbar-right">
            <label style={{ fontSize: 11, color: "#78857d" }}>Exercice</label>
            <select
              className="select"
              style={{ width: 96, padding: "7px 8px" }}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - 3 + index).map(
                (exercise) => (
                  <option key={exercise}>{exercise}</option>
                ),
              )}
            </select>
            <span className="sync-status" title={syncLabels[syncState]}>
              <i className={`sync-dot ${statusClass}`} />
              {syncLabels[syncState]}
            </span>
            <button
              className="btn ghost small"
              title="Se déconnecter"
              onClick={() => void logout()}
            >
              <LogOut size={14} />
            </button>
          </div>
        </header>
        <div className="content">
          {syncState === "error" && cloudUser && (
            <div className="notice warning no-print" style={{ marginBottom: 15 }}>
              La dernière modification n’a pas pu être enregistrée dans votre espace. Vos données
              restent conservées sur cet appareil. Vérifiez votre connexion, puis réessayez.
              <Button size="small" onClick={() => setSyncState("loading")}>
                Réessayer
              </Button>
            </div>
          )}
          {content}
        </div>
      </main>

      <nav className="mobile-nav">
        {mobileItems.map((id) => {
          const item = navItems.find((candidate) => candidate.id === id)!;
          const Icon = item.icon;
          const label =
            id === "dashboard"
              ? "Accueil"
              : id === "projects"
                ? "Projets"
                : id === "reports"
                  ? "États"
                  : id === "data"
                    ? "Données"
                    : "Journal";
          return (
            <button
              className={
                active === id || (id === "journal" && active === "new-entry") ? "active" : ""
              }
              key={id}
              onClick={() => setActive(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {syncState === "conflict" && (
        <Modal
          title="Deux versions à comparer"
          subtitle="Votre espace a changé depuis la dernière consultation."
          onClose={() => {}}
        >
          <div className="notice warning">
            Aucune donnée n’a été remplacée. Choisissez la version que vous souhaitez conserver.
          </div>
          <div className="actions" style={{ marginTop: 15 }}>
            <Button onClick={() => void resolveConflict("remote")}>
              Conserver l’autre version
            </Button>
            <Button variant="primary" onClick={() => void resolveConflict("local")}>
              Conserver cette version
            </Button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
