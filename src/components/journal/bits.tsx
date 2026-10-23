import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageTitle({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-5">
      {eyebrow ? <p className="text-[11px] font-medium tracking-[0.22em] text-signal uppercase">{eyebrow}</p> : null}
      <h1 className="mt-1 font-display text-3xl tracking-tight">{title}</h1>
      {lede ? <p className="mt-2 text-sm leading-relaxed text-muted">{lede}</p> : null}
    </header>
  );
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "ghost" | "danger";
}) {
  return (
    <button
      type={type}
      className={cn(
        "press inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-medium disabled:opacity-40",
        variant === "primary" && "bg-brass text-brass-ink shadow-[0_10px_28px_-14px_rgba(231,194,122,0.95)]",
        variant === "quiet" && "bg-raised text-fg ring-1 ring-inset ring-line",
        variant === "ghost" && "bg-transparent text-fg ring-1 ring-inset ring-line",
        variant === "danger" && "bg-transparent text-clay ring-1 ring-inset ring-line",
        className,
      )}
      {...props}
    />
  );
}

export const controlClass =
  "h-12 w-full min-w-0 rounded-xl bg-raised px-3 text-base text-fg ring-1 ring-inset ring-line transition-shadow focus:ring-signal";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-relaxed text-faint">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input autoComplete="off" className={controlClass} {...props} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="min-h-24 w-full min-w-0 rounded-xl bg-raised px-3 py-3 text-base leading-relaxed text-fg ring-1 ring-inset ring-line focus:ring-signal"
      {...props}
    />
  );
}

export function Banner({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "clay" | "brass" | "moss";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-surface px-4 py-3 ring-1 ring-inset ring-line",
        tone === "clay" && "shadow-[inset_3px_0_0_0_var(--color-clay)]",
        tone === "brass" && "shadow-[inset_3px_0_0_0_var(--color-brass)]",
        tone === "moss" && "shadow-[inset_3px_0_0_0_var(--color-moss)]",
        tone === "neutral" && "shadow-[inset_3px_0_0_0_var(--color-signal)]",
      )}
    >
      {title ? (
        <p
          className={cn(
            "text-sm font-medium",
            tone === "clay" && "text-clay",
            tone === "brass" && "text-brass",
            tone === "moss" && "text-moss",
            tone === "neutral" && "text-fg",
          )}
        >
          {title}
        </p>
      ) : null}
      <div className={cn("text-sm leading-relaxed text-muted", title && "mt-1")}>{children}</div>
    </div>
  );
}

export function Chip({
  on,
  children,
  onClick,
}: {
  on?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press h-11 rounded-full px-3.5 text-sm ring-1 ring-inset",
        on ? "bg-brass text-brass-ink ring-brass" : "bg-raised text-fg ring-line",
      )}
    >
      {children}
    </button>
  );
}
