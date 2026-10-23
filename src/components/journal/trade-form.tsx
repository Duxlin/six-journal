import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Banner, Button, Chip, Field, PageTitle, TextArea, TextInput } from "@/components/journal/bits";
import {
  geometry,
  isStructural,
  maxPlannedRisk,
  settle,
  unitsForRisk,
  validateSetup,
} from "@/lib/journal/engine";
import {
  formatMoney,
  formatPrice,
  formatRr,
  formatSignedMoney,
  formatUnits,
  localDate,
} from "@/lib/journal/format";
import { PRESETS, presetById } from "@/lib/journal/presets";
import { useJournal, type TradeDraft } from "@/lib/journal/store";
import { EMPTY_CHECKLIST, type Checklist, type Direction, type OrderType, type RiskMode, type Trade } from "@/lib/journal/types";

const FRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];
const CHECKS: { key: keyof Checklist; label: string }[] = [
  { key: "strategyMatch", label: "My setup matches my written strategy." },
  { key: "confirmation", label: "My entry confirmation has occurred." },
  { key: "stopValid", label: "My stop loss is at a valid invalidation level." },
  { key: "sizeCalculated", label: "My position size and cash risk are calculated." },
  { key: "riskWithinCap", label: "Risk is within the 1% limit." },
  { key: "targetIs3R", label: "My target is exactly 3R for this test." },
  { key: "newsChecked", label: "I checked my defined news and session restrictions." },
  { key: "exitRulesKnown", label: "I know the exit rules and will not move the stop impulsively." },
  { key: "affordability", label: "I am not risking money I need for essentials, or money I cannot afford to lose." },
];

