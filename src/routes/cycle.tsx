import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Banner, Button, Field, PageTitle, TextArea } from "@/components/journal/bits";
import { MetricBoard } from "@/components/journal/metrics";
import { cycleSample } from "@/lib/journal/engine";
import { formatMoney, formatR, formatSignedMoney, pnlClass } from "@/lib/journal/format";
import { useJournal } from "@/lib/journal/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cycle")({
  component: CyclePage,
});

function CyclePage() {
  const settings = useJournal((state) => state.settings);
  const trades = useJournal((state) => state.trades);
  const cycles = useJournal((state) => state.cycles);
  const reviewCycle = useJournal((state) => state.reviewCycle);
  const current = [...cycles].reverse().find((cycle) => cycle.status !== "REVIEWED") ?? cycles[0];
  const sample = current ? cycleSample(trades, current.id) : null;
  const past = cycles.filter((cycle) => cycle.status === "REVIEWED");
  const [notes, setNotes] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      <PageTitle
        eyebrow={current ? `Cycle ${current.index}` : "Cycle"}
        title="The six"
        lede="Only a filled trade that passed the rules, stayed inside 1% and 1:3, and was closed by the plan counts. Six is a process check, not proof of an edge."
      />

      {current && sample ? (
        <>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: settings.cycleLength }, (_, index) => {
              const done = index < sample.count;
              const next = index === sample.count && sample.count < settings.cycleLength;
              return (
                <div
                  key={index}
                  className={cn(
                    "h-12 rounded-lg",
                    done && "bg-brass shadow-[0_0_16px_-4px_rgba(231,194,122,0.9)]",
                    next && "slot-next bg-signal/30 ring-1 ring-signal/70",
                    !done && !next && "bg-raised",
                  )}
                />
              );
            })}
          </div>
          <p className="nums mt-3 text-sm">
            {sample.count} of {settings.cycleLength} qualifying closes
          </p>
          <div className="mt-4">
            <MetricBoard
              kicker="Qualifying"
              winRate={sample.winRate}
              wins={sample.wins}
              losses={sample.losses}
              flats={sample.flats}
              expectancy={sample.expectancy}
              compliance={sample.compliance}
              complianceNote={`${sample.closed.length} closed in this cycle`}
            />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Stat label="Net on the six" value={formatSignedMoney(sample.netPnl)} className={pnlClass(sample.netPnl)} />
            <Stat label="Total R" value={formatR(sample.count ? sample.totalR : null)} />
          </dl>

          <h2 className="mt-6 text-sm text-muted">Counting</h2>
          <TradeLines ids={sample.qualifying.map((trade) => trade.id)} empty="None yet. A cancelled limit will not appear here." />

          <h2 className="mt-6 text-sm text-muted">Closed, but not in the six</h2>
          <TradeLines
            ids={sample.closed.filter((trade) => !sample.qualifying.some((item) => item.id === trade.id)).map((trade) => trade.id)}
            empty="No excluded closes in this cycle."
          />

          {current.status === "REVIEW_REQUIRED" ? (
            <div className="mt-6 flex flex-col gap-3">
              <Banner tone="brass" title="Cycle complete">
                Six qualifying trades are recorded. Review the sample, the costs, the results in R, and whether you followed the rules before you test anything else. Six trades are not enough to prove long-term profitability.
              </Banner>
              <Field label="What did these six show?">
                <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>
              <label className="flex min-h-11 items-start gap-3 text-sm leading-snug">
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-brass"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                />
                I reviewed the sample. I am not raising risk because of it.
              </label>
              {error ? <Banner tone="clay">{error}</Banner> : null}
              <Button
                disabled={!checked}
                onClick={() => {
                  const result = reviewCycle(notes);
                  if (!result.ok) setError(result.error);
                  else setError("");
                }}
              >
                Archive and start the next cycle
              </Button>
            </div>
          ) : (
            <p className="mt-6 text-sm leading-relaxed text-faint">
              The next cycle stays locked until six qualifying closes are in and you write the review.
            </p>
          )}
        </>
      ) : null}

      {past.length > 0 ? (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="font-display text-2xl tracking-tight">Archived</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {past
              .slice()
              .reverse()
              .map((cycle) => (
                <li key={cycle.id} className="rounded-2xl bg-surface ring-1 ring-line px-4 py-3">
                  <p className="text-sm text-muted">Cycle {cycle.index}</p>
                  <p className={cn("nums mt-1", pnlClass(cycle.snapshot?.netPnl ?? 0))}>
                    {formatSignedMoney(cycle.snapshot?.netPnl ?? 0)} · {formatR(cycle.snapshot?.totalR ?? null)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">{cycle.reviewNotes}</p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl bg-surface ring-1 ring-line px-3 py-3">
      <p className="text-xs text-faint">{label}</p>
      <p className={cn("nums mt-1 text-lg", className)}>{value}</p>
    </div>
  );
}

function TradeLines({ ids, empty }: { ids: string[]; empty: string }) {
  const trades = useJournal((state) => state.trades);
  const rows = ids
    .map((id) => trades.find((trade) => trade.id === id))
    .filter((trade) => trade != null);
  if (rows.length === 0) return <p className="mt-2 text-sm text-faint">{empty}</p>;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {rows.map((trade) => (
        <li key={trade.id}>
          <Link to="/setups/$tradeId" params={{ tradeId: trade.id }} className="block rounded-2xl bg-surface ring-1 ring-line px-4 py-3">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{trade.pair}</span>
              <span className={cn("nums text-sm", pnlClass(trade.netPnl ?? null))}>{formatR(trade.realisedR ?? null)}</span>
            </span>
            <span className="mt-1 block text-sm text-muted">
              {formatSignedMoney(trade.netPnl ?? 0)}
              {trade.disqualified ? " · rule break" : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
