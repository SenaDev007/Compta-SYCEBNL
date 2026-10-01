"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createEmptyWorkspace, type Workspace } from "@/lib/accounting/types";
import { validateWorkspace } from "@/lib/accounting/validation";
import {
  createOfflineCipher,
  hasOfflineAccount,
  openOfflineAccount,
  saveOfflineWorkspace,
  type OfflineCipher,
  type OfflineLoginResult,
} from "@/lib/offline-vault";
import type { WorkspaceSetter } from "./shared";
import { AccountsView } from "./accounts";
import { CloudAccessPage, type CloudUser } from "./cloud-access";
import { BrandMark } from "./brand-mark";
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

type SyncState = "saving" | "synced" | "offline" | "error" | "conflict";
type RemoteWorkspace = { version: number; state: Workspace; updatedAt?: string };
type OfflineAccount = Extract<OfflineLoginResult, { status: "ok" }>;

const legacyUserKey = (id: string) => `compta-sycebnl.workspace.${id}`;

function readLegacyWorkspace(userId: string): Workspace | null {
  try {
    const raw = window.localStorage.getItem(legacyUserKey(userId));
    if (!raw) return null;
    const checked = validateWorkspace(JSON.parse(raw));
    return checked.success ? checked.data : null;
  } catch {
    return null;
  }
}

function clearLegacyWorkspace(userId: string) {
  try {
    window.localStorage.removeItem(legacyUserKey(userId));
  } catch {
    // L’ancienne copie pourra être retirée lors d’une connexion ultérieure.
  }
}

function checkedRemote(value: unknown): RemoteWorkspace {
  const remote = value as RemoteWorkspace;
  if (!Number.isSafeInteger(remote?.version) || remote.version < 0) {
    throw new Error("remote_workspace_invalid");
  }
  const checked = validateWorkspace(remote.state);
  if (!checked.success) throw new Error("remote_workspace_invalid");
  return { version: remote.version, state: checked.data, updatedAt: remote.updatedAt };
}

