"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Cloud,
  Database,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createEmptyWorkspace, type Workspace } from "@/lib/accounting/types";
import type { WorkspaceSetter } from "./shared";
import { AccountsView } from "./accounts";
import { CloudAccessModal, type CloudUser } from "./cloud-access";
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

type SyncState = "loading" | "local" | "saving" | "synced" | "error" | "conflict";
const GUEST_KEY = "compta-sycebnl.workspace.guest";
const userKey = (id: string) => `compta-sycebnl.workspace.${id}`;

function parseStoredWorkspace(raw: string | null): Workspace | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Workspace;
    if (
      value?.schemaVersion === 1 &&
      Array.isArray(value.accounts) &&
      Array.isArray(value.entries) &&
      Array.isArray(value.projects)
    ) {
      return value;
    }
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
  const [currentKey, setCurrentKey] = useState(GUEST_KEY);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState("dashboard");
  const [year, setYear] = useState(new Date().getFullYear());
  const [toast, setToast] = useState("");
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [cloudModal, setCloudModal] = useState(false);
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
      const guest = readLocalWorkspace(GUEST_KEY) || createEmptyWorkspace();
      let chosen = guest;
      let user: CloudUser | null = null;
      let cloudVersion: number | null = null;
      let nextSyncState: SyncState = "local";
      let syncedSnapshot = "";

      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json();

        if (data.user) {
          user = data.user as CloudUser;
          const key = userKey(user.id);
          setCurrentKey(key);
          const userLocal = readLocalWorkspace(key);
          chosen = userLocal || createEmptyWorkspace();
          nextSyncState = "error";

          const remoteResponse = await fetch("/api/workspace", {
            credentials: "include",
            cache: "no-store",
          });
          if (remoteResponse.ok) {
            const remote = (await remoteResponse.json()) as {
              version: number;
              state: Workspace;
              updatedAt: string;
            };
            cloudVersion = remote.version;
            const remoteDate = Date.parse(remote.state.updatedAt || remote.updatedAt || "");
            const localDate = Date.parse(chosen.updatedAt || "");

            if (userLocal && Number.isFinite(localDate) && localDate > remoteDate) {
              const save = await fetch("/api/workspace", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ version: cloudVersion, state: userLocal }),
              });
              if (save.ok) {
                const saved = await save.json();
                cloudVersion = saved.version;
                chosen = userLocal;
                nextSyncState = "synced";
              } else if (save.status === 409) {
                chosen = userLocal;
                nextSyncState = "conflict";
              } else {
                chosen = userLocal;
                nextSyncState = "error";
              }
            } else {
              chosen = remote.state;
              nextSyncState = "synced";
            }
            syncedSnapshot = JSON.stringify(chosen);
          }
        }
      } catch {
        nextSyncState = user ? "error" : "local";
      }

      if (cancelled) return;
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
    if (!ready) return;
    try {
      localStorage.setItem(currentKey, JSON.stringify(workspace));
      storageWarningShown.current = false;
    } catch {
      if (!storageWarningShown.current) {
        storageWarningShown.current = true;
        window.setTimeout(
          () => notify("Stockage navigateur saturé : téléchargez une sauvegarde JSON."),
          0,
        );
      }
    }
  }, [workspace, currentKey, ready, notify]);

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
        if (!response.ok) throw new Error("Échec cloud");
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

  const connectCloud = async (user: CloudUser, mergeGuest: boolean) => {
    try {
      const response = await fetch("/api/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error((await response.json()).error || "Espace cloud inaccessible.");
      }
      const remote = (await response.json()) as { version: number; state: Workspace };
      const key = userKey(user.id);
      const cached = readLocalWorkspace(key);
      let chosen = remote.state;
      let version = remote.version;
      const guest = readLocalWorkspace(GUEST_KEY);
      const local = mergeGuest ? guest : cached;

      if (local) {
        const localDate = Date.parse(local.updatedAt || "");
        const remoteDate = Date.parse(remote.state.updatedAt || "");
        if (mergeGuest || (Number.isFinite(localDate) && localDate > remoteDate)) {
          const save = await fetch("/api/workspace", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ version: remote.version, state: local }),
          });
          if (!save.ok) {
            throw new Error((await save.json()).error || "Fusion des données impossible.");
          }
          const saved = await save.json();
          chosen = local;
          version = saved.version;
        }
      }

      setCurrentKey(key);
      setRawWorkspace(chosen);
      setCloudUser(user);
      versionRef.current = version;
      lastSyncRef.current = JSON.stringify(chosen);
      setSyncState("synced");
      notify(`Espace cloud prêt pour ${user.email}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Connexion cloud impossible.");
      throw error;
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // L’affichage local reste disponible même si le serveur de session est hors ligne.
    }
    const guest = readLocalWorkspace(GUEST_KEY) || createEmptyWorkspace();
    setCloudUser(null);
    setCurrentKey(GUEST_KEY);
    versionRef.current = null;
    lastSyncRef.current = "";
    setRawWorkspace(guest);
    setSyncState("local");
    notify("Session cloud fermée. L’espace local est affiché.");
  };

  const resolveConflict = async (choice: "remote" | "local") => {
    try {
      const remoteResponse = await fetch("/api/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!remoteResponse.ok) throw new Error("Impossible de charger la version cloud.");
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
        if (!save.ok) throw new Error("La version locale n’a pas pu remplacer la version cloud.");
        const result = await save.json();
        versionRef.current = result.version;
        lastSyncRef.current = JSON.stringify(workspace);
        setSyncState("synced");
      }
      notify(
        choice === "remote"
          ? "Version cloud chargée."
          : "Version locale conservée et envoyée au cloud.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Conflit non résolu.");
    }
  };

  const title = navItems.find((item) => item.id === active)?.label || "Tableau de bord";
  const syncLabels: Record<SyncState, string> = {
    loading: "Chargement…",
    local: "Sur cet appareil",
    saving: "Synchronisation…",
    synced: "Cloud à jour",
    error: "Synchronisation à vérifier",
    conflict: "Conflit de versions",
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
          cloudUser={cloudUser}
          cloudStatus={syncLabels[syncState]}
          onConnect={() => setCloudModal(true)}
          onLogout={() => void logout()}
          notify={notify}
        />
      );
      break;
    default:
      content = <Dashboard {...viewProps} />;
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
            <p>Chargement de votre espace sécurisé…</p>
          </div>
          <div className="auth-foot">Référentiel OHADA · SYCEBNL</div>
        </div>
        <div className="auth-box-wrap">
          <div className="auth-box">
            <div className="brand-mark" style={{ marginBottom: 25 }}>
              S+
            </div>
            <h2>Préparation de votre espace</h2>
            <p>Nous vérifions vos données enregistrées localement et dans le cloud.</p>
            <div className="progress">
              <span style={{ width: "65%" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                      className={`nav-item ${active === item.id ? "active" : ""}`}
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
              <div className="profile-name">{cloudUser ? cloudUser.email : "Espace local"}</div>
              <div className="profile-mode">{cloudUser ? "Compte privé" : "Cet appareil"}</div>
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
            {!cloudUser ? (
              <Button size="small" onClick={() => setCloudModal(true)}>
                <Cloud size={14} />
                Cloud
              </Button>
            ) : (
              <button
                className="btn ghost small"
                title="Déconnexion cloud"
                onClick={() => void logout()}
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </header>
        <div className="content">
          {syncState === "error" && cloudUser && (
            <div className="notice warning no-print" style={{ marginBottom: 15 }}>
              Synchronisation cloud indisponible. La copie locale reste enregistrée ; vérifiez les
              variables Vercel et la migration de base de données.
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
              className={active === id ? "active" : ""}
              key={id}
              onClick={() => setActive(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {cloudModal && (
        <CloudAccessModal onClose={() => setCloudModal(false)} onSuccess={connectCloud} />
      )}
      {syncState === "conflict" && (
        <Modal
          title="Versions différentes"
          subtitle="Une autre version cloud a changé depuis votre dernier chargement."
          onClose={() => {}}
        >
          <div className="notice warning">
            Aucune donnée n’a été écrasée. Choisissez la copie à garder. « Garder sur cet appareil »
            enverra cette version au compte cloud.
          </div>
          <div className="actions" style={{ marginTop: 15 }}>
            <Button onClick={() => void resolveConflict("remote")}>Charger la version cloud</Button>
            <Button variant="primary" onClick={() => void resolveConflict("local")}>
              Garder sur cet appareil
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
