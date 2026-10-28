import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Banner, Button, Field, PageTitle, TextArea, TextInput } from "@/components/journal/bits";
import { maxPlannedRisk } from "@/lib/journal/engine";
import { signOut } from "@/lib/accounts";
import { formatMoney } from "@/lib/journal/format";
import { backupPayload, initialData, parseBackup, useJournal } from "@/lib/journal/store";
import type { NewsRuleMode, Trade } from "@/lib/journal/types";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tradesCsv(trades: Trade[]): string {
  const header = [
    "id",
    "pair",
    "direction",
    "order",
    "timeframe",
    "status",
    "entry",
    "stop",
    "target",
    "plannedRisk",
    "actualRisk",
    "plannedRr",
    "avgFill",
    "exit",
    "closeReason",
    "costs",
    "netPnl",
    "realisedR",
    "official",
    "disqualified",
  ];
  const lines = trades.map((trade) =>
    [
      trade.id,
      trade.pair,
      trade.direction,
      trade.orderType,
      trade.timeframe,
      trade.status,
      trade.entry,
      trade.stopLoss,
      trade.takeProfit,
      trade.plannedCashRisk,
      trade.actualInitialRisk ?? "",
      trade.plannedRr,
      trade.avgFill ?? "",
      trade.exitPrice ?? "",
      trade.closeReason ?? "",
      trade.costs,
      trade.netPnl ?? "",
      trade.realisedR ?? "",
      trade.rulesPassed ? "yes" : "no",
      trade.disqualified ? "yes" : "no",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function SettingsPage() {
  const settings = useJournal((state) => state.settings);
  const trades = useJournal((state) => state.trades);
  const cycles = useJournal((state) => state.cycles);
  const daily = useJournal((state) => state.daily);
  const missed = useJournal((state) => state.missed);
  const updateSettings = useJournal((state) => state.updateSettings);
  const replaceAll = useJournal((state) => state.replaceAll);
  const resetJournal = useJournal((state) => state.resetJournal);

  const [start, setStart] = useState(settings.startingBalance > 0 ? String(settings.startingBalance) : "");
  const [original, setOriginal] = useState(settings.originalAccountSize > 0 ? String(settings.originalAccountSize) : "");
  const [notes, setNotes] = useState(settings.noTradeNotes);
  const [news, setNews] = useState<NewsRuleMode>(settings.newsRuleMode);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"moss" | "clay" | "brass">("moss");
  const [resetText, setResetText] = useState("");

  const startN = Number(start);
  const originalN = Number(original);
  const cap = Number.isFinite(startN) ? maxPlannedRisk(startN, settings.maxRiskPercent) : 0;

  function saveAccount() {
    if (!(startN > 0) || !(originalN > 0)) {
      setTone("clay");
      setMessage("Both balances have to be above zero.");
      return;
    }
    updateSettings({
      startingBalance: startN,
      originalAccountSize: originalN,
      noTradeNotes: notes,
      newsRuleMode: news,
      configured: true,
    });
    setTone("moss");
    setMessage("Saved. Past trades keep the risk cap they were planned with. The balance shown is this start plus closed results.");
  }

  return (
    <div>
      <PageTitle
        eyebrow="Account"
        title="Settings"
        lede="The journal starts at the balance you are actually at. The original account size stays beside it so the drawdown remains visible."
      />

      <div className="flex flex-col gap-4">
        <Field label="Journal starting balance" hint="Fixed risk base for the six-trade test. 1% of this is the cap.">
          <TextInput inputMode="decimal" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="Original account size" hint="Reference only. It does not set the risk cap.">
          <TextInput inputMode="decimal" value={original} onChange={(event) => setOriginal(event.target.value)} />
        </Field>
        <p className="text-sm leading-relaxed text-muted">
          Cap on a new official trade: {formatMoney(cap)}. A stop, breakeven, or target updates the realised balance from the starting figure. It does not change this cap.
        </p>
        <Field label="No-trade conditions" hint="News, session, or anything else you refuse to trade through.">
          <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-sm text-muted">If news rules are unchecked</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={news === "warn" ? "press h-11 rounded-full bg-brass text-sm text-brass-ink" : "press h-11 rounded-full bg-raised text-sm ring-1 ring-line"}
              onClick={() => setNews("warn")}
            >
              Warn
            </button>
            <button
              type="button"
              className={news === "block" ? "press h-11 rounded-full bg-brass text-sm text-brass-ink" : "press h-11 rounded-full bg-raised text-sm ring-1 ring-line"}
              onClick={() => setNews("block")}
            >
              Block the test
            </button>
          </div>
        </div>
        <Button onClick={saveAccount}>Save account</Button>
        <Button
          variant="ghost"
          onClick={() => {
            signOut();
            useJournal.setState({ ...initialData(), hydrated: true });
          }}
        >
          Sign out
        </Button>
        {message ? <Banner tone={tone}>{message}</Banner> : null}
      </div>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-display text-2xl tracking-tight">How a result is counted</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Cash-risk mode: a stop near the planned stop is about −1R, a target at 1:3 is about +3R, breakeven is flat, and costs come off the net. A contract helper uses price × size instead, so gold is not forced through a forex pip formula. A chart touch does not fill or close anything. You confirm the fill and the exit.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Worked check, before costs. Risk $100, long, target at 3R: the balance rises by $300. The same idea stopped out falls by $100. A cancelled limit changes nothing.
        </p>
      </section>

      <section className="mt-10 flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl tracking-tight">Backup</h2>
        <Button
          variant="quiet"
          onClick={() =>
            download(
              "six-journal.json",
              JSON.stringify(backupPayload({ settings, trades, cycles, daily, missed }), null, 2),
              "application/json",
            )
          }
        >
          Export JSON
        </Button>
        <Button variant="quiet" onClick={() => download("six-trades.csv", tradesCsv(trades), "text/csv")}>
          Export CSV
        </Button>
        <Field label="Restore a JSON backup" hint="Replaces this journal on this device.">
          <input
            type="file"
            accept="application/json"
            className="text-sm text-muted"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const parsed = parseBackup(JSON.parse(String(reader.result)));
                  if (!parsed) {
                    setTone("clay");
                    setMessage("That file is not a Six backup.");
                    return;
                  }
                  const result = replaceAll(parsed);
                  setTone(result.ok ? "moss" : "clay");
                  setMessage(result.ok ? "Backup restored." : result.error);
                } catch {
                  setTone("clay");
                  setMessage("Could not read that file.");
                }
              };
              reader.readAsText(file);
            }}
          />
        </Field>
      </section>

      <section className="mt-10 flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl tracking-tight">Reset</h2>
        <p className="text-sm leading-relaxed text-muted">
          Trades are not deleted one by one. A full reset is explicit. Type RESET to clear this device.
        </p>
        <TextInput value={resetText} onChange={(event) => setResetText(event.target.value)} placeholder="RESET" />
        <Button
          variant="danger"
          disabled={resetText !== "RESET"}
          onClick={() => {
            resetJournal();
            setResetText("");
            setTone("brass");
            setMessage("Journal reset to the starting account.");
          }}
        >
          Reset the journal
        </Button>
      </section>
    </div>
  );
}
