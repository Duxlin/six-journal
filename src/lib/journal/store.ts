import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  averageFill,
  cycleSample,
  exitNeedsRuleCheck,
  filledQty,
  isStructural,
  rescaleStatedRisk,
  roundMoney,
  roundR,
  settle,
  validateSetup,
  type SetupInput,
} from "./engine.ts";
import { localDate } from "./format.ts";
import { presetById } from "./presets.ts";
import {
  type AccountSettings,
  type AuditEvent,
  type CloseReason,
  type Cycle,
  type DailyAnswers,
  type DailyEntry,
  type Fill,
  type MissedSetup,
  type Trade,
} from "./types.ts";

const safeStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> =
  typeof window === "undefined"
    ? {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
    : localStorage;

export const DEFAULT_SETTINGS: AccountSettings = {
  currency: "USD",
  originalAccountSize: 25000,
  startingBalance: 24760.4,
  maxRiskPercent: 1,
  targetRr: 3,
  rrTolerance: 0.05,
  cycleLength: 6,
  noTradeNotes: "",
  newsRuleMode: "warn",
};

export interface TradeDraft {
  pair: string;
  direction: SetupInput["direction"];
  orderType: SetupInput["orderType"];
  timeframe: string;
  setupDate: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskMode: Trade["riskMode"];
  plannedCashRisk: number | null;
  presetId: string;
  pointValue: number;
  unitLabel: string;
  rationale: string;
  checklist: SetupInput["checklist"];
}

interface JournalData {
  settings: AccountSettings;
  trades: Trade[];
  cycles: Cycle[];
  daily: DailyEntry[];
  missed: MissedSetup[];
}

interface JournalState extends JournalData {
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  updateSettings: (patch: Partial<AccountSettings>) => void;
  saveTrade: (draft: TradeDraft, existingId?: string) => { ok: true; id: string } | { ok: false; error: string };
  placeOrder: (id: string) => { ok: true } | { ok: false; error: string };
  confirmFill: (
    id: string,
    price: number,
    qty: number | null,
  ) => { ok: true } | { ok: false; error: string };
  cancelWorking: (id: string, how: "CANCELLED" | "EXPIRED") => { ok: true } | { ok: false; error: string };
  discardSetup: (id: string) => { ok: true } | { ok: false; error: string };
  setMark: (id: string, price: number) => { ok: true } | { ok: false; error: string };
  amendProtection: (
    id: string,
    input: { stopLoss: number; takeProfit: number; reason: string; allowed: boolean },
  ) => { ok: true } | { ok: false; error: string };
  closeTrade: (
    id: string,
    input: { reason: CloseReason; exitPrice: number; costs: number; note: string; allowed: boolean },
  ) => { ok: true } | { ok: false; error: string };
  reopenTrade: (id: string, reason: string) => { ok: true } | { ok: false; error: string };
  addNote: (id: string, note: string) => { ok: true } | { ok: false; error: string };
  addMissed: (input: Omit<MissedSetup, "id" | "at" | "on">) => void;
  saveDaily: (input: {
    date: string;
    emotions: string;
    missedNotes: string;
    lessons: string;
    nextPlan: string;
    answers: DailyAnswers;
    snapshot: DailyEntry["snapshot"];
  }) => { ok: true } | { ok: false; error: string };
  reviewCycle: (notes: string) => { ok: true } | { ok: false; error: string };
  replaceAll: (data: JournalData) => { ok: true } | { ok: false; error: string };
  resetJournal: () => void;
}

function uid(): string {
  return crypto.randomUUID();
}

function stamp(kind: string, message: string): AuditEvent {
  return { id: uid(), at: new Date().toISOString(), kind, message };
}

function freshCycle(index: number): Cycle {
  return {
    id: uid(),
    index,
    startedAt: new Date().toISOString(),
    status: "ACTIVE",
  };
}

export function initialData(): JournalData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    trades: [],
    cycles: [
      {
        id: "cycle-1",
        index: 1,
        startedAt: new Date().toISOString(),
        status: "ACTIVE",
      },
    ],
    daily: [],
    missed: [],
  };
}

function currentCycle(cycles: Cycle[]): Cycle {
  const open = [...cycles].reverse().find((cycle) => cycle.status !== "REVIEWED");
  if (!open) throw new Error("No open cycle");
  return open;
}

function editable(status: Trade["status"]): boolean {
  return status === "PLANNED" || status === "VALIDATED" || status === "REVIEW_REQUIRED";
}