function parseNum(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function TradeForm({ existing }: { existing?: Trade }) {
  const settings = useJournal((state) => state.settings);
  const saveTrade = useJournal((state) => state.saveTrade);
  const realised = useJournal((state) => state.trades);
  const navigate = useNavigate();
  const cap = maxPlannedRisk(settings.startingBalance, settings.maxRiskPercent);

  const [pair, setPair] = useState(existing?.pair ?? "");
  const [direction, setDirection] = useState<Direction | "">(existing?.direction ?? "");
  const [orderType, setOrderType] = useState<OrderType | "">(existing?.orderType ?? "");
  const [timeframe, setTimeframe] = useState(existing?.timeframe ?? "");
  const [setupDate, setSetupDate] = useState(existing?.setupDate ?? localDate());
  const [entry, setEntry] = useState(existing ? String(existing.entry) : "");
  const [stop, setStop] = useState(existing ? String(existing.stopLoss) : "");
  const [target, setTarget] = useState(existing ? String(existing.takeProfit) : "");
  const [riskMode, setRiskMode] = useState<RiskMode>(existing?.riskMode ?? "ONE_PERCENT");
  const [customRisk, setCustomRisk] = useState(
    existing?.riskMode === "CUSTOM" ? String(existing.plannedCashRisk) : "",
  );
  const [presetId, setPresetId] = useState(existing?.presetId ?? "risk-only");
  const [pointRaw, setPointRaw] = useState(existing ? String(existing.pointValue) : "0");
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [checklist, setChecklist] = useState<Checklist>(existing?.checklist ?? EMPTY_CHECKLIST);
  const [error, setError] = useState("");

  const entryN = parseNum(entry);
  const stopN = parseNum(stop);
  const targetN = parseNum(target);
  const pointValue = parseNum(pointRaw) ?? 0;
  const plannedCashRisk = riskMode === "ONE_PERCENT" ? cap : parseNum(customRisk);
  const preset = presetById(presetId);

  const validation = useMemo(
    () =>
      validateSetup(
        {
          pair,
          direction,
          orderType,
          timeframe,
          entry: entryN,
          stopLoss: stopN,
          takeProfit: targetN,
          plannedCashRisk,
          checklist,
        },
        settings,
      ),
    [pair, direction, orderType, timeframe, entryN, stopN, targetN, plannedCashRisk, checklist, settings],
  );

  const geo =
    (direction === "LONG" || direction === "SHORT") && entryN != null && stopN != null && targetN != null
      ? geometry(direction, entryN, stopN, targetN)
      : null;
  const units =
    plannedCashRisk && geo && geo.riskDist > 0 ? unitsForRisk(plannedCashRisk, geo.riskDist, pointValue) : null;

  const closedPnl = realised
    .filter((trade) => trade.status === "CLOSED" && trade.netPnl != null)
    .reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0);
  const balanceNow = settings.startingBalance + closedPnl;

  function outcome(exit: number | null) {
    if (
      (direction !== "LONG" && direction !== "SHORT") ||
      entryN == null ||
      stopN == null ||
      exit == null ||
      !(plannedCashRisk && plannedCashRisk > 0)
    ) {
      return null;
    }
    return settle({
      direction,
      fill: entryN,
      stop: stopN,
      exit,
      units: units ?? 0,
      pointValue,
      statedRisk: plannedCashRisk,
      costs: 0,
    });
  }

  const atStop = outcome(stopN);
  const atTarget = outcome(targetN);
  const atFlat = outcome(entryN);
  const structural = validation.violations.some((item) => isStructural(item.code));
  const locked = existing != null && !["PLANNED", "VALIDATED", "REVIEW_REQUIRED"].includes(existing.status);

  function toggle(key: keyof Checklist) {
    setChecklist((current) => ({ ...current, [key]: !current[key] }));
  }

  function onSubmit() {
    const draft: TradeDraft = {
      pair,
      direction,
      orderType,
      timeframe,
      setupDate,
      entry: entryN,
      stopLoss: stopN,
      takeProfit: targetN,
      riskMode,
      plannedCashRisk,
      presetId,
      pointValue,
      unitLabel: preset.unitLabel,
      rationale,
      checklist,
    };
    const saved = saveTrade(draft, existing?.id);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    void navigate({ to: "/setups/$tradeId", params: { tradeId: saved.id } });
  }

  if (locked) {
    return (
      <Banner title="This plan is locked">
        The order is already working or filled. Change the stop from the trade itself so the edit stays in the audit.
      </Banner>
    );
  }

  return (
    <div>
      <PageTitle
        eyebrow={existing ? "Edit plan" : "New analysis"}
        title={existing ? existing.pair : "Log a setup"}
        lede="Nothing here is an order until you confirm it. A chart touch is not a fill."
      />

      <div className="flex flex-col gap-5">
        <Field label="Pair">
          <TextInput
            value={pair}
            placeholder="XAUUSD"
            onChange={(event) => setPair(event.target.value)}
            onBlur={() => setPair((value) => value.trim().toUpperCase())}
          />
        </Field>
        <div>
          <p className="mb-2 text-sm text-muted">Direction</p>
          <div className="grid grid-cols-2 gap-2">
            {(["LONG", "SHORT"] as const).map((item) => (
              <Chip key={item} on={direction === item} onClick={() => setDirection(item)}>
                {item === "LONG" ? "Long" : "Short"}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-muted">Order</p>
          <div className="grid grid-cols-3 gap-2">
            {(["LIMIT", "STOP", "MARKET"] as const).map((item) => (
              <Chip key={item} on={orderType === item} onClick={() => setOrderType(item)}>
                {item === "LIMIT" ? "Limit" : item === "STOP" ? "Stop" : "Market"}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-muted">Timeframe</p>
          <div className="flex flex-wrap gap-2">
            {FRAMES.map((frame) => (
              <Chip key={frame} on={timeframe === frame} onClick={() => setTimeframe(frame)}>
                {frame}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Setup date">
          <TextInput type="date" value={setupDate} onChange={(event) => setSetupDate(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Entry">
            <TextInput inputMode="decimal" value={entry} onChange={(event) => setEntry(event.target.value)} />
          </Field>
          <Field label="Stop">
            <TextInput inputMode="decimal" value={stop} onChange={(event) => setStop(event.target.value)} />
          </Field>
          <Field label="Target">
            <TextInput inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />
          </Field>
        </div>
        <p className="nums text-sm text-muted">
          Planned reward {formatRr(geo?.rr ?? null)}
          {geo && geo.riskDist > 0 ? ` · risk ${formatPrice(geo.riskDist)} · reward ${formatPrice(geo.rewardDist)}` : ""}
        </p>

        <div>
          <p className="mb-2 text-sm text-muted">Cash risk</p>
          <div className="grid grid-cols-2 gap-2">
            <Chip on={riskMode === "ONE_PERCENT"} onClick={() => setRiskMode("ONE_PERCENT")}>
              1% · {formatMoney(cap)}
            </Chip>
            <Chip on={riskMode === "CUSTOM"} onClick={() => setRiskMode("CUSTOM")}>
              I'll type it
            </Chip>
          </div>
          {riskMode === "CUSTOM" ? (
            <div className="mt-3">
              <Field label="Amount at risk" hint={`The test cap stays ${formatMoney(cap)}. Less is allowed. More is journaled, but it does not count.`}>
                <TextInput inputMode="decimal" value={customRisk} onChange={(event) => setCustomRisk(event.target.value)} />
              </Field>
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Fixed for this test: 1% of {formatMoney(settings.startingBalance)}. Wins and losses do not change the cap.
            </p>
          )}
        </div>

        <Field label="Contract helper" hint={preset.hint}>
          <select
            className="h-12 w-full rounded-xl bg-raised px-3 text-base text-fg ring-1 ring-inset ring-line"
            value={presetId}
            onChange={(event) => {
              const next = presetById(event.target.value);
              setPresetId(next.id);
              setPointRaw(String(next.pointValue));
            }}
          >
            {PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        {presetId !== "risk-only" ? (
          <Field label={`Point value (${preset.unitLabel})`} hint="Account currency gained when price moves 1.0, per unit. Match your broker.">
            <TextInput inputMode="decimal" value={pointRaw} onChange={(event) => setPointRaw(event.target.value)} />
          </Field>
        ) : null}
        {units != null ? (
          <p className="nums text-sm text-fg">
            Size {formatUnits(units)} {preset.unitLabel}
          </p>
        ) : null}

        {atStop && atTarget && atFlat ? (
          <div className="rounded-2xl bg-surface ring-1 ring-line px-4 py-3">
            <p className="text-sm text-muted">If the fill is the planned entry, before costs</p>
            <ul className="mt-2 space-y-1 text-sm nums">
              <li>Stop: {formatSignedMoney(atStop.net)} → {formatMoney(balanceNow + atStop.net)}</li>
              <li>Breakeven: {formatSignedMoney(atFlat.net)} → {formatMoney(balanceNow + atFlat.net)}</li>
              <li>Target: {formatSignedMoney(atTarget.net)} → {formatMoney(balanceNow + atTarget.net)}</li>
            </ul>
          </div>
        ) : null}

        <Field label="Why this setup">
          <TextArea value={rationale} onChange={(event) => setRationale(event.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm text-muted">Pre-trade checklist</legend>
          <div className="flex flex-col">
            {CHECKS.map((item) => (
              <label key={item.key} className="flex min-h-11 items-start gap-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-brass"
                  checked={checklist[item.key]}
                  onChange={() => toggle(item.key)}
                />
                <span className="text-sm leading-snug">{item.label}</span>
              </label>
            ))}
          </div>
          {settings.noTradeNotes ? (
            <p className="mt-2 text-xs leading-relaxed text-faint">Your no-trade note: {settings.noTradeNotes}</p>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Checking these boxes confirms the process. It does not mean the trade will make money.
          </p>
        </fieldset>

        {validation.violations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {validation.violations.map((item) => (
              <li key={item.code}>
                <Banner tone={item.severity === "block" ? "clay" : "brass"}>{item.message}</Banner>
              </li>
            ))}
          </ul>
        ) : (
          <Banner tone="moss" title="Ready for the six">
            This passes the 1:3 test rules. It still counts only after a confirmed fill and a real close.
          </Banner>
        )}
        {error ? <Banner tone="clay">{error}</Banner> : null}
        <Button disabled={structural} onClick={onSubmit}>
          {structural ? "Fix the setup" : validation.official ? "Validate for the test" : "Save outside the six"}
        </Button>
      </div>
    </div>
  );
}
