import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { EquityChart } from "@/components/journal/equity-chart";
import { MetricBoard } from "@/components/journal/metrics";
import { Button } from "@/components/journal/bits";
import { cycleSample, maxPlannedRisk, performance } from "@/lib/journal/engine";
import {
  STATUS_LABEL,
  directionLabel,
  formatMoney,
  formatPct,
  formatSignedMoney,
  pnlClass,
} from "@/lib/journal/format";
import { useJournal } from "@/lib/journal/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Desk,
});

function Desk() {
  const settings = useJournal((state) => state.settings);
  const trades = useJournal((state) => state.trades);
  const missed = useJournal((state) => state.missed);
  const cycles = useJournal((state) => state.cycles);
  const stats = performance(trades, missed, settings.startingBalance);
  const cycle = [...cycles].reverse().find((item) => item.status !== "REVIEWED") ?? cycles[0];
  const sample = cycle ? cycleSample(trades, cycle.id) : null;
  const cap = maxPlannedRisk(settings.startingBalance, settings.maxRiskPercent);
  const fromOriginal =
    settings.originalAccountSize > 0
      ? (stats.realisedBalance - settings.originalAccountSize) / settings.originalAccountSize
      : null;
  const underOriginal = settings.originalAccountSize - stats.realisedBalance;
  const open = trades.filter((trade) => trade.status === "OPEN" || trade.status === "PENDING");
  const filled = sample?.count ?? 0;

  return (
    <div>
      <section className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-raised to-surface p-5 ring-1 ring-line">
        <div className="pointer-events-none absolute -top-16 right-0 size-40 rounded-full bg-signal/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-0 size-36 rounded-full bg-brass/15 blur-3xl" />
        <p className="text-[11px] font-medium tracking-[0.22em] text-signal uppercase">
          {cycle ? `Cycle ${cycle.index}` : "Cycle"}
          {cycle?.status === "REVIEW_REQUIRED" ? " · review" : ""}
        </p>
        <p className="mt-3 text-sm text-muted">Realised balance</p>
        <p className="nums font-display text-[2.6rem] leading-none tracking-tight">{formatMoney(stats.realisedBalance)}</p>
        <p className={cn("nums mt-3 text-sm", pnlClass(stats.realisedPnl))}>
          {formatSignedMoney(stats.realisedPnl)} · {formatPct(stats.returnPct)}
        </p>
        <p className="nums mt-1 text-sm text-muted">
          {underOriginal > 0.004
            ? `${formatMoney(underOriginal)} under ${formatMoney(settings.originalAccountSize)} · ${formatPct(fromOriginal)}`
            : underOriginal < -0.004
              ? `${formatMoney(Math.abs(underOriginal))} above ${formatMoney(settings.originalAccountSize)} · ${formatPct(fromOriginal)}`
              : `Level with ${formatMoney(settings.originalAccountSize)}`}
        </p>
      </section>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface px-3.5 py-3 ring-1 ring-line">
          <dt className="text-[11px] tracking-wide text-faint uppercase">Equity</dt>
          <dd className="nums mt-1 text-lg">{formatMoney(stats.equity)}</dd>
          {stats.unmarkedOpen > 0 ? (
            <p className="mt-1 text-xs text-faint">{stats.unmarkedOpen} open without a mark</p>
          ) : (
            <p className="nums mt-1 text-xs text-muted">Float {formatSignedMoney(stats.floatingPnl)}</p>
          )}
        </div>
        <div className="rounded-2xl bg-surface px-3.5 py-3 ring-1 ring-line">
          <dt className="text-[11px] tracking-wide text-faint uppercase">Open risk</dt>
          <dd className="nums mt-1 text-lg">{formatMoney(stats.openRisk)}</dd>
          <p className="mt-1 text-xs text-muted">Drawdown {formatMoney(stats.currentDrawdown)}</p>
        </div>
      </dl>

      <section className="mt-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm text-muted">The six</h2>
          <p className="nums text-sm text-fg">
            {filled} / {settings.cycleLength}
          </p>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: settings.cycleLength }, (_, index) => {
            const done = index < filled;
            const next = index === filled && filled < settings.cycleLength;
            return (
              <div key={index} className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "h-10 w-full rounded-lg",
                    done && "bg-brass shadow-[0_0_16px_-4px_rgba(231,194,122,0.9)]",
                    next && "slot-next bg-signal/30 ring-1 ring-signal/70",
                    !done && !next && "bg-raised",
                  )}
                />
                <span className={cn("nums text-[11px]", done ? "text-brass" : next ? "text-signal" : "text-faint")}>
                  {index + 1}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Risk cap {formatMoney(cap)}. Fixed at 1% of the start. It does not move after a win or a stop.
        </p>
        {cycle?.status === "REVIEW_REQUIRED" ? (
          <Link to="/cycle" className="mt-3 block text-sm text-brass">
            Six are in. Review the cycle.
          </Link>
        ) : null}
      </section>

      <div className="mt-3">
        <MetricBoard
          winRate={stats.winRate}
          wins={stats.wins}
          losses={stats.losses}
          flats={stats.flats}
          expectancy={stats.expectancy}
          compliance={stats.compliance}
          complianceNote={`${stats.complianceMet} of ${stats.complianceAssessed} closed trades`}
          execution={stats.execution}
          executionNote={`${stats.executed} taken of ${stats.identified} qualifying setups`}
          drawdownLabel={formatMoney(stats.maxDrawdown)}
          drawdownFill={settings.startingBalance > 0 ? Math.min(1, stats.maxDrawdown / settings.startingBalance) : 0}
        />
      </div>

      {stats.curve.length > 1 ? (
        <div className="mt-3 rounded-2xl bg-surface px-2 py-3 ring-1 ring-line">
          <p className="px-2 text-[11px] tracking-wide text-faint uppercase">Closed equity</p>
          <EquityChart points={stats.curve} />
        </div>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-2 text-sm text-muted">In play</h2>
        {open.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-4 text-sm leading-relaxed text-faint ring-1 ring-line">
            Nothing working and nothing open. A limit that has not filled does not change the balance.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((trade) => (
              <li key={trade.id}>
                <Link
                  to="/setups/$tradeId"
                  params={{ tradeId: trade.id }}
                  className="press flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 ring-1 ring-line"
                >
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-xl text-xs font-semibold",
                      trade.direction === "LONG" ? "bg-moss/15 text-moss" : "bg-clay/15 text-clay",
                    )}
                  >
                    {trade.direction === "LONG" ? "L" : "S"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{trade.pair}</span>
                      <span className="text-xs text-signal">{STATUS_LABEL[trade.status]}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {directionLabel(trade.direction)} · {formatMoney(trade.actualInitialRisk ?? trade.plannedCashRisk)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-5">
        <Link to="/setups/new">
          <Button>Log a setup</Button>
        </Link>
      </div>
      <p className="mt-5 text-xs leading-relaxed text-faint">
        A record of process, not a forecast and not financial advice. Six trades cannot prove an edge. A planned 1:3 is
        not a promise the win pays exactly 3R after costs.
      </p>
    </div>
  );
}
