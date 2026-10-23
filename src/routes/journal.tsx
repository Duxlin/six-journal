import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Banner, Button, Field, PageTitle, TextArea, TextInput } from "@/components/journal/bits";
import { dayCounts, performance } from "@/lib/journal/engine";
import { formatDay, formatMoney, formatSignedMoney, formatWhen, localDate, pnlClass } from "@/lib/journal/format";
import { useJournal } from "@/lib/journal/store";
import { EMPTY_ANSWERS, type DailyAnswers, type Direction } from "@/lib/journal/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
});

const QUESTIONS: { key: keyof DailyAnswers; label: string }[] = [
  { key: "tookEvery", label: "Did I take every qualifying setup that my rules required, or did I miss any?" },
  { key: "tookBad", label: "Did I take any trade that did not qualify? Why?" },
  { key: "respected", label: "Did I respect the 1% risk cap and the planned 1:3 target?" },
  { key: "impulse", label: "Did I move my stop, close early, or chase price? Was it allowed?" },
  { key: "felt", label: "What did I feel before, during, and after the trade?" },
  { key: "improve", label: "What one process improvement will I apply next session?" },
];

function JournalPage() {
  const daily = useJournal((state) => state.daily);
  const [date, setDate] = useState(localDate());
  const dates = Array.from(new Set([date, ...daily.map((entry) => entry.date)])).sort().reverse();

  return (
    <div>
      <PageTitle
        eyebrow="End of day"
        title="Journal"
        lede="The first save locks that day's numbers. Later writing is kept as an amendment, not a rewrite."
      />
      <Field label="Day">
        <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      {dates.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {dates.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setDate(item)}
              className={cn(
                "press h-11 shrink-0 rounded-full px-3 text-sm ring-1 ring-inset",
                item === date ? "bg-brass text-brass-ink ring-brass" : "bg-raised text-fg ring-line",
              )}
            >
              {formatDay(item)}
            </button>
          ))}
        </div>
      ) : null}
      <DayForm key={date} date={date} />
      <MissedForm />
    </div>
  );
}

