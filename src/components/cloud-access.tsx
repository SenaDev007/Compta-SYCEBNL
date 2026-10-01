"use client";
import { useState } from "react";
import { Button, Field, Modal } from "./ui";

export type CloudUser = { id: string; email: string };
export function CloudAccessModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: CloudUser, mergeGuest: boolean) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [merge, setMerge] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connexion impossible.");
      await onSuccess(data.user, mode === "register" && merge);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={mode === "login" ? "Connexion à votre espace cloud" : "Créer un compte cloud"}
      subtitle="Chaque compte dispose de son propre espace de travail privé."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Connexion…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </>
      }
    >
      <div className="tabs">
        <button
          className={`tab ${mode === "login" ? "active" : ""}`}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          Connexion
        </button>
        <button
          className={`tab ${mode === "register" ? "active" : ""}`}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          Créer un compte
        </button>
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <Field label="Adresse courriel">
          <input
            autoComplete="email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@organisation.org"
          />
        </Field>
        <Field
          label="Mot de passe"
          help={
            mode === "register" ? "10 caractères minimum. Conservez-le en lieu sûr." : undefined
          }
        >
          <input
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
          />
        </Field>
      </div>
      {mode === "register" && (
        <label
          style={{
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
            fontSize: 11,
            color: "#67756d",
            lineHeight: 1.5,
            marginTop: 14,
          }}
        >
          <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
          Transférer les données de cet appareil dans le nouvel espace cloud. Les données seront
          associées à ce compte.
        </label>
      )}
      {error && (
        <div className="notice error" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      <div className="notice" style={{ marginTop: 14 }}>
        Le compte cloud nécessite une base PostgreSQL et un secret d’application configurés par
        l’administrateur Vercel. En local, vos données restent dans ce navigateur.
      </div>
    </Modal>
  );
}
