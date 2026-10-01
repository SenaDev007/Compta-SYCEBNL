"use client";
import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { X } from "lucide-react";

export function Button({
  children,
  variant = "default",
  size,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "small";
}) {
  return (
    <button {...props} className={`btn ${variant} ${size || ""} ${className}`.trim()}>
      {children}
    </button>
  );
}
export function Panel({
  title,
  caption,
  action,
  children,
  className = "",
}: {
  title?: string;
  caption?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        {title || caption ? (
          <div>
            <div className="panel-title">{title}</div>
            {caption && <div className="panel-caption">{caption}</div>}
          </div>
        ) : (
          <span />
        )}
        {action}
      </div>
      {children}
    </section>
  );
}
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value num">{value}</div>
      <div className="stat-meta">{hint}</div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal"
        style={wide ? { width: "min(820px,100%)" } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="btn ghost small" aria-label="Fermer" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </section>
    </div>
  );
}
export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const controlElement = isValidElement<{ id?: string }>(children) ? children : null;
  const controlId = controlElement?.props.id ?? generatedId;
  const control = controlElement ? cloneElement(controlElement, { id: controlId }) : children;
  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      {control}
      {help && <small>{help}</small>}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
