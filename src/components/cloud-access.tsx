"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  BookOpen,
  Calculator,
  ChartNoAxesCombined,
  Coins,
  Download,
  FileChartColumnIncreasing,
  Landmark,
  LockKeyhole,
} from "lucide-react";
import { openOfflineAccount, type OfflineLoginResult } from "@/lib/offline-vault";
import { BrandMark } from "./brand-mark";
import { Button, Field } from "./ui";

export type CloudUser = { id: string; email: string };
type OfflineAccount = Extract<OfflineLoginResult, { status: "ok" }>;
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const subscribeToInstallState = () => () => undefined;
const getIosInstallState = () => {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;
};
const getServerInstallState = () => false;

type CloudAccessProps = {
  onSuccess: (user: CloudUser, password: string) => Promise<void>;
  onOfflineSuccess: (account: OfflineAccount, password: string) => Promise<void> | void;
};

const particles: CSSProperties[] = [
  { left: "10%", top: "20%", animationDelay: "-2s", animationDuration: "13s", width: 5, height: 5 },
  { left: "22%", top: "72%", animationDelay: "-8s", animationDuration: "16s", width: 4, height: 4 },
  { left: "37%", top: "15%", animationDelay: "-4s", animationDuration: "18s", width: 6, height: 6 },
  {
    left: "52%",
    top: "81%",
    animationDelay: "-11s",
    animationDuration: "17s",
    width: 4,
    height: 4,
  },
  { left: "67%", top: "23%", animationDelay: "-6s", animationDuration: "15s", width: 5, height: 5 },
  { left: "79%", top: "64%", animationDelay: "-1s", animationDuration: "19s", width: 6, height: 6 },
  { left: "90%", top: "35%", animationDelay: "-9s", animationDuration: "14s", width: 4, height: 4 },
  {
    left: "15%",
    top: "48%",
    animationDelay: "-12s",
    animationDuration: "20s",
    width: 3,
    height: 3,
  },
  { left: "45%", top: "42%", animationDelay: "-5s", animationDuration: "16s", width: 3, height: 3 },
  { left: "84%", top: "13%", animationDelay: "-7s", animationDuration: "18s", width: 4, height: 4 },
];