function DayForm({ date }: { date: string }) {
  const settings = useJournal((state) => state.settings);
  const trades = useJournal((state) => state.trades);
  const missed = useJournal((state) => state.missed);
  const daily = useJournal((state) => state.daily);
  const saveDaily = useJournal((state) => state.saveDaily);
  const existing = daily.find((entry) => entry.date === date);
  const live = dayCounts(date, trades, missed);
  const stats = performance(trades, missed, settings.startingBalance);

  const [emotions, setEmotions] = useState(existing?.emotions ?? "");
  const [missedNotes, setMissedNotes] = useState(existing?.missedNotes ?? "");
  const [lessons, setLessons] = useState(existing?.lessons ?? "");
  const [nextPlan, setNextPlan] = useState(existing?.nextPlan ?? "");
  const [answers, setAnswers] = useState<DailyAnswers>(existing?.answers ?? EMPTY_ANSWERS);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function onSave() {
    const result = saveDaily({
      date,
      emotions,
      missedNotes,
      lessons,
      nextPlan,
      answers,
      snapshot: {
        realisedBalance: stats.realisedBalance,
        floatingPnl: stats.floatingPnl,
        equity: stats.unmarkedOpen > 0 ? null : stats.equity,
        returnPct: stats.returnPct,
        dailyRealisedPnl: live.dailyRealisedPnl,
        setupsIdentified: live.setupsIdentified,
        qualifyingSetups: live.qualifyingSetups,
        tradesTaken: live.tradesTaken,
        missedSetups: live.missedSetups,
        ruleCompliancePct: stats.compliance,
        executionRatePct: stats.execution,
      },
    });
    if (!result.ok) {
      setSaved(false);
      setError(result.error);
      return;
    }
    setError("");
    setSaved(true);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-surface ring-1 ring-line px-3 py-3">
          <dt className="text-xs text-faint">Closed today</dt>
          <dd className={cn("nums mt-1 text-lg", pnlClass(live.dailyRealisedPnl))}>
            {formatSignedMoney(live.dailyRealisedPnl)}
          </dd>
        </div>
        <div className="rounded-2xl bg-surface ring-1 ring-line px-3 py-3">
          <dt className="text-xs text-faint">Realised balance</dt>
          <dd className="nums mt-1 text-lg">{formatMoney(stats.realisedBalance)}</dd>
        </div>
      </dl>
      <p className="text-sm leading-relaxed text-muted">
        {live.setupsIdentified} setups logged · {live.qualifyingSetups} passed the rules · {live.tradesTaken} filled ·{" "}
        {live.missedSetups} marked missed
      </p>
      {existing ? (
        <Banner tone="brass" title={`Snapshot locked ${formatWhen(existing.savedAt)}`}>
          Balance then was {formatMoney(existing.snapshot.realisedBalance)}. Day P/L was{" "}
          {formatSignedMoney(existing.snapshot.dailyRealisedPnl)}. Writing again does not change those figures.
        </Banner>
      ) : null}

      <Field label="State of mind">
        <TextArea value={emotions} onChange={(event) => setEmotions(event.target.value)} />
      </Field>
      {QUESTIONS.map((question) => (
        <Field key={question.key} label={question.label}>
          <TextArea
            value={answers[question.key]}
            onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })}
          />
        </Field>
      ))}
      <Field label="Missed setups">
        <TextArea value={missedNotes} onChange={(event) => setMissedNotes(event.target.value)} />
      </Field>
      <Field label="Lesson">
        <TextArea value={lessons} onChange={(event) => setLessons(event.target.value)} />
      </Field>
      <Field label="Next session">
        <TextArea value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} />
      </Field>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {saved ? <Banner tone="moss">Saved. The numbers from the first lock stay put.</Banner> : null}
      <Button onClick={onSave}>{existing ? "Save an amendment" : "Lock this day"}</Button>
      {existing && existing.amendments.length > 0 ? (
        <ul className="space-y-2">
          {existing.amendments.map((item) => (
            <li key={item.at} className="text-xs text-faint">
              {formatWhen(item.at)} · {item.summary}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MissedForm() {
  const missed = useJournal((state) => state.missed);
  const addMissed = useJournal((state) => state.addMissed);
  const [pair, setPair] = useState("");
  const [direction, setDirection] = useState<Direction | "UNSURE">("UNSURE");
  const [wasQualifying, setWasQualifying] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="font-display text-2xl tracking-tight">Missed setup</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Do not chase price. Record whether it truly qualified, and what caused the hesitation.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <Field label="Pair">
          <TextInput value={pair} onChange={(event) => setPair(event.target.value)} placeholder="XAUUSD" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {(["LONG", "SHORT", "UNSURE"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setDirection(item)}
              className={cn(
                "press h-11 rounded-full text-sm ring-1 ring-inset",
                direction === item ? "bg-brass text-brass-ink ring-brass" : "bg-raised text-fg ring-line",
              )}
            >
              {item === "LONG" ? "Long" : item === "SHORT" ? "Short" : "Unsure"}
            </button>
          ))}
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-snug">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-brass"
            checked={wasQualifying}
            onChange={(event) => setWasQualifying(event.target.checked)}
          />
          It met the written rules. I just did not take it.
        </label>
        <Field label="What stopped the entry">
          <TextArea value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Button
          variant="quiet"
          onClick={() => {
            if (reason.trim().length < 3 && pair.trim().length < 2) return;
            addMissed({ pair, direction, wasQualifying, reason });
            setPair("");
            setReason("");
            setWasQualifying(false);
            setDirection("UNSURE");
          }}
        >
          Record the miss
        </Button>
      </div>
      {missed.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {missed.slice(0, 8).map((item) => (
            <li key={item.id} className="rounded-2xl bg-surface ring-1 ring-line px-4 py-3 text-sm">
              <p className="text-xs text-faint">
                {formatDay(item.on)} · {item.pair} · {item.wasQualifying ? "qualified" : "not sure"}
              </p>
              <p className="mt-1 leading-relaxed">{item.reason || "No note."}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
