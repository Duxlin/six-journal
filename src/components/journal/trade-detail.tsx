import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Banner, Button, Field, TextArea, TextInput } from "@/components/journal/bits";
import {
  closeMessage,
  distances,
  exitNeedsRuleCheck,
  filledQty,
  liveOnMark,
  performance,
  settle,
} from "@/lib/journal/engine";
import {
  CLOSE_LABEL,
  STATUS_LABEL,
  ageLabel,
  directionLabel,
  formatMoney,
  formatPrice,
  formatR,
  formatRr,
  formatSignedMoney,
  formatUnits,
  formatWhen,
  pnlClass,
} from "@/lib/journal/format";
import { useJournal } from "@/lib/journal/store";
import type { CloseReason, Trade } from "@/lib/journal/types";
import { cn } from "@/lib/utils";

const REASONS: CloseReason[] = [
  "TAKE_PROFIT",
  "STOP_LOSS",
  "BREAKEVEN",
  "MANUAL_PROFIT",
  "MANUAL_LOSS",
  "STRATEGY_INVALIDATION",
  "TRAILING_STOP",
  "TIME_EXIT",
  "OTHER",
];

function parseNum(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function suggestedExit(reason: CloseReason, trade: Trade): string {
  if (reason === "TAKE_PROFIT") return String(trade.takeProfit);
  if (reason === "STOP_LOSS") return String(trade.stopLoss);
  if (reason === "BREAKEVEN") return String(trade.avgFill ?? trade.entry);
  return "";
}

export function TradeDetail({ trade }: { trade: Trade }) {
  const settings = useJournal((state) => state.settings);
  const trades = useJournal((state) => state.trades);
  const missed = useJournal((state) => state.missed);
  const placeOrder = useJournal((state) => state.placeOrder);
  const confirmFill = useJournal((state) => state.confirmFill);
  const cancelWorking = useJournal((state) => state.cancelWorking);
  const discardSetup = useJournal((state) => state.discardSetup);
  const setMark = useJournal((state) => state.setMark);
  const amendProtection = useJournal((state) => state.amendProtection);
  const closeTrade = useJournal((state) => state.closeTrade);
  const reopenTrade = useJournal((state) => state.reopenTrade);
  const addNote = useJournal((state) => state.addNote);

  const [panel, setPanel] = useState<"fill" | "close" | "amend" | "reopen" | "note" | null>(null);
  const [error, setError] = useState("");
  const [fillPrice, setFillPrice] = useState(String(trade.entry));
  const [fillQty, setFillQty] = useState("");
  const [mark, setMarkInput] = useState(trade.markPrice != null ? String(trade.markPrice) : "");
  const [reason, setReason] = useState<CloseReason>("TAKE_PROFIT");
  const [exitPrice, setExitPrice] = useState(String(trade.takeProfit));
  const [costs, setCosts] = useState("0");
  const [note, setNote] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [stopDraft, setStopDraft] = useState(String(trade.stopLoss));
  const [targetDraft, setTargetDraft] = useState(String(trade.takeProfit));
  const [amendReason, setAmendReason] = useState("");
  const [amendAllowed, setAmendAllowed] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const stats = performance(trades, missed, settings.startingBalance);
  const live = liveOnMark(trade);
  const markAge = ageLabel(trade.markAt);
  const stale = trade.markAt != null && Date.now() - new Date(trade.markAt).getTime() > 30 * 60 * 1000;
  const remaining = Math.max(trade.units - filledQty(trade.fills), 0);
  const contract = trade.pointValue > 0 && trade.units > 0;
  const reference = trade.markPrice ?? trade.avgFill ?? trade.entry;
  const space = distances(trade.direction, reference, trade.stopLoss, trade.takeProfit);
  const needsRule = exitNeedsRuleCheck(reason);
  const exitN = parseNum(exitPrice);
  const costN = parseNum(costs) ?? 0;
  const preview =
    trade.avgFill != null && exitN != null
      ? settle({
          direction: trade.direction,
          fill: trade.avgFill,
          stop: trade.stopLoss,
          exit: exitN,
          units: contract ? filledQty(trade.fills) : 0,
          pointValue: trade.pointValue,
          statedRisk: trade.actualInitialRisk ?? trade.plannedCashRisk,
          costs: costN,
        })
      : null;
  const message =
    trade.status === "CLOSED" && trade.closeReason
      ? closeMessage(trade.closeReason, trade.realisedR ?? null, trade.costs)
      : preview
        ? closeMessage(reason, preview.realisedR, costN)
        : null;

  function fail(result: { ok: true } | { ok: false; error: string }) {
    if (!result.ok) setError(result.error);
    else {
      setError("");
      setPanel(null);
    }
  }

  const editable = ["PLANNED", "VALIDATED", "REVIEW_REQUIRED"].includes(trade.status);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="inline-flex h-7 items-center rounded-full bg-raised px-3 text-[11px] font-medium tracking-[0.16em] text-signal uppercase ring-1 ring-line">
          {STATUS_LABEL[trade.status]}
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">{trade.pair}</h1>
        <p className="mt-1 text-sm text-muted">
          {directionLabel(trade.direction)} · {trade.orderType.toLowerCase()} · {trade.timeframe} · {formatRr(trade.plannedRr)}
        </p>
      </div>

      {!trade.rulesPassed ? (
        <Banner tone="brass" title="Outside the six">
          This record changes the balance if it fills and closes. It does not count as one of the six test trades.
        </Banner>
      ) : null}
      {trade.disqualified && trade.disqualifyReason ? (
        <Banner tone="clay" title="Not a compliant test trade">
          {trade.disqualifyReason}
        </Banner>
      ) : null}
      {trade.status === "CLOSED" && message ? (
        <Banner tone={trade.closeReason === "STOP_LOSS" ? "clay" : trade.closeReason === "TAKE_PROFIT" ? "moss" : "neutral"} title={message.title}>
          {message.body}
          <p className={cn("nums mt-3 text-base", pnlClass(trade.netPnl ?? null))}>
            {formatSignedMoney(trade.netPnl ?? 0)} · {formatR(trade.realisedR ?? null)}
          </p>
          <p className="nums mt-1 text-fg">
            Realised balance {formatMoney(stats.realisedBalance)} · {stats.returnPct >= 0 ? "up" : "down"} from the journal start.
          </p>
        </Banner>
      ) : null}

      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface ring-1 ring-line px-3 py-3 text-sm">
        <div>
          <dt className="text-faint">Entry</dt>
          <dd className="nums">{formatPrice(trade.avgFill ?? trade.entry)}</dd>
        </div>
        <div>
          <dt className="text-faint">Stop</dt>
          <dd className="nums">{formatPrice(trade.stopLoss)}</dd>
        </div>
        <div>
          <dt className="text-faint">Target</dt>
          <dd className="nums">{formatPrice(trade.takeProfit)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted nums">
        Planned risk {formatMoney(trade.plannedCashRisk)}
        {trade.actualInitialRisk != null ? ` · risk now ${formatMoney(trade.actualInitialRisk)}` : ""}
        {contract ? ` · ${formatUnits(filledQty(trade.fills) || trade.units)} ${trade.unitLabel}` : ""}
      </p>
      {trade.rationale ? <p className="text-sm leading-relaxed">{trade.rationale}</p> : null}

      {trade.status === "PENDING" ? (
        <Banner title="Working, not filled">
          A price that touches the level does not open this trade. Confirm the fill only when the broker says you are in.
        </Banner>
      ) : null}

      {trade.status === "OPEN" ? (
        <section className="rounded-2xl bg-surface ring-1 ring-line px-4 py-4">
          <h2 className="text-sm text-muted">How it is going</h2>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Manual mark{markAge ? ` · ${markAge}` : ""}. This is not a live feed, and it does not close the trade.
            {stale ? " This mark is stale." : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <TextInput inputMode="decimal" value={mark} onChange={(event) => setMarkInput(event.target.value)} />
            <Button
              className="w-auto shrink-0 px-4"
              onClick={() => {
                const price = parseNum(mark);
                if (price == null) {
                  setError("Enter a mark price.");
                  return;
                }
                fail(setMark(trade.id, price));
              }}
            >
              Update
            </Button>
          </div>
          {live ? (
            <p className={cn("nums mt-3 text-lg", pnlClass(live.floating))}>
              {formatSignedMoney(live.floating)} · {formatR(live.r)}
            </p>
          ) : (
            <p className="mt-3 text-sm text-faint">No mark yet, so floating P/L stays blank.</p>
          )}
          <p className="nums mt-2 text-sm text-muted">
            To stop {formatPrice(space.toStop)} · to target {formatPrice(space.toTarget)}
          </p>
          {space.toStop < 0 ? (
            <p className="mt-2 text-sm text-clay">Price is through the stop on this mark. It stays open until you record the close.</p>
          ) : null}
          {space.toTarget < 0 ? (
            <p className="mt-2 text-sm text-moss">Price is through the target on this mark. It is not closed until you record it.</p>
          ) : null}
        </section>
      ) : null}

      {error ? <Banner tone="clay">{error}</Banner> : null}

      {editable ? (
        <div className="flex flex-col gap-2">
          {trade.orderType === "MARKET" ? (
            <Button onClick={() => setPanel(panel === "fill" ? null : "fill")}>Confirm the fill</Button>
          ) : (
            <Button onClick={() => fail(placeOrder(trade.id))}>Mark the order working</Button>
          )}
          <Link to="/setups/$tradeId/edit" params={{ tradeId: trade.id }} className="press inline-flex h-12 items-center justify-center rounded-xl bg-raised text-sm ring-1 ring-line">
            Edit the plan
          </Link>
          {confirmDiscard ? (
            <Button variant="danger" onClick={() => fail(discardSetup(trade.id))}>
              Confirm discard — this is not a loss
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
              Discard setup
            </Button>
          )}
        </div>
      ) : null}

      {trade.status === "PENDING" || (trade.status === "OPEN" && contract && remaining > 0.0001) ? (
        <div className="flex flex-col gap-2">
          <Button onClick={() => setPanel(panel === "fill" ? null : "fill")}>
            {trade.fills.length ? "Add a fill" : "Confirm fill"}
          </Button>
          {trade.status === "PENDING" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => fail(cancelWorking(trade.id, "CANCELLED"))}>
                Cancel
              </Button>
              <Button variant="ghost" onClick={() => fail(cancelWorking(trade.id, "EXPIRED"))}>
                Expired
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {trade.status === "OPEN" ? (
        <div className="flex flex-col gap-2">
          <Button onClick={() => setPanel(panel === "close" ? null : "close")}>Record the close</Button>
          <Button variant="ghost" onClick={() => setPanel(panel === "amend" ? null : "amend")}>
            Move stop or target
          </Button>
        </div>
      ) : null}

      {trade.status === "CLOSED" ? (
        <Button variant="ghost" onClick={() => setPanel(panel === "reopen" ? null : "reopen")}>
          Reopen with a reason
        </Button>
      ) : null}

      {panel === "fill" ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface ring-1 ring-line px-4 py-4">
          <h2 className="text-sm text-fg">Confirmed fill</h2>
          <Field label="Fill price">
            <TextInput inputMode="decimal" value={fillPrice} onChange={(event) => setFillPrice(event.target.value)} />
          </Field>
          {contract ? (
            <Field label={`Quantity (${trade.unitLabel})`} hint={remaining > 0 ? `${formatUnits(remaining)} still unfilled.` : undefined}>
              <TextInput
                inputMode="decimal"
                value={fillQty}
                placeholder={String(remaining || trade.units)}
                onChange={(event) => setFillQty(event.target.value)}
              />
            </Field>
          ) : null}
          <Button
            onClick={() => {
              const price = parseNum(fillPrice);
              if (price == null) {
                setError("Enter the fill price.");
                return;
              }
              const qty = contract ? parseNum(fillQty) ?? (remaining || trade.units) : null;
              fail(confirmFill(trade.id, price, qty));
            }}
          >
            Save fill
          </Button>
        </section>
      ) : null}

      {panel === "close" && trade.avgFill != null ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface ring-1 ring-line px-4 py-4">
          <h2 className="text-sm text-fg">Close</h2>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  "press h-11 rounded-full px-3 text-sm ring-1 ring-inset",
                  reason === item ? "bg-brass text-brass-ink ring-brass" : "bg-raised text-fg ring-line",
                )}
                onClick={() => {
                  setReason(item);
                  setExitPrice(suggestedExit(item, trade));
                  setAllowed(false);
                }}
              >
                {CLOSE_LABEL[item]}
              </button>
            ))}
          </div>
          <Field label="Exit price">
            <TextInput inputMode="decimal" value={exitPrice} onChange={(event) => setExitPrice(event.target.value)} />
          </Field>
          <Field label="Costs" hint="Spread, commission, swap. Subtracted from the result.">
            <TextInput inputMode="decimal" value={costs} onChange={(event) => setCosts(event.target.value)} />
          </Field>
          <Field label={needsRule ? "Why you closed" : "Note, if you want one"}>
            <TextArea value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {needsRule ? (
            <label className="flex min-h-11 items-start gap-3 text-sm leading-snug">
              <input type="checkbox" className="mt-1 size-5 accent-brass" checked={allowed} onChange={() => setAllowed((value) => !value)} />
              This exit is allowed by my written rules. Leave it unchecked and the money still counts, but the trade stays out of the six.
            </label>
          ) : null}
          {preview && message ? (
            <div>
              <p className="text-sm font-medium text-fg">{message.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{message.body}</p>
              <p className={cn("nums mt-2", pnlClass(preview.net))}>
                {formatSignedMoney(preview.net)} · {formatR(preview.realisedR)}
              </p>
              <p className="nums mt-1 text-sm text-muted">
                Balance would become {formatMoney(stats.realisedBalance + preview.net)}
              </p>
            </div>
          ) : null}
          <Button
            onClick={() => {
              if (exitN == null) {
                setError("Enter the exit price.");
                return;
              }
              fail(
                closeTrade(trade.id, {
                  reason,
                  exitPrice: exitN,
                  costs: costN,
                  note,
                  allowed: needsRule ? allowed : true,
                }),
              );
            }}
          >
            Record close
          </Button>
        </section>
      ) : null}

      {panel === "amend" ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface ring-1 ring-line px-4 py-4">
          <h2 className="text-sm text-fg">Amend protection</h2>
          <Field label="Stop">
            <TextInput inputMode="decimal" value={stopDraft} onChange={(event) => setStopDraft(event.target.value)} />
          </Field>
          <Field label="Target">
            <TextInput inputMode="decimal" value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} />
          </Field>
          <Field label="Reason">
            <TextArea value={amendReason} onChange={(event) => setAmendReason(event.target.value)} />
          </Field>
          <label className="flex min-h-11 items-start gap-3 text-sm leading-snug">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-brass"
              checked={amendAllowed}
              onChange={() => setAmendAllowed((value) => !value)}
            />
            My written rules allow this change. If not, the trade leaves the six.
          </label>
          <Button
            onClick={() => {
              const nextStop = parseNum(stopDraft);
              const nextTarget = parseNum(targetDraft);
              if (nextStop == null || nextTarget == null) {
                setError("Enter the new stop and target.");
                return;
              }
              fail(
                amendProtection(trade.id, {
                  stopLoss: nextStop,
                  takeProfit: nextTarget,
                  reason: amendReason,
                  allowed: amendAllowed,
                }),
              );
            }}
          >
            Save the change
          </Button>
        </section>
      ) : null}

      {panel === "reopen" ? (
        <section className="flex flex-col gap-3">
          <Field label="Why the recorded close was wrong">
            <TextArea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} />
          </Field>
          <Button variant="danger" onClick={() => fail(reopenTrade(trade.id, reopenReason))}>
            Reopen the trade
          </Button>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm text-muted">Checklist at entry</h2>
        <ul className="space-y-1 text-sm">
          {(
            [
              ["Strategy match", trade.checklist.strategyMatch],
              ["Confirmation", trade.checklist.confirmation],
              ["Stop valid", trade.checklist.stopValid],
              ["Size calculated", trade.checklist.sizeCalculated],
              ["Inside 1%", trade.checklist.riskWithinCap],
              ["Target is 3R", trade.checklist.targetIs3R],
              ["News checked", trade.checklist.newsChecked],
              ["Exit rules", trade.checklist.exitRulesKnown],
              ["Affordable", trade.checklist.affordability],
            ] as const
          ).map(([label, on]) => (
            <li key={label} className={on ? "text-fg" : "text-faint"}>
              {on ? "Yes" : "No"} · {label}
            </li>
          ))}
        </ul>
      </section>

      {trade.violations.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {trade.violations.map((item) => (
            <li key={item.code}>
              <Banner tone={item.severity === "block" ? "clay" : "brass"}>{item.message}</Banner>
            </li>
          ))}
        </ul>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm text-muted">Record</h2>
          <button type="button" className="text-sm text-brass" onClick={() => setPanel(panel === "note" ? null : "note")}>
            Add note
          </button>
        </div>
        {panel === "note" ? (
          <div className="mb-3 flex flex-col gap-2">
            <TextArea value={note} onChange={(event) => setNote(event.target.value)} />
            <Button variant="quiet" onClick={() => fail(addNote(trade.id, note))}>
              Save note
            </Button>
          </div>
        ) : null}
        <ol className="space-y-3">
          {[...trade.events].reverse().slice(0, 12).map((event) => (
            <li key={event.id} className="text-sm">
              <p className="text-xs text-faint">{formatWhen(event.at)}</p>
              <p className="leading-relaxed">{event.message}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