export function CloudAccessPage({ onSuccess, onOfflineSuccess }: CloudAccessProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState("");
  const isIos = useSyncExternalStore(
    subscribeToInstallState,
    getIosInstallState,
    getServerInstallState,
  );

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setInstallMessage("Compta SYCEBNL+ est installée sur cet appareil.");
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installApp = async () => {
    setInstallMessage("");
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted")
        setInstallMessage("Compta SYCEBNL+ est en cours d’installation.");
      setInstallPrompt(null);
      return;
    }
    setInstallMessage(
      isIos
        ? "Dans Safari, touchez Partager, puis « Sur l’écran d’accueil » pour installer l’application."
        : "Dans le menu de votre navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».",
    );
  };

  const tryOfflineLogin = async () => {
    const result = await openOfflineAccount(email, password);
    if (result.status !== "ok") {
      setError(
        result.status === "invalid"
          ? "Le mot de passe ne permet pas d’ouvrir la copie conservée sur cet appareil. Vérifiez-le ou reconnectez-vous à Internet."
          : "Aucune copie hors connexion n’est encore prête sur cet appareil. Connectez-vous à Internet et ouvrez votre espace une première fois.",
      );
      return false;
    }
    await onOfflineSuccess(result, password);
    setPassword("");
    setError("");
    return true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let response: Response;
      try {
        response = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ email, password }),
        });
      } catch {
        if (mode === "login") {
          await tryOfflineLogin();
          return;
        }
        throw new Error("Une connexion Internet est nécessaire pour créer un compte.");
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) {
        if (mode === "login" && response.status >= 500) {
          await tryOfflineLogin();
          return;
        }
        throw new Error(
          data.error ||
            (mode === "register"
              ? "La création du compte n’a pas abouti. Réessayez dans quelques instants."
              : "Adresse courriel ou mot de passe incorrect."),
        );
      }

      const user = data.user as CloudUser;
      if (mode === "login") {
        try {
          await onSuccess(user, password);
        } catch {
          await tryOfflineLogin();
          return;
        }
      } else {
        await onSuccess(user, password);
      }
      setPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Accès impossible pour le moment. Réessayez dans quelques instants.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-scene" aria-hidden="true">
        {particles.map((style, index) => (
          <i className="finance-particle" key={index} style={style} />
        ))}
        <span className="finance-orbit orbit-one" />
        <span className="finance-orbit orbit-two" />
        <span className="finance-icon finance-icon-book">
          <BookOpen />
        </span>
        <span className="finance-icon finance-icon-chart">
          <ChartNoAxesCombined />
        </span>
        <span className="finance-icon finance-icon-coins">
          <Coins />
        </span>
        <span className="finance-icon finance-icon-calc">
          <Calculator />
        </span>
        <span className="finance-icon finance-icon-bank">
          <Landmark />
        </span>
      </div>

      <aside className="auth-visual">
        <div className="auth-topline">
          <div className="auth-brand-lockup">
            <BrandMark size={54} priority />
            <div>
              <div className="brand-title">Compta SYCEBNL+</div>
              <div className="brand-sub">Gestion comptable associative</div>
            </div>
          </div>
          <button className="install-app-button" type="button" onClick={() => void installApp()}>
            <Download size={15} /> Installer l’application
          </button>
        </div>

        <div className="auth-hero-copy">
          <div className="auth-eyebrow">
            <span /> UNE GESTION QUI FAIT AVANCER VOS PROJETS
          </div>
          <h1>
            La clarté dans vos comptes. <em>La confiance dans vos projets.</em>
          </h1>
          <p>
            Un espace simple pour suivre vos écritures, vos budgets et l’impact de vos actions, au
            même endroit.
          </p>
          <div className="auth-feature-row">
            <div className="auth-feature">
              <BookOpen />
              <span>Comptes bien tenus</span>
            </div>
            <div className="auth-feature">
              <FileChartColumnIncreasing />
              <span>Budgets maîtrisés</span>
            </div>
            <div className="auth-feature">
              <LockKeyhole />
              <span>Espace privé</span>
            </div>
          </div>
        </div>

        <div className="auth-foot">
          <span>Comptabilité associative · Projets · États financiers</span>
          <span className="auth-foot-mark">
            <ArrowUpRight size={15} /> Conçu pour avancer avec confiance
          </span>
        </div>
      </aside>

      <main className="auth-box-wrap">
        <section className="auth-box auth-card" aria-labelledby="access-title">
          <div className="auth-card-brand">
            <BrandMark size={39} />
            <span>Votre espace, vos comptes.</span>
          </div>
          <div className="auth-mobile-install">
            <button
              className="install-app-button light"
              type="button"
              onClick={() => void installApp()}
            >
              <Download size={15} /> Installer l’application
            </button>
          </div>
          <h2 id="access-title">
            {mode === "login" ? "Retrouvez votre espace" : "Créez votre espace comptable"}
          </h2>
          <p>
            {mode === "login"
              ? "Connectez-vous pour consulter et gérer vos données comptables."
              : "Créez votre compte pour commencer à organiser votre comptabilité."}
          </p>
          <div className="tabs" role="tablist" aria-label="Accès au compte">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Connexion
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`tab ${mode === "register" ? "active" : ""}`}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Créer un compte
            </button>
          </div>
          <form onSubmit={(event) => void submit(event)}>
            <div className="form-grid auth-form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Adresse courriel">
                <input
                  autoComplete="email"
                  className="input"
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ex. contact@association.org"
                />
              </Field>
              <Field
                label="Mot de passe"
                help={mode === "register" ? "10 caractères minimum." : undefined}
              >
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="input"
                  type="password"
                  required
                  minLength={mode === "register" ? 10 : 1}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Saisissez votre mot de passe"
                />
              </Field>
            </div>
            {error && (
              <div className="notice error auth-error" role="alert">
                {error}
              </div>
            )}
            <Button variant="primary" disabled={busy} className="auth-submit">
              {busy ? "Vérification…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
            </Button>
          </form>
          <div className="auth-offline-note">
            <span className="auth-note-dot" />
            <p>
              Après votre première connexion en ligne, vous pourrez retrouver votre espace hors
              connexion sur cet appareil.
            </p>
          </div>
          {installMessage && (
            <div className="notice auth-install-message" role="status">
              {installMessage}
            </div>
          )}
          <div className="auth-privacy-line">
            Vos informations comptables restent dans votre espace privé.
          </div>
        </section>
      </main>
    </div>
  );
}
