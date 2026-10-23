import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button, PageTitle } from "@/components/journal/bits";
import { STATUS_LABEL, directionLabel, formatR, formatRr, pnlClass } from "@/lib/journal/format";
import { useJournal } from "@/lib/journal/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/setups/")({
  component: TradeList,
});

const FILTERS = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "closed", label: "Closed" },
  { id: "out", label: "Outside" },
] as const;

function TradeList() {
  const trades = useJournal((state) => state.trades);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = trades.filter((trade) => {
    if (filter === "live") return trade.status === "PENDING" || trade.status === "OPEN";
    if (filter === "closed") return trade.status === "CLOSED";
    if (filter === "out") return !trade.rulesPassed || trade.disqualified || trade.status === "REVIEW_REQUIRED";
    return trade.status !== "CANCELLED" && trade.status !== "EXPIRED";
  });

  return (
    <div>
      <PageTitle eyebrow="Setups" title="Trades" lede="Planned, working, open, then closed. A cancelled order is not a loss." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "press h-11 shrink-0 rounded-full px-4 text-sm ring-1 ring-inset",
              filter === item.id ? "bg-brass text-brass-ink ring-brass" : "bg-raised text-fg ring-line",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-4 text-sm leading-relaxed text-muted ring-1 ring-line">
          Nothing in this view. Log the pair, the direction, the stop, and whether the target is actually 1:3.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((trade) => (
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
                    <span className={cn("nums text-sm", trade.status === "CLOSED" ? pnlClass(trade.netPnl ?? null) : "text-signal")}>
                      {trade.status === "CLOSED" ? formatR(trade.realisedR ?? null) : STATUS_LABEL[trade.status]}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {directionLabel(trade.direction)} · {trade.timeframe} · {formatRr(trade.plannedRr)}
                    {!trade.rulesPassed || trade.disqualified ? " · outside" : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5">
        <Link to="/setups/new">
          <Button>Log a setup</Button>
        </Link>
      </div>
    </div>
  );
}
