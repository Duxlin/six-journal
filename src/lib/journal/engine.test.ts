import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  geometry,
  isQualifyingClose,
  maxPlannedRisk,
  performance,
  rescaleStatedRisk,
  roundMoney,
  settle,
  unitsForRisk,
  validateSetup,
} from "./engine.ts";
import { EMPTY_CHECKLIST, type Checklist, type Trade } from "./types.ts";

const settings = {
  startingBalance: 24760.4,
  maxRiskPercent: 1,
  targetRr: 3,
  rrTolerance: 0.05,
  newsRuleMode: "warn" as const,
};

function checks(over: Partial<Checklist> = {}): Checklist {
  return {
    strategyMatch: true,
    confirmation: true,
    stopValid: true,
    sizeCalculated: true,
    riskWithinCap: true,
    targetIs3R: true,
    newsChecked: true,
    exitRulesKnown: true,
    affordability: true,
    ...over,
  };
}

describe("risk cap", () => {
  it("caps 1% of the fixed starting balance at the cent", () => {
    assert.equal(maxPlannedRisk(24760.4, 1), 247.6);
  });
});

describe("geometry", () => {
  it("measures a long 1:3 and a short 1:3", () => {
    assert.equal(geometry("LONG", 100, 99, 103).rr, 3);
    assert.equal(geometry("SHORT", 10, 12, 4).rr, 3);
  });

  it("rejects inverted levels", () => {
    const long = validateSetup(
      {
        pair: "XAUUSD",
        direction: "LONG",
        orderType: "LIMIT",
        timeframe: "H1",
        entry: 9,
        stopLoss: 10,
        takeProfit: 12,
        plannedCashRisk: 100,
        checklist: checks(),
      },
      settings,
    );
    assert.equal(long.official, false);
    assert.ok(long.violations.some((item) => item.code === "INVALID_LONG_LEVELS"));
  });
});

describe("official test gate", () => {
  it("accepts a complete 1:3 inside the cap", () => {
    const result = validateSetup(
      {
        pair: "EURUSD",
        direction: "LONG",
        orderType: "LIMIT",
        timeframe: "H1",
        entry: 1.08,
        stopLoss: 1.07,
        takeProfit: 1.11,
        plannedCashRisk: 247.6,
        checklist: checks(),
      },
      settings,
    );
    assert.equal(result.official, true);
    assert.ok(Math.abs((result.plannedRr ?? 0) - 3) < 1e-9);
  });

  it("blocks cash risk above the cap and a 1:4 target from the six", () => {
    const over = validateSetup(
      {
        pair: "EURUSD",
        direction: "LONG",
        orderType: "LIMIT",
        timeframe: "H1",
        entry: 1.08,
        stopLoss: 1.07,
        takeProfit: 1.11,
        plannedCashRisk: 247.61,
        checklist: checks(),
      },
      settings,
    );
    assert.ok(over.violations.some((item) => item.code === "RISK_LIMIT_EXCEEDED"));

    const wide = validateSetup(
      {
        pair: "EURUSD",
        direction: "LONG",
        orderType: "LIMIT",
        timeframe: "H1",
        entry: 100,
        stopLoss: 99,
        takeProfit: 104,
        plannedCashRisk: 100,
        checklist: checks(),
      },
      settings,
    );
    assert.equal(wide.official, false);
    assert.ok(wide.violations.some((item) => item.code === "NOT_OFFICIAL_1_TO_3"));
  });

  it("blocks an unfinished checklist even when the prices are valid", () => {
    const result = validateSetup(
      {
        pair: "EURUSD",
        direction: "SHORT",
        orderType: "STOP",
        timeframe: "M15",
        entry: 10,
        stopLoss: 12,
        takeProfit: 4,
        plannedCashRisk: 50,
        checklist: checks({ confirmation: false }),
      },
      settings,
    );
    assert.equal(result.official, false);
    assert.ok(result.violations.some((item) => item.code === "CHECKLIST_INCOMPLETE"));
  });
});

