import { formatPlainPct, formatR } from "@/lib/journal/format";
import { cn } from "@/lib/utils";

export function MetricBoard({
  kicker = "All closes",
  winRate,
  wins,
  losses,
  flats,
  expectancy,
  compliance,
  complianceNote,
  execution,
  executionNote,
  drawdownLabel,
  drawdownFill,
}: {
  kicker?: string;
  winRate: number | null;
  wins: number;
  losses: number;
  flats: number;
  expectancy: number | null;
  compliance: number | null;
  complianceNote: string;
  execution?: number | null;
  executionNote?: string;
  drawdownLabel?: string;
  drawdownFill?: number;
}) {
  const closed = wins + losses + flats;
  return (
    <section className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-b from-raised to-surface p-4 ring-1 ring-line">
      <div className="pointer-events-none absolute -top-20 left-1/2 size-48 -translate-x-1/2 rounded-full bg-signal/10 blur-3xl" />
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium tracking-[0.22em] text-signal uppercase">Metrics</h2>
        <p className="nums text-xs text-faint">
          {kicker} · {closed}
        </p>
      </div>

      <div className="relative mt-2 flex justify-center">
        <WinDial rate={winRate} />
      </div>

      <div className="mt-1 grid grid-cols-3 gap-2">
        <Count label="Wins" value={wins} tone="moss" />
        <Count label="Flat" value={flats} tone="brass" />
        <Count label="Stops" value={losses} tone="clay" />
      </div>

      <SplitBar wins={wins} flats={flats} losses={losses} />

      <div className="mt-4 flex flex-col gap-3">
        <Meter label="Rules kept" value={compliance} note={complianceNote} />
        {execution !== undefined ? (
          <Meter label="Execution" value={execution ?? null} note={executionNote ?? ""} />
        ) : null}
        <Meter
          label="Expectancy"
          value={expectancyFill(expectancy)}
          display={expectancy == null ? "—" : formatR(expectancy)}
          note="per rated close"
          tone={expectancy != null && expectancy < 0 ? "clay" : "brass"}
        />
        {drawdownLabel != null && drawdownFill != null ? (
          <Meter label="Max drawdown" value={drawdownFill} display={drawdownLabel} note="from the equity peak" tone="clay" />
        ) : null}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-faint">
        Win rate is green closes divided by all closes. A 1:3 test can still be ahead with a rate under 50%. Six trades are not an edge.
      </p>
    </section>
  );
}

function WinDial({ rate }: { rate: number | null }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const amount = rate == null ? 0 : Math.max(0, Math.min(1, rate));
  const shown = rate == null ? "—" : formatPlainPct(rate);
  return (
    <div className="relative grid size-44 place-items-center">
      <svg viewBox="0 0 160 160" className="size-44" aria-hidden="true">
        <circle cx="80" cy="80" r="72" fill="none" stroke="var(--color-line)" strokeWidth="1.5" strokeDasharray="1.4 7" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-raised)" strokeWidth="10" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * amount} ${c}`}
          transform="rotate(-90 80 80)"
          style={{ filter: amount > 0 ? "drop-shadow(0 0 8px rgba(126,224,255,0.75))" : undefined }}
        />
        <circle cx="80" cy="18" r="2.2" fill="var(--color-brass)" />
      </svg>
      <div className="absolute text-center">
        <p className="nums font-display text-4xl leading-none tracking-tight">{shown}</p>
        <p className="mt-1 text-[10px] font-medium tracking-[0.2em] text-muted uppercase">Win rate</p>
      </div>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: "moss" | "brass" | "clay" }) {
  return (
    <div className="rounded-xl bg-bg/50 px-2 py-2 text-center ring-1 ring-line">
      <p className={cn("nums text-lg leading-none", tone === "moss" && "text-moss", tone === "brass" && "text-brass", tone === "clay" && "text-clay")}>
        {value}
      </p>
      <p className="mt-1 text-[10px] tracking-wide text-faint uppercase">{label}</p>
    </div>
  );
}

function SplitBar({ wins, flats, losses }: { wins: number; flats: number; losses: number }) {
  const total = wins + flats + losses;
  if (total === 0) {
    return <div className="mt-3 h-2 rounded-full bg-bg/70 ring-1 ring-line" />;
  }
  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-bg/70 ring-1 ring-line">
      {wins > 0 ? <span className="bg-moss" style={{ width: `${(wins / total) * 100}%` }} /> : null}
      {flats > 0 ? <span className="bg-brass" style={{ width: `${(flats / total) * 100}%` }} /> : null}
      {losses > 0 ? <span className="bg-clay" style={{ width: `${(losses / total) * 100}%` }} /> : null}
    </div>
  );
}

function Meter({
  label,
  value,
  note,
  display,
  tone = "signal",
}: {
  label: string;
  value: number | null;
  note: string;
  display?: string;
  tone?: "signal" | "brass" | "clay";
}) {
  const amount = value == null ? 0 : Math.max(0, Math.min(1, value));
  const text = display ?? (value == null ? "—" : formatPlainPct(value));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted">{label}</p>
        <p className="nums text-sm">{text}</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg/70 ring-1 ring-inset ring-line">
        {amount > 0 ? (
          <div
            className={cn(
              "h-full rounded-full",
              tone === "signal" && "bg-signal shadow-[0_0_12px_rgba(126,224,255,0.7)]",
              tone === "brass" && "bg-brass shadow-[0_0_12px_rgba(231,194,122,0.55)]",
              tone === "clay" && "bg-clay",
            )}
            style={{ width: `${amount * 100}%` }}
          />
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-faint">{note}</p>
    </div>
  );
}

function expectancyFill(value: number | null): number | null {
  if (value == null) return null;
  return Math.max(0, Math.min(1, (value + 1) / 4));
}
