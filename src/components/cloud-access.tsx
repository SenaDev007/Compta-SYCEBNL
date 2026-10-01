"use client";

import { useState, type FormEvent } from "react";
import { Button, Field } from "./ui";

export type CloudUser = { id: string; email: string };

export function CloudAccessPage({ onSuccess }: { onSuccess: (user: CloudUser) => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.user) {
        throw new Error(
          data.error || "Accès impossible pour le moment. Vérifiez vos informations.",
        );
      }
      await onSuccess(data.user as CloudUser);
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
      <aside className="auth-visual">
        <div className="brand">
          <div className="brand-mark">S+</div>
          <div>
            <div className="brand-title">Compta SYCEBNL+</div>
            <div className="brand-sub">Gestion comptable associative</div>
          </div>
        </div>
        <div className="auth-quote">
          <h1>Une comptabilité au service de vos projets.</h1>
          <p>Un espace privé pour vos écritures, vos projets et vos états financiers.</p>
        </div>
        <div className="auth-foot">Comptabilité · Projets · États financiers</div>
      </aside>
      <main className="auth-box-wrap">
        <section className="auth-box" aria-labelledby="access-title">
          <div className="brand-mark" style={{ marginBottom: 25 }}>
            S+
          </div>
          <h2 id="access-title">
            {mode === "login" ? "Connectez-vous à votre espace" : "Créez votre espace comptable"}
          </h2>
          <p>Connectez-vous ou créez un compte pour accéder à vos données.</p>
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
            <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Adresse courriel">
                <input
                  autoComplete="email"
                  className="input"
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nom@organisation.org"
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
              <div className="notice error" role="alert" style={{ marginTop: 14 }}>
                {error}
              </div>
            )}
            <Button variant="primary" disabled={busy} className="auth-submit">
              {busy ? "Vérification…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
            </Button>
          </form>
          <div className="notice" style={{ marginTop: 18 }}>
            Vous devez être connecté pour consulter votre comptabilité. Chaque compte possède son
            propre espace privé.
          </div>
        </section>
      </main>
    </div>
  );
}