describe("money", () => {
  it("turns a stated-risk 1:3 into three times the cash risk, and a stop into one", () => {
    const win = settle({
      direction: "LONG",
      fill: 100,
      stop: 99,
      exit: 103,
      units: 0,
      pointValue: 0,
      statedRisk: 100,
      costs: 0,
    });
    assert.equal(win.net, 300);
    assert.equal(win.realisedR, 3);

    const loss = settle({
      direction: "LONG",
      fill: 100,
      stop: 99,
      exit: 99,
      units: 0,
      pointValue: 0,
      statedRisk: 100,
      costs: 0,
    });
    assert.equal(loss.net, -100);
    assert.equal(loss.realisedR, -1);

    const flat = settle({
      direction: "SHORT",
      fill: 50,
      stop: 52,
      exit: 50,
      units: 0,
      pointValue: 0,
      statedRisk: 200,
      costs: 0,
    });
    assert.equal(flat.net, 0);
  });

  it("sizes gold in ounces and subtracts costs from the 3R", () => {
    const units = unitsForRisk(247.6, 10, 1);
    assert.ok(units != null && Math.abs(units - 24.76) < 1e-8);
    const win = settle({
      direction: "LONG",
      fill: 2650,
      stop: 2640,
      exit: 2680,
      units: units ?? 0,
      pointValue: 1,
      statedRisk: 247.6,
      costs: 0,
    });
    assert.equal(win.net, 742.8);
    assert.equal(roundMoney(win.actualRisk), 247.6);
    assert.ok(Math.abs((win.realisedR ?? 0) - 3) < 1e-9);

    const costed = settle({
      direction: "LONG",
      fill: 100,
      stop: 99,
      exit: 103,
      units: 0,
      pointValue: 0,
      statedRisk: 100,
      costs: 5,
    });
    assert.equal(costed.net, 295);
    assert.ok(Math.abs((costed.realisedR ?? 0) - 2.95) < 1e-9);
  });

  it("rescales stated risk when the fill is worse than the plan", () => {
    const risk = rescaleStatedRisk(200, 2650, 2640, 2652);
    assert.equal(risk, 240);
    const stopped = settle({
      direction: "LONG",
      fill: 2652,
      stop: 2640,
      exit: 2640,
      units: 0,
      pointValue: 0,
      statedRisk: risk,
      costs: 0,
    });
    assert.equal(stopped.net, -240);
    assert.equal(stopped.realisedR, -1);
  });
});

function trade(partial: Partial<Trade> & Pick<Trade, "id" | "status">): Trade {
  return {
    cycleId: "c1",
    pair: "XAUUSD",
    direction: "LONG",
    orderType: "LIMIT",
    timeframe: "H1",
    setupDate: "2026-10-18",
    entry: 100,
    stopLoss: 99,
    takeProfit: 103,
    initialEntry: 100,
    initialStop: 99,
    initialTarget: 103,
    initialPlannedRisk: 100,
    riskMode: "CUSTOM",
    plannedCashRisk: 100,
    presetId: "risk-only",
    pointValue: 0,
    unitLabel: "R",
    units: 0,
    plannedRr: 3,
    expectedReward: 300,
    rationale: "",
    checklist: EMPTY_CHECKLIST,
    violations: [],
    rulesPassed: true,
    disqualified: false,
    riskBaseAtDecision: 24760.4,
    maxRiskAtDecision: 247.6,
    fills: [{ id: "f", at: "2026-10-18T10:00:00.000Z", on: "2026-10-18", price: 100, qty: 1 }],
    actualInitialRisk: 100,
    avgFill: 100,
    costs: 0,
    events: [],
    ...partial,
  };
}

describe("ledger", () => {
  it("reconciles balance, ignores cancels, and draws down from the peak", () => {
    const trades: Trade[] = [
      trade({
        id: "win",
        status: "CLOSED",
        exitAt: "2026-10-18T12:00:00.000Z",
        netPnl: 300,
        realisedR: 3,
        grossPnl: 300,
      }),
      trade({
        id: "loss",
        status: "CLOSED",
        exitAt: "2026-10-18T15:00:00.000Z",
        netPnl: -100,
        realisedR: -1,
        grossPnl: -100,
      }),
      trade({
        id: "cancel",
        status: "CANCELLED",
        fills: [],
        netPnl: undefined,
      }),
      trade({
        id: "wide",
        status: "CLOSED",
        rulesPassed: false,
        netPnl: 400,
        realisedR: 4,
        exitAt: "2026-10-18T16:00:00.000Z",
      }),
    ];
    const stats = performance(trades, [], 1000);
    assert.equal(stats.realisedPnl, 600);
    assert.equal(stats.realisedBalance, 1600);
    assert.equal(stats.closedCount, 3);
    assert.equal(isQualifyingClose(trades[0]), true);
    assert.equal(isQualifyingClose(trades[2]), false);
    assert.equal(isQualifyingClose(trades[3]), false);
    assert.equal(stats.maxDrawdown, 100);
    assert.equal(stats.currentDrawdown, 0);
  });
});