function resultOf(value: { ok: true } | { ok: false; error: string }) {
  return value;
}

export const useJournal = create<JournalState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),

      updateSettings: (patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...patch,
            startingBalance:
              patch.startingBalance != null ? roundMoney(patch.startingBalance) : state.settings.startingBalance,
            originalAccountSize:
              patch.originalAccountSize != null
                ? roundMoney(patch.originalAccountSize)
                : state.settings.originalAccountSize,
          },
        })),

      saveTrade: (draft, existingId) => {
        const state = get();
        const validation = validateSetup(draft, state.settings);
        if (validation.violations.some((item) => isStructural(item.code))) {
          return { ok: false, error: validation.violations.find((item) => isStructural(item.code))?.message ?? "Fix the setup." };
        }
        if (draft.direction !== "LONG" && draft.direction !== "SHORT") {
          return { ok: false, error: "Choose long or short." };
        }
        if (draft.orderType !== "MARKET" && draft.orderType !== "LIMIT" && draft.orderType !== "STOP") {
          return { ok: false, error: "Choose an order type." };
        }
        const entry = draft.entry ?? 0;
        const stop = draft.stopLoss ?? 0;
        const target = draft.takeProfit ?? 0;
        const risk = roundMoney(draft.plannedCashRisk ?? 0);
        const rr = validation.plannedRr ?? 0;
        const preset = presetById(draft.presetId);
        const pointValue = draft.pointValue;
        const riskDist = Math.abs(entry - stop);
        const units =
          pointValue > 0 && riskDist > 0 ? risk / (riskDist * pointValue) : 0;
        const cycle = currentCycle(state.cycles);
        const official = validation.official;
        const status: Trade["status"] = official ? "VALIDATED" : "REVIEW_REQUIRED";

        const build = (previous?: Trade): Trade => ({
          id: previous?.id ?? uid(),
          cycleId: previous?.cycleId ?? cycle.id,
          pair: draft.pair.trim().toUpperCase(),
          direction: draft.direction as Trade["direction"],
          orderType: draft.orderType as Trade["orderType"],
          timeframe: draft.timeframe,
          setupDate: draft.setupDate,
          entry,
          stopLoss: stop,
          takeProfit: target,
          initialEntry: previous?.initialEntry ?? entry,
          initialStop: previous?.initialStop ?? stop,
          initialTarget: previous?.initialTarget ?? target,
          initialPlannedRisk: previous?.initialPlannedRisk ?? risk,
          riskMode: draft.riskMode,
          plannedCashRisk: risk,
          presetId: preset.id,
          pointValue,
          unitLabel: draft.unitLabel || preset.unitLabel,
          units,
          plannedRr: rr,
          expectedReward: roundMoney(risk * (rr || 0)),
          rationale: draft.rationale.trim(),
          checklist: draft.checklist,
          violations: validation.violations,
          rulesPassed: official,
          disqualified: false,
          status,
          riskBaseAtDecision: state.settings.startingBalance,
          maxRiskAtDecision: validation.maxRisk,
          fills: [],
          costs: 0,
          events: [
            ...(previous?.events ?? []),
            stamp(
              previous ? "edit" : "create",
              official ? "Validated for the 1:3 test." : "Saved outside the six-trade test.",
            ),
          ],
        });

        if (existingId) {
          const previous = state.trades.find((trade) => trade.id === existingId);
          if (!previous) return { ok: false, error: "That setup is no longer in the journal." };
          if (!editable(previous.status)) {
            return { ok: false, error: "This setup can no longer be rewritten. Amend the stop or close it." };
          }
          set({
            trades: state.trades.map((trade) => (trade.id === existingId ? build(previous) : trade)),
          });
          return { ok: true, id: existingId };
        }

        const created = build();
        set({ trades: [created, ...state.trades] });
        return { ok: true, id: created.id };
      },

      placeOrder: (id) => {
        const state = get();
        const trade = state.trades.find((item) => item.id === id);
        if (!trade) return { ok: false, error: "Setup not found." };
        if (trade.status !== "VALIDATED" && trade.status !== "REVIEW_REQUIRED") {
          return { ok: false, error: "Validate the setup before you mark an order as working." };
        }
        const cycle = state.cycles.find((item) => item.id === trade.cycleId);
        if (trade.rulesPassed && cycle?.status === "REVIEW_REQUIRED") {
          return {
            ok: false,
            error: "This cycle is waiting for review. Official entries stay closed until you archive it.",
          };
        }
        const at = new Date().toISOString();
        set({
          trades: state.trades.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "PENDING",
                  placedAt: at,
                  events: [
                    ...item.events,
                    stamp(
                      "place",
                      item.orderType === "MARKET"
                        ? "Market order sent. It stays unfilled until you confirm the fill."
                        : "Working order recorded. A price touch is not a fill.",
                    ),
                  ],
                }
              : item,
          ),
        });
        return resultOf({ ok: true });
      },

      confirmFill: (id, price, qty) => {
        const state = get();
        const trade = state.trades.find((item) => item.id === id);
        if (!trade) return { ok: false, error: "Setup not found." };
        if (trade.status !== "PENDING" && trade.status !== "VALIDATED" && trade.status !== "OPEN") {
          return { ok: false, error: "Confirm a fill only after the setup is validated or already open." };
        }
        if (!(price > 0)) return { ok: false, error: "Enter the fill price." };
        const cycle = state.cycles.find((item) => item.id === trade.cycleId);
        if (trade.rulesPassed && !trade.disqualified && cycle?.status === "REVIEW_REQUIRED" && trade.fills.length === 0) {
          return { ok: false, error: "Archive the finished cycle before a new official fill." };
        }
        const contract = trade.pointValue > 0 && trade.units > 0;
        const already = filledQty(trade.fills);
        const remaining = Math.max(trade.units - already, 0);
        const useQty = contract ? qty ?? remaining : 1;
        if (!(useQty > 0)) return { ok: false, error: "Fill quantity has to be above zero." };
        if (contract && useQty - remaining > 0.0000001) {
          return { ok: false, error: "That quantity is larger than the size still working." };
        }
        if (!(Math.abs(price - trade.stopLoss) > 0)) {
          return { ok: false, error: "This fill sits on the stop, so risk would be zero. Check the price." };
        }
        const fill: Fill = {
          id: uid(),
          at: new Date().toISOString(),
          on: localDate(),
          price,
          qty: useQty,
        };
        const fills = [...trade.fills, fill];
        const avg = averageFill(fills) ?? price;
        const qtyNow = filledQty(fills);
        const actual = contract
          ? roundMoney(Math.abs(avg - trade.stopLoss) * qtyNow * trade.pointValue)
          : rescaleStatedRisk(trade.plannedCashRisk, trade.entry, trade.stopLoss, price);
        let disqualified = trade.disqualified;
        let disqualifyReason = trade.disqualifyReason;
        const events = [...trade.events, stamp("fill", `Fill confirmed at ${price} for ${useQty} ${trade.unitLabel}.`)];
        if (actual - trade.maxRiskAtDecision > 0.009) {
          disqualified = true;
          disqualifyReason = "The fill pushed cash risk over the 1% cap, so this result stays on the balance but out of the six.";
          events.push(stamp("disqualify", disqualifyReason));
        }
        set({
          trades: state.trades.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "OPEN",
                  placedAt: item.placedAt ?? fill.at,
                  fills,
                  avgFill: avg,
                  actualInitialRisk: actual,
                  disqualified,
                  disqualifyReason,
                  events,
                }
              : item,
          ),
        });
        return { ok: true };
      },

      cancelWorking: (id, how) => {
        const trade = get().trades.find((item) => item.id === id);
        if (!trade) return { ok: false, error: "Setup not found." };
        if (trade.status !== "PENDING") return { ok: false, error: "Only a working order can expire or be cancelled." };
        if (trade.fills.length > 0) return { ok: false, error: "Part of this order is already filled." };
        set({
          trades: get().trades.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: how,
                  events: [
                    ...item.events,
                    stamp(how === "EXPIRED" ? "expire" : "cancel", how === "EXPIRED" ? "Order expired unfilled. Not a loss." : "Order cancelled unfilled. Not a loss."),
                  ],
                }
              : item,
          ),
        });
        return { ok: true };
      },

      discardSetup: (id) => {
        const trade = get().trades.find((item) => item.id === id);
        if (!trade) return { ok: false, error: "Setup not found." };
        if (trade.fills.length > 0) return { ok: false, error: "A filled trade stays in the journal." };
        if (!editable(trade.status)) return { ok: false, error: "Cancel the working order instead of discarding it." };
        set({
          trades: get().trades.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "CANCELLED",
                  events: [...item.events, stamp("discard", "Discarded before an order. Not a loss.")],
                }
              : item,
          ),
        });
        return { ok: true };
      },

      setMark: (id, price) => {
        const trade = get().trades.find((item) => item.id === id);
        if (!trade || trade.status !== "OPEN") return { ok: false, error: "Only an open trade takes a mark." };
        if (!(price > 0)) return { ok: false, error: "Enter a price." };
        const at = new Date().toISOString();
        set({
          trades: get().trades.map((item) =>
            item.id === id
              ? {
                  ...item,
                  markPrice: price,
                  markAt: at,
                  events: [...item.events, stamp("mark", `Manual mark ${price}. This does not open, close, or fill the trade.`)],
                }
              : item,
          ),
        });
        return { ok: true };
      },

      amendProtection: (id, input) => {
        const state = get();
        const trade = state.trades.find((item) => item.id === id);
        if (!trade) return { ok: false, error: "Setup not found." };
        if (trade.status !== "OPEN" && trade.status !== "PENDING") {
          return { ok: false, error: "Stops can be amended while the order is working or open." };
        }
        if (input.reason.trim().length < 8) return { ok: false, error: "Write a short reason for the change." };
        const direction = trade.direction;
        const entry = trade.avgFill ?? trade.entry;
        const valid =
          direction === "LONG"
            ? input.stopLoss < entry && entry < input.takeProfit
            : input.takeProfit < entry && entry < input.stopLoss;
        if (!valid) return { ok: false, error: "The new stop and target still have to sit on the right sides of price." };
        const geo = direction === "LONG"
          ? (input.takeProfit - entry) / (entry - input.stopLoss)
          : (entry - input.takeProfit) / (input.stopLoss - entry);
        let disqualified = trade.disqualified;
        let disqualifyReason = trade.disqualifyReason;
        const events = [
          ...trade.events,
          stamp(
            "amend",
            `Stop ${trade.stopLoss} → ${input.stopLoss}, target ${trade.takeProfit} → ${input.takeProfit}. ${input.reason.trim()}`,
          ),
        ];
        const rrOff = Math.abs(geo - state.settings.targetRr) > state.settings.rrTolerance + 1e-9;
        if (!input.allowed || rrOff) {
          disqualified = true;
          disqualifyReason = !input.allowed
            ? "Protection was moved in a way the written rules do not allow."
            : "The amended target is no longer the 1:3 test.";
          events.push(stamp("disqualify", disqualifyReason));
        }
        let actual = trade.actualInitialRisk;
        if (trade.avgFill != null && trade.fills.length > 0) {
          if (trade.pointValue > 0 && filledQty(trade.fills) > 0) {
            actual = roundMoney(
              Math.abs(trade.avgFill - input.stopLoss) * filledQty(trade.fills) * trade.pointValue,
            );
          } else {
            const originalDist = Math.abs(trade.initialEntry - trade.initialStop);
            const newDist = Math.abs(trade.avgFill - input.stopLoss);
            actual =
              originalDist > 0
                ? roundMoney(trade.initialPlannedRisk * (newDist / originalDist))
                : trade.plannedCashRisk;
          }
          if (actual - trade.maxRiskAtDecision > 0.009) {
            disqualified = true;
            disqualifyReason = "The new stop risks more than the 1% cap.";
            events.push(stamp("disqualify", disqualifyReason));
          }
        }
        set({
          trades: state.trades.map((item) =>
            item.id === id
              ? {
                  ...item,
                  stopLoss: input.stopLoss,
                  takeProfit: input.takeProfit,
                  plannedRr: geo,
                  actualInitialRisk: actual,
                  disqualified,
                  disqualifyReason,
                  events,
                }
              : item,
          ),
        });
        return { ok: true };
      },

      closeTrade: (id, input) => {
        const state = get();
        const trade = state.trades.find((item) => item.id === id);
        if (!trade || trade.status !== "OPEN" || trade.avgFill == null) {
          return { ok: false, error: "Close a trade only after a confirmed fill." };
        }
        if (!(input.exitPrice > 0)) return { ok: false, error: "Enter the exit price." };
        if (exitNeedsRuleCheck(input.reason) && input.note.trim().length < 8) {
          return { ok: false, error: "Write why you closed. A manual exit needs a reason." };
        }
        const qty = trade.pointValue > 0 ? filledQty(trade.fills) : 0;
        const stated = trade.actualInitialRisk ?? trade.plannedCashRisk;
        const result = settle({
          direction: trade.direction,
          fill: trade.avgFill,
          stop: trade.stopLoss,
          exit: input.exitPrice,
          units: qty,
          pointValue: trade.pointValue,
          statedRisk: stated,
          costs: input.costs,
        });
        let disqualified = trade.disqualified;
        let disqualifyReason = trade.disqualifyReason;
        const at = new Date().toISOString();
        const events = [
          ...trade.events,
          stamp(
            "close",
            `Closed ${input.reason} at ${input.exitPrice}. Net ${result.net}. ${input.note.trim()}`.trim(),
          ),
        ];
        if (exitNeedsRuleCheck(input.reason) && !input.allowed) {
          disqualified = true;
          disqualifyReason = "The exit was not allowed by the written rules, so it does not count toward the six.";
          events.push(stamp("disqualify", disqualifyReason));
        }
        const closed: Trade = {
          ...trade,
          status: "CLOSED",
          exitPrice: input.exitPrice,
          exitAt: at,
          closedOn: localDate(),
          closeReason: input.reason,
          costs: roundMoney(input.costs),
          grossPnl: result.gross,
          netPnl: result.net,
          realisedR: result.realisedR == null ? undefined : result.realisedR,
          pnlMethod: result.method,
          closeNote: input.note.trim(),
          disqualified,
          disqualifyReason,
          events,
        };
        const trades = state.trades.map((item) => (item.id === id ? closed : item));
        const sample = cycleSample(trades, trade.cycleId);
        const cycles = state.cycles.map((cycle) => {
          if (cycle.id !== trade.cycleId || cycle.status !== "ACTIVE") return cycle;
          if (sample.count >= state.settings.cycleLength) {
            return {
              ...cycle,
              status: "REVIEW_REQUIRED" as const,
              endedAt: at,
            };
          }
          return cycle;
        });
        set({ trades, cycles });
        return { ok: true };
      },

      reopenTrade: (id, reason) => {
        const trade = get().trades.find((item) => item.id === id);
        if (!trade || trade.status !== "CLOSED") return { ok: false, error: "Only a closed trade can be reopened." };
        if (reason.trim().length < 8) return { ok: false, error: "Write why the recorded close was wrong." };
        const cycle = get().cycles.find((item) => item.id === trade.cycleId);
        if (cycle?.status === "REVIEWED") {
          return { ok: false, error: "That cycle is archived. Add a note instead of rewriting it." };
        }
        set({
          trades: get().trades.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "OPEN",
                  exitPrice: undefined,
                  exitAt: undefined,
                  closedOn: undefined,
                  closeReason: undefined,
                  grossPnl: undefined,
                  netPnl: undefined,
                  realisedR: undefined,
                  events: [
                    ...item.events,
                    stamp(
                      "reopen",
                      `Previous close voided (net ${trade.netPnl ?? 0}, ${trade.closeReason ?? "unset"}). ${reason.trim()}`,
                    ),
                  ],
                }
              : item,
          ),
          cycles: get().cycles.map((item) =>
            item.id === trade.cycleId && item.status === "REVIEW_REQUIRED"
              ? { ...item, status: "ACTIVE", endedAt: undefined }
              : item,
          ),
        });
        return { ok: true };
      },

      addNote: (id, note) => {
        if (note.trim().length < 2) return { ok: false, error: "Write a note first." };
        const trade = get().trades.find((item) => item.id === id);
        if (!trade) return { ok: false, error: "Setup not found." };
        set({
          trades: get().trades.map((item) =>
            item.id === id
              ? { ...item, events: [...item.events, stamp("note", note.trim())] }
              : item,
          ),
        });
        return { ok: true };
      },

      addMissed: (input) => {
        const missed: MissedSetup = {
          id: uid(),
          at: new Date().toISOString(),
          on: localDate(),
          pair: input.pair.trim().toUpperCase() || "UNNAMED",
          direction: input.direction,
          wasQualifying: input.wasQualifying,
          reason: input.reason.trim(),
        };
        set({ missed: [missed, ...get().missed] });
      },

      saveDaily: (input) => {
        const text = [
          input.emotions,
          input.missedNotes,
          input.lessons,
          input.nextPlan,
          ...Object.values(input.answers),
        ]
          .join(" ")
          .trim();
        if (text.length < 8) return { ok: false, error: "Write at least one honest line before locking the day." };
        const existing = get().daily.find((entry) => entry.date === input.date);
        if (!existing) {
          const entry: DailyEntry = {
            date: input.date,
            savedAt: new Date().toISOString(),
            snapshot: input.snapshot,
            emotions: input.emotions.trim(),
            missedNotes: input.missedNotes.trim(),
            lessons: input.lessons.trim(),
            nextPlan: input.nextPlan.trim(),
            answers: input.answers,
            amendments: [],
          };
          set({ daily: [entry, ...get().daily.filter((item) => item.date !== input.date)] });
          return { ok: true };
        }
        const changed =
          existing.emotions !== input.emotions.trim() ||
          existing.missedNotes !== input.missedNotes.trim() ||
          existing.lessons !== input.lessons.trim() ||
          existing.nextPlan !== input.nextPlan.trim() ||
          JSON.stringify(existing.answers) !== JSON.stringify(input.answers);
        const next: DailyEntry = {
          ...existing,
          emotions: input.emotions.trim(),
          missedNotes: input.missedNotes.trim(),
          lessons: input.lessons.trim(),
          nextPlan: input.nextPlan.trim(),
          answers: input.answers,
          amendments: changed
            ? [
                ...existing.amendments,
                { at: new Date().toISOString(), summary: "Wrote over the review. The first numbers stayed." },
              ]
            : existing.amendments,
        };
        set({ daily: get().daily.map((entry) => (entry.date === input.date ? next : entry)) });
        return { ok: true };
      },

      reviewCycle: (notes) => {
        const state = get();
        const cycle = currentCycle(state.cycles);
        if (cycle.status !== "REVIEW_REQUIRED") {
          return { ok: false, error: "The review opens after six qualifying closes." };
        }
        if (notes.trim().length < 12) {
          return { ok: false, error: "Write what the six trades actually showed before you start another cycle." };
        }
        const sample = cycleSample(state.trades, cycle.id);
        const reviewed: Cycle = {
          ...cycle,
          status: "REVIEWED",
          reviewNotes: notes.trim(),
          reviewedAt: new Date().toISOString(),
          snapshot: {
            trades: sample.count,
            netPnl: sample.netPnl,
            totalR: roundR(sample.totalR),
            winRate: sample.winRate,
            expectancy: sample.expectancy,
            compliance: sample.compliance,
            wins: sample.wins,
            losses: sample.losses,
            flats: sample.flats,
          },
        };
        set({
          cycles: [...state.cycles.map((item) => (item.id === cycle.id ? reviewed : item)), freshCycle(cycle.index + 1)],
        });
        return { ok: true };
      },

      replaceAll: (data) => {
        if (!data || !Array.isArray(data.trades) || !Array.isArray(data.cycles) || data.cycles.length === 0) {
          return { ok: false, error: "That file is not a Six journal backup." };
        }
        set({
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
          trades: data.trades,
          cycles: data.cycles,
          daily: data.daily ?? [],
          missed: data.missed ?? [],
          hydrated: true,
        });
        return { ok: true };
      },

      resetJournal: () => set({ ...initialData(), hydrated: true }),
    }),
    {
      name: "six-journal-v1",
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      version: 1,
      partialize: (state) => ({
        settings: state.settings,
        trades: state.trades,
        cycles: state.cycles,
        daily: state.daily,
        missed: state.missed,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<JournalData>;
        return {
          ...current,
          settings: { ...current.settings, ...(saved.settings ?? {}) },
          trades: saved.trades ?? [],
          cycles: saved.cycles && saved.cycles.length > 0 ? saved.cycles : current.cycles,
          daily: saved.daily ?? [],
          missed: saved.missed ?? [],
          hydrated: false,
        };
      },
      onRehydrateStorage: () => () => {
        useJournal.setState({ hydrated: true });
      },
    },
  ),
);

export function backupPayload(state: JournalData) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    trades: state.trades,
    cycles: state.cycles,
    daily: state.daily,
    missed: state.missed,
  };
}

export function parseBackup(raw: unknown): JournalData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<JournalData> & { version?: number };
  if (!Array.isArray(data.trades) || !Array.isArray(data.cycles) || data.cycles.length === 0) return null;
  if (!data.settings || typeof data.settings !== "object") return null;
  return {
    settings: { ...DEFAULT_SETTINGS, ...data.settings, currency: "USD" },
    trades: data.trades,
    cycles: data.cycles,
    daily: Array.isArray(data.daily) ? data.daily : [],
    missed: Array.isArray(data.missed) ? data.missed : [],
  };
}