export function AppShell() {
  const [workspace, setRawWorkspace] = useState<Workspace>(() => createEmptyWorkspace());
  const [active, setActive] = useState("dashboard");
  const [year, setYear] = useState(new Date().getFullYear());
  const [toast, setToast] = useState("");
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const versionRef = useRef<number | null>(null);
  const lastSyncRef = useRef("");
  const syncInProgressRef = useRef(false);
  const offlineCipherRef = useRef<OfflineCipher | null>(null);
  const offlinePasswordRef = useRef("");
  const dirtyRef = useRef(false);
  const requiresConflictRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageWarningShown = useRef(false);
  const persistentStorageRequested = useRef(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
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

  const saveSnapshot = useCallback(
    async (
      user: CloudUser,
      snapshot: Workspace,
      version: number,
      dirty: boolean,
      cipher: OfflineCipher,
      requiresConflict = false,
    ) => {
      try {
        await saveOfflineWorkspace(user, snapshot, version, dirty, cipher, requiresConflict);
        setOfflineReady(true);
        storageWarningShown.current = false;
        if (!persistentStorageRequested.current && navigator.storage?.persist) {
          persistentStorageRequested.current = true;
          void navigator.storage.persist().catch(() => false);
        }
        return true;
      } catch {
        setOfflineReady(false);
        if (!storageWarningShown.current) {
          storageWarningShown.current = true;
          notify("La copie hors connexion n’a pas pu être actualisée sur cet appareil.");
        }
        return false;
      }
    },
    [notify],
  );

  const connectCloud = useCallback(
    async (user: CloudUser, password: string) => {
      const response = await fetch("/api/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("workspace_unavailable");
      const remote = checkedRemote(await response.json());
      const remoteSnapshot = JSON.stringify(remote.state);

      const cached = await openOfflineAccount(user.email, password);
      if (cached.status === "invalid" && (await hasOfflineAccount(user.email))) {
        // A changed password must never silently replace an older encrypted copy.
        offlineCipherRef.current = null;
        offlinePasswordRef.current = "";
        dirtyRef.current = false;
        requiresConflictRef.current = false;
        versionRef.current = remote.version;
        lastSyncRef.current = remoteSnapshot;
        setRawWorkspace(remote.state);
        setCloudUser(user);
        setOfflineMode(false);
        setOfflineReady(false);
        setSyncState("synced");
        setActive("dashboard");
        notify(
          "Le mot de passe de votre compte a changé depuis la dernière copie de cet appareil. Cette copie n’a pas été remplacée.",
        );
        return;
      }

      let cipher: OfflineCipher | null = cached.status === "ok" ? cached.cipher : null;
      if (!cipher) {
        try {
          cipher = await createOfflineCipher(password);
        } catch {
          cipher = null;
        }
      }

      let chosen = remote.state;
      let localDirty = false;
      let localVersion = remote.version;
      let conflict = false;
      if (cached.status === "ok" && cached.dirty) {
        chosen = cached.workspace;
        localDirty = true;
        localVersion = cached.version;
        conflict = cached.requiresConflict || cached.version !== remote.version;
      } else if (cached.status !== "ok") {
        const legacy = readLegacyWorkspace(user.id);
        const legacyDate = Date.parse(legacy?.updatedAt || "");
        const remoteDate = Date.parse(remote.state.updatedAt || remote.updatedAt || "");
        if (legacy && Number.isFinite(legacyDate) && legacyDate > remoteDate) {
          chosen = legacy;
          localDirty = true;
          conflict = true;
        }
      }

      offlineCipherRef.current = cipher;
      offlinePasswordRef.current = "";
      dirtyRef.current = localDirty;
      requiresConflictRef.current = conflict;
      versionRef.current = conflict ? localVersion : remote.version;
      lastSyncRef.current = remoteSnapshot;
      setRawWorkspace(chosen);
      setCloudUser(user);
      setOfflineMode(false);
      setOfflineReady(Boolean(cipher && cached.status === "ok"));
      setSyncState(conflict ? "conflict" : localDirty ? "saving" : "synced");
      setActive("dashboard");

      if (cipher) {
        const stored = await saveSnapshot(
          user,
          chosen,
          versionRef.current ?? remote.version,
          localDirty,
          cipher,
          conflict,
        );
        if (stored && cached.status !== "ok") {
          clearLegacyWorkspace(user.id);
          notify("Votre accès hors connexion est prêt sur cet appareil.");
        }
      } else {
        notify(
          "Votre espace est ouvert. La copie hors connexion n’est pas disponible sur cet appareil.",
        );
      }
    },
    [notify, saveSnapshot],
  );

  const enterOffline = useCallback((account: OfflineAccount, password: string) => {
    offlineCipherRef.current = account.cipher;
    offlinePasswordRef.current = password;
    dirtyRef.current = account.dirty;
    requiresConflictRef.current = account.requiresConflict;
    versionRef.current = account.version;
    lastSyncRef.current = account.dirty ? "" : JSON.stringify(account.workspace);
    setRawWorkspace(account.workspace);
    setCloudUser(account.user);
    setOfflineMode(true);
    setOfflineReady(true);
    setSyncState("offline");
    setActive("dashboard");
  }, []);

  const resumeConnection = useCallback(async () => {
    if (!cloudUser || syncInProgressRef.current || !navigator.onLine) return;
    syncInProgressRef.current = true;
    try {
      const savedPassword = offlinePasswordRef.current;
      if (savedPassword) {
        const login = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ email: cloudUser.email, password: savedPassword }),
        });
        if (!login.ok) {
          offlinePasswordRef.current = "";
          setSyncState("error");
          notify(
            "Votre espace reste accessible ici, mais la connexion au compte doit être rétablie. Déconnectez-vous puis reconnectez-vous.",
          );
          return;
        }
        offlinePasswordRef.current = "";
      }

      const response = await fetch("/api/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("workspace_unavailable");
      const remote = checkedRemote(await response.json());
      const remoteSnapshot = JSON.stringify(remote.state);

      if (
        dirtyRef.current &&
        (requiresConflictRef.current || remote.version !== versionRef.current)
      ) {
        lastSyncRef.current = remoteSnapshot;
        requiresConflictRef.current = true;
        setOfflineMode(false);
        setSyncState("conflict");
        const cipher = offlineCipherRef.current;
        if (cipher) {
          await saveSnapshot(
            cloudUser,
            workspace,
            versionRef.current ?? remote.version,
            true,
            cipher,
            true,
          );
        }
        return;
      }

      setOfflineMode(false);
      if (dirtyRef.current) {
        versionRef.current = remote.version;
        lastSyncRef.current = remoteSnapshot;
        requiresConflictRef.current = false;
        setSyncState("saving");
      } else {
        versionRef.current = remote.version;
        lastSyncRef.current = remoteSnapshot;
        setRawWorkspace(remote.state);
        setSyncState("synced");
        const cipher = offlineCipherRef.current;
        if (cipher)
          await saveSnapshot(cloudUser, remote.state, remote.version, false, cipher, false);
      }
    } catch {
      if (offlineCipherRef.current) {
        setOfflineMode(true);
        setSyncState("offline");
      } else {
        setSyncState("error");
      }
    } finally {
      syncInProgressRef.current = false;
      setRetryToken((value) => value + 1);
    }
  }, [cloudUser, workspace, saveSnapshot, notify]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => (navigator.onLine ? import("xlsx-js-style") : undefined))
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onOffline = () => {
      if (!cloudUser) return;
      if (offlineCipherRef.current) {
        setOfflineMode(true);
        setSyncState("offline");
      } else {
        setSyncState("error");
        notify("La copie hors connexion n’est pas prête sur cet appareil.");
      }
    };
    const onOnline = () => {
      if (cloudUser && offlineMode) void resumeConnection();
    };
    const onVisible = () => {
      if (!document.hidden && navigator.onLine && cloudUser && offlineMode) {
        void resumeConnection();
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cloudUser, offlineMode, resumeConnection, notify]);

  useEffect(() => {
    if (!cloudUser || !offlineMode || !navigator.onLine) return;
    const timer = window.setTimeout(() => void resumeConnection(), 0);
    return () => window.clearTimeout(timer);
  }, [cloudUser, offlineMode, resumeConnection]);

  useEffect(() => {
    if (!cloudUser) return;
    const serialized = JSON.stringify(workspace);
    const dirty = dirtyRef.current || serialized !== lastSyncRef.current;
    dirtyRef.current = dirty;
    const cipher = offlineCipherRef.current;
    const version = versionRef.current ?? 0;
    if (cipher) {
      void saveSnapshot(cloudUser, workspace, version, dirty, cipher, requiresConflictRef.current);
    }

    if (offlineMode || !navigator.onLine) {
      setSyncState("offline");
      return;
    }
    if (syncState === "conflict" || syncState === "error" || syncInProgressRef.current || !dirty) {
      return;
    }

    const timer = window.setTimeout(async () => {
      if (syncInProgressRef.current) return;
      syncInProgressRef.current = true;
      setSyncState("saving");
      try {
        const response = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ version: versionRef.current, state: workspace }),
        });
        if (response.status === 409) {
          dirtyRef.current = true;
          requiresConflictRef.current = true;
          setSyncState("conflict");
          if (cipher) {
            await saveSnapshot(cloudUser, workspace, version, true, cipher, true);
          }
          return;
        }
        if (!response.ok) throw new Error("workspace_save_failed");
        const result = (await response.json()) as { version: number };
        versionRef.current = result.version;
        lastSyncRef.current = serialized;
        dirtyRef.current = false;
        requiresConflictRef.current = false;
        setSyncState("synced");
        if (cipher) {
          await saveSnapshot(cloudUser, workspace, result.version, false, cipher, false);
        }
      } catch {
        if (!navigator.onLine && cipher) {
          setOfflineMode(true);
          setSyncState("offline");
        } else {
          setSyncState("error");
        }
      } finally {
        syncInProgressRef.current = false;
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [workspace, cloudUser, offlineMode, syncState, retryToken, saveSnapshot]);

  const logout = useCallback(async () => {
    const user = cloudUser;
    const cipher = offlineCipherRef.current;
    if (user && cipher) {
      const serialized = JSON.stringify(workspace);
      const dirty = dirtyRef.current || serialized !== lastSyncRef.current;
      await saveSnapshot(
        user,
        workspace,
        versionRef.current ?? 0,
        dirty,
        cipher,
        requiresConflictRef.current,
      );
    }
    if (navigator.onLine) {
      void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(
        () => undefined,
      );
    }
    setCloudUser(null);
    setRawWorkspace(createEmptyWorkspace());
    setOfflineMode(false);
    setSyncState("synced");
    setActive("dashboard");
    versionRef.current = null;
    lastSyncRef.current = "";
    dirtyRef.current = false;
    requiresConflictRef.current = false;
    offlinePasswordRef.current = "";
    offlineCipherRef.current = null;
    syncInProgressRef.current = false;
  }, [cloudUser, workspace, saveSnapshot]);

  const resolveConflict = useCallback(
    async (choice: "remote" | "local") => {
      if (!cloudUser || !navigator.onLine) {
        notify("Rétablissez votre connexion avant de comparer les deux versions.");
        return;
      }
      try {
        const remoteResponse = await fetch("/api/workspace", {
          credentials: "include",
          cache: "no-store",
        });
        if (!remoteResponse.ok) throw new Error("workspace_unavailable");
        const remote = checkedRemote(await remoteResponse.json());
        const remoteSnapshot = JSON.stringify(remote.state);
        const cipher = offlineCipherRef.current;
        requiresConflictRef.current = false;
        if (choice === "remote") {
          setRawWorkspace(remote.state);
          versionRef.current = remote.version;
          lastSyncRef.current = remoteSnapshot;
          dirtyRef.current = false;
          setSyncState("synced");
          if (cipher)
            await saveSnapshot(cloudUser, remote.state, remote.version, false, cipher, false);
          notify("La version du compte a été chargée.");
        } else {
          versionRef.current = remote.version;
          lastSyncRef.current = remoteSnapshot;
          dirtyRef.current = true;
          setSyncState("saving");
          if (cipher) {
            await saveSnapshot(cloudUser, workspace, remote.version, true, cipher, false);
          }
          setRetryToken((value) => value + 1);
          notify("Votre version est prête à être enregistrée.");
        }
      } catch {
        notify("Les versions n’ont pas pu être comparées. Réessayez dans quelques instants.");
      }
    },
    [cloudUser, workspace, notify, saveSnapshot],
  );

  if (!cloudUser) {
    return <CloudAccessPage onSuccess={connectCloud} onOfflineSuccess={enterOffline} />;
  }

  const title =
    active === "new-entry"
      ? "Journal des écritures"
      : navItems.find((item) => item.id === active)?.label || "Tableau de bord";
  const syncLabels: Record<SyncState, string> = {
    saving: "Enregistrement…",
    synced: "À jour",
    offline: "Hors connexion",
    error: "Connexion à rétablir",
    conflict: "Versions à comparer",
  };
  const statusClass =
    syncState === "error" || syncState === "conflict"
      ? "error"
      : syncState === "saving" || syncState === "offline"
        ? "warning"
        : "";
  const viewProps = { workspace, setWorkspace, year, notify };

  let content: ReactNode;
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
          cloudUser={cloudUser}
          cloudStatus={syncLabels[syncState]}
          offlineReady={offlineReady}
          offlineMode={offlineMode}
          onLogout={() => void logout()}
          onRetry={() => {
            setSyncState("saving");
            setRetryToken((value) => value + 1);
            void resumeConnection();
          }}
          notify={notify}
        />
      );
      break;
    default:
      content = <Dashboard {...viewProps} onNewEntry={() => setActive("new-entry")} />;
  }

  const mobileItems = ["dashboard", "journal", "projects", "reports", "data"];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark size={39} />
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
            <div className="avatar">{cloudUser.email.slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="profile-name">{cloudUser.email}</div>
              <div className="profile-mode">
                {offlineMode ? "Travail hors connexion" : "Compte connecté"}
              </div>
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
            <span
              className={`sync-status ${offlineMode ? "offline-status" : ""}`}
              title={syncLabels[syncState]}
            >
              {offlineMode && <WifiOff size={13} />}
              <i className={`sync-dot ${statusClass}`} />
              {syncLabels[syncState]}
            </span>
            <button
              className="btn ghost small"
              title="Se déconnecter"
              aria-label="Se déconnecter"
              onClick={() => void logout()}
            >
              <LogOut size={14} />
            </button>
          </div>
        </header>
        <div className="content">
          {syncState === "offline" && (
            <div className="notice warning no-print offline-banner" style={{ marginBottom: 15 }}>
              <span>
                Vous travaillez hors connexion. Vos changements sont conservés sur cet appareil et
                seront transmis dès le retour du réseau.
              </span>
              <div className="actions">
                <Button size="small" onClick={() => void resumeConnection()}>
                  Rétablir la connexion
                </Button>
                <Button size="small" onClick={() => void logout()}>
                  Se déconnecter
                </Button>
              </div>
            </div>
          )}
          {syncState === "error" && (
            <div className="notice warning no-print" style={{ marginBottom: 15 }}>
              <span>
                La dernière mise à jour n’a pas abouti. Vérifiez votre connexion puis réessayez.
              </span>
              <Button
                size="small"
                onClick={() => {
                  setSyncState(offlineMode ? "offline" : "saving");
                  if (offlineMode) void resumeConnection();
                  else setRetryToken((value) => value + 1);
                }}
              >
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
          subtitle="Votre espace a évolué depuis sa dernière mise à jour."
          onClose={() => {}}
        >
          <div className="notice warning">
            Aucune donnée n’a été remplacée. Choisissez la version que vous souhaitez conserver.
          </div>
          <div className="actions" style={{ marginTop: 15 }}>
            <Button onClick={() => void resolveConflict("remote")}>
              Conserver la version du compte
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
