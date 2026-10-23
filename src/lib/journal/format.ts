import { roundR } from "./engine.ts";
import type { CloseReason, Direction, TradeStatus } from "./types.ts";

export function localDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatSignedMoney(value: number, currency = "USD"): string {
  const abs = formatMoney(Math.abs(value), currency);
  if (value > 0.004) return `+${abs}`;
  if (value < -0.004) return `−${abs}`;
  return formatMoney(0, currency);
}

export function formatR(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = roundR(value);
  const body = Math.abs(rounded).toFixed(2);
  if (rounded > 0) return `+${body}R`;
  if (rounded < 0) return `−${body}R`;
  return "0.00R";
}

export function formatRr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `1:${value.toFixed(2)}`;
}

export function formatPct(value: number | null, signed = true): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const body = `${Math.abs(pct).toFixed(2)}%`;
  if (!signed) return `${Math.round(pct)}%`;
  if (pct > 0.004) return `+${body}`;
  if (pct < -0.004) return `−${body}`;
  return "0.00%";
}

export function formatPlainPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 50 ? 3 : 5;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatUnits(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}

export function pnlClass(value: number | null): string {
  if (value == null || Math.abs(value) < 0.005) return "text-fg";
  return value > 0 ? "text-moss" : "text-clay";
}

export const STATUS_LABEL: Record<TradeStatus, string> = {
  PLANNED: "Planned",
  VALIDATED: "Validated",
  PENDING: "Working",
  OPEN: "Open",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REVIEW_REQUIRED: "Needs review",
};

export const CLOSE_LABEL: Record<CloseReason, string> = {
  TAKE_PROFIT: "Take profit",
  STOP_LOSS: "Stop loss",
  BREAKEVEN: "Breakeven",
  MANUAL_PROFIT: "Manual profit",
  MANUAL_LOSS: "Manual loss",
  STRATEGY_INVALIDATION: "Setup invalidated",
  TRAILING_STOP: "Trailing stop",
  TIME_EXIT: "Time exit",
  OTHER: "Other",
};

export function directionLabel(direction: Direction): string {
  return direction === "LONG" ? "Long" : "Short";
}

export function ageLabel(iso?: string): string | null {
  if (!iso) return null;
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "just now";
  const mins = Math.round(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
