import type {
  AccountSettings,
  Checklist,
  CloseReason,
  Direction,
  MissedSetup,
  OrderType,
  Trade,
  Violation,
} from "./types.ts";

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundR(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

export function maxPlannedRisk(startingBalance: number, percent: number): number {
  return roundMoney(startingBalance * (percent / 100));
}

export function geometry(
  direction: Direction,
  entry: number,
  stop: number,
  target: number,
): { riskDist: number; rewardDist: number; rr: number | null } {
  const riskDist = direction === "LONG" ? entry - stop : stop - entry;
  const rewardDist = direction === "LONG" ? target - entry : entry - target;
  const rr = riskDist > 0 && rewardDist > 0 ? rewardDist / riskDist : null;
  return { riskDist, rewardDist, rr };
}

export function unitsForRisk(cashRisk: number, riskDist: number, pointValue: number): number | null {
  if (!(cashRisk > 0) || !(riskDist > 0) || !(pointValue > 0)) return null;
  return cashRisk / (riskDist * pointValue);
}

export interface SetupInput {
  pair: string;
  direction: Direction | "";
  orderType: OrderType | "";
  timeframe: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  plannedCashRisk: number | null;
  checklist: Checklist;
}

const CHECK_LABELS: { key: keyof Checklist; label: string }[] = [
  { key: "strategyMatch", label: "setup matches the written strategy" },
  { key: "confirmation", label: "entry confirmation" },
  { key: "stopValid", label: "stop at invalidation" },
  { key: "sizeCalculated", label: "size and cash risk calculated" },
  { key: "riskWithinCap", label: "risk within the 1% limit" },
  { key: "targetIs3R", label: "target is 3R for this test" },
  { key: "exitRulesKnown", label: "exit rules acknowledged" },
];

export function isStructural(code: string): boolean {
  return (
    code === "MISSING_PAIR_OR_DIRECTION" ||
    code === "MISSING_ORDER" ||
    code === "MISSING_TIMEFRAME" ||
    code === "MISSING_PRICE_LEVELS" ||
    code === "INVALID_LONG_LEVELS" ||
    code === "INVALID_SHORT_LEVELS" ||
    code === "MISSING_RISK" ||
    code === "RISK_NOT_POSITIVE"
  );
}

export function validateSetup(
  input: SetupInput,
  settings: Pick<
    AccountSettings,
    "startingBalance" | "maxRiskPercent" | "targetRr" | "rrTolerance" | "newsRuleMode"
  >,
): { violations: Violation[]; plannedRr: number | null; official: boolean; maxRisk: number } {
  const violations: Violation[] = [];
  const maxRisk = maxPlannedRisk(settings.startingBalance, settings.maxRiskPercent);

  if (!input.pair.trim() || (input.direction !== "LONG" && input.direction !== "SHORT")) {
    violations.push({
      code: "MISSING_PAIR_OR_DIRECTION",
      severity: "block",
      message: "Choose a pair and whether it is long or short.",
    });
  }
  if (input.orderType !== "MARKET" && input.orderType !== "LIMIT" && input.orderType !== "STOP") {
    violations.push({
      code: "MISSING_ORDER",
      severity: "block",
      message: "Choose market, limit, or stop.",
    });
  }
  if (!input.timeframe.trim()) {
    violations.push({
      code: "MISSING_TIMEFRAME",
      severity: "block",
      message: "Choose the timeframe this setup is based on.",
    });
  }

  const entry = input.entry;
  const stop = input.stopLoss;
  const target = input.takeProfit;
  const pricesMissing = entry == null || stop == null || target == null;
  if (pricesMissing) {
    violations.push({
      code: "MISSING_PRICE_LEVELS",
      severity: "block",
      message: "Enter an entry, a stop, and a target before this can be a trade.",
    });
  }

  let plannedRr: number | null = null;
  if (!pricesMissing && (input.direction === "LONG" || input.direction === "SHORT")) {
    const geo = geometry(input.direction, entry, stop, target);
    plannedRr = geo.rr;
    if (input.direction === "LONG" && !(stop < entry && entry < target)) {
      violations.push({
        code: "INVALID_LONG_LEVELS",
        severity: "block",
        message: "A long needs the stop below the entry and the target above it.",
      });
    }
    if (input.direction === "SHORT" && !(target < entry && entry < stop)) {
      violations.push({
        code: "INVALID_SHORT_LEVELS",
        severity: "block",
        message: "A short needs the target below the entry and the stop above it.",
      });
    }
  }

  const risk = input.plannedCashRisk;
  if (risk == null || !Number.isFinite(risk)) {
    violations.push({
      code: "MISSING_RISK",
      severity: "block",
      message: "Enter the cash amount you are risking.",
    });
  } else if (!(risk > 0)) {
    violations.push({
      code: "RISK_NOT_POSITIVE",
      severity: "block",
      message: "Cash risk has to be above zero.",
    });
  } else if (roundMoney(risk) > maxRisk + 0.001) {
    violations.push({
      code: "RISK_LIMIT_EXCEEDED",
      severity: "block",
      message: `This trade exceeds your configured risk cap of ${maxRisk.toFixed(2)}. Do not count it as a compliant test trade. Recalculate size or skip the trade.`,
    });
  }

  const rrFail =
    plannedRr == null || Math.abs(plannedRr - settings.targetRr) > settings.rrTolerance + 1e-9;
  if (!pricesMissing && (input.direction === "LONG" || input.direction === "SHORT") && rrFail) {
    const shown = plannedRr == null ? "invalid" : `1:${plannedRr.toFixed(2)}`;
    violations.push({
      code: "NOT_OFFICIAL_1_TO_3",
      severity: "block",
      message: `Planned reward is ${shown}, not 1:${settings.targetRr.toFixed(0)}. A bigger or smaller target can be journaled, but it does not count as one of the six.`,
    });
  }

  const overCap = violations.some((item) => item.code === "RISK_LIMIT_EXCEEDED");
  const unchecked = CHECK_LABELS.filter(({ key }) => {
    if (input.checklist[key]) return false;
    if (key === "riskWithinCap" && overCap) return false;
    if (key === "targetIs3R" && rrFail) return false;
    return true;
  });
  if (unchecked.length > 0) {
    violations.push({
      code: "CHECKLIST_INCOMPLETE",
      severity: "block",
      message: `Still unchecked: ${unchecked.map((item) => item.label).join(", ")}. The checklist confirms process, not that the trade will win.`,
    });
  }
  if (!input.checklist.affordability) {
    violations.push({
      code: "AFFORDABILITY",
      severity: "block",
      message:
        "Stop and review: do not trade money needed for essentials, or money you cannot afford to lose.",
    });
  }
  if (!input.checklist.newsChecked) {
    violations.push({
      code: "NEWS_RULE",
      severity: settings.newsRuleMode === "block" ? "block" : "warn",
      message:
        settings.newsRuleMode === "block"
          ? "News and session rules are not confirmed. Your settings block the test entry until they are."
          : "News and session rules are not confirmed. This is a warning under your current settings.",
    });
  }

  const official = violations.every((item) => item.severity !== "block");
  return { violations, plannedRr, official, maxRisk };
}

export interface SettleInput {
  direction: Direction;
  fill: number;
  stop: number;
  exit: number;
  units: number;
  pointValue: number;
  statedRisk: number;
  costs: number;
}

export interface SettleResult {
  gross: number;
  net: number;
  actualRisk: number;
  realisedR: number | null;
  method: "contract" | "stated-risk";
}

export function settle(input: SettleInput): SettleResult {
  const costs = Number.isFinite(input.costs) ? input.costs : 0;
  const riskDist = Math.abs(input.fill - input.stop);
  const move = input.direction === "LONG" ? input.exit - input.fill : input.fill - input.exit;

  if (input.pointValue > 0 && input.units > 0 && riskDist > 0) {
    const gross = roundMoney(move * input.units * input.pointValue);
    const actualRisk = roundMoney(riskDist * input.units * input.pointValue);
    const net = roundMoney(gross - costs);
    return {
      gross,
      net,
      actualRisk,
      realisedR: actualRisk > 0 ? net / actualRisk : null,
      method: "contract",
    };
  }

  const stated = roundMoney(input.statedRisk);
  if (!(riskDist > 0) || !(stated > 0)) {
    return {
      gross: 0,
      net: roundMoney(0 - costs),
      actualRisk: stated,
      realisedR: null,
      method: "stated-risk",
    };
  }
  const gross = roundMoney((move / riskDist) * stated);
  const net = roundMoney(gross - costs);
  return {
    gross,
    net,
    actualRisk: stated,
    realisedR: net / stated,
    method: "stated-risk",
  };
}

export function rescaleStatedRisk(
  plannedRisk: number,
  entry: number,
  stop: number,
  fill: number,
): number {
  const plannedDist = Math.abs(entry - stop);
  const fillDist = Math.abs(fill - stop);
  if (!(plannedDist > 0)) return roundMoney(plannedRisk);
  return roundMoney(plannedRisk * (fillDist / plannedDist));
}

export function averageFill(fills: { price: number; qty: number }[]): number | null {
  const qty = fills.reduce((sum, fill) => sum + fill.qty, 0);
  if (!(qty > 0)) return null;
  return fills.reduce((sum, fill) => sum + fill.price * fill.qty, 0) / qty;
}

export function filledQty(fills: { qty: number }[]): number {
  return fills.reduce((sum, fill) => sum + fill.qty, 0);
}

export function isQualifyingClose(trade: Trade): boolean {
  return (
    trade.status === "CLOSED" &&
    trade.fills.length > 0 &&
    trade.rulesPassed &&
    !trade.disqualified &&
    trade.netPnl != null
  );
}

export function distances(direction: Direction, price: number, stop: number, target: number) {
  return {
    toStop: direction === "LONG" ? price - stop : stop - price,
    toTarget: direction === "LONG" ? target - price : price - target,
  };
}

export interface Performance {
  closedCount: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number | null;
  expectancy: number | null;
  compliance: number | null;
  complianceMet: number;
  complianceAssessed: number;
  execution: number | null;
  executed: number;
  identified: number;
  realisedPnl: number;
  realisedBalance: number;
  floatingPnl: number;
  unmarkedOpen: number;
  openCount: number;
  equity: number;
  returnPct: number;
  currentDrawdown: number;
  maxDrawdown: number;
  openRisk: number;
  curve: { label: string; balance: number }[];
}

function bucket(net: number): "win" | "loss" | "flat" {
  if (net > 0.004) return "win";
  if (net < -0.004) return "loss";
  return "flat";
}

export function liveOnMark(trade: Trade): { floating: number; r: number | null } | null {
  if (trade.status !== "OPEN" || trade.markPrice == null || trade.avgFill == null) return null;
  const qty = trade.pointValue > 0 ? filledQty(trade.fills) : 0;
  const stated = trade.actualInitialRisk ?? trade.plannedCashRisk;
  const result = settle({
    direction: trade.direction,
    fill: trade.avgFill,
    stop: trade.stopLoss,
    exit: trade.markPrice,
    units: qty,
    pointValue: trade.pointValue,
    statedRisk: stated,
    costs: 0,
  });
  return { floating: result.net, r: result.realisedR };
}

export function performance(
  trades: Trade[],
  missed: MissedSetup[],
  startingBalance: number,
): Performance {
  const closed = trades
    .filter((trade) => trade.status === "CLOSED" && trade.fills.length > 0 && trade.netPnl != null)
    .slice()
    .sort((a, b) => (a.exitAt ?? "").localeCompare(b.exitAt ?? ""));
  const wins = closed.filter((trade) => bucket(trade.netPnl ?? 0) === "win").length;
  const losses = closed.filter((trade) => bucket(trade.netPnl ?? 0) === "loss").length;
  const flats = closed.length - wins - losses;
  const rated = closed.filter((trade) => trade.realisedR != null);
  const expectancy =
    rated.length > 0 ? rated.reduce((sum, trade) => sum + (trade.realisedR ?? 0), 0) / rated.length : null;
  const met = closed.filter((trade) => trade.rulesPassed && !trade.disqualified);
  const identified =
    trades.filter((trade) => trade.rulesPassed).length + missed.filter((item) => item.wasQualifying).length;
  const executed = trades.filter((trade) => trade.rulesPassed && trade.fills.length > 0).length;
  const realisedPnl = roundMoney(closed.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0));
  const realisedBalance = roundMoney(startingBalance + realisedPnl);

  let walked = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  const curve = [{ label: "Start", balance: roundMoney(startingBalance) }];
  for (const trade of closed) {
    walked = roundMoney(walked + (trade.netPnl ?? 0));
    peak = Math.max(peak, walked);
    maxDrawdown = Math.max(maxDrawdown, roundMoney(peak - walked));
    curve.push({ label: trade.pair, balance: walked });
  }

  const open = trades.filter((trade) => trade.status === "OPEN");
  let floating = 0;
  let unmarkedOpen = 0;
  let openRisk = 0;
  for (const trade of open) {
    openRisk = roundMoney(openRisk + (trade.actualInitialRisk ?? trade.plannedCashRisk));
    const live = liveOnMark(trade);
    if (!live) unmarkedOpen += 1;
    else floating = roundMoney(floating + live.floating);
  }

  return {
    closedCount: closed.length,
    wins,
    losses,
    flats,
    winRate: closed.length ? wins / closed.length : null,
    expectancy,
    compliance: closed.length ? met.length / closed.length : null,
    complianceMet: met.length,
    complianceAssessed: closed.length,
    execution: identified ? executed / identified : null,
    executed,
    identified,
    realisedPnl,
    realisedBalance,
    floatingPnl: floating,
    unmarkedOpen,
    openCount: open.length,
    equity: roundMoney(realisedBalance + floating),
    returnPct: startingBalance > 0 ? (realisedBalance - startingBalance) / startingBalance : 0,
    currentDrawdown: roundMoney(Math.max(0, peak - realisedBalance)),
    maxDrawdown,
    openRisk,
    curve,
  };
}

export function dayCounts(date: string, trades: Trade[], missed: MissedSetup[]) {
  const identified = trades.filter((trade) => trade.setupDate === date);
  const qualifying = identified.filter((trade) => trade.rulesPassed);
  const taken = trades.filter(
    (trade) => trade.rulesPassed && trade.fills.some((fill) => fill.on === date),
  );
  const missedToday = missed.filter((item) => item.on === date);
  const closedToday = trades.filter(
    (trade) => trade.status === "CLOSED" && trade.closedOn === date && trade.netPnl != null,
  );
  return {
    setupsIdentified: identified.length,
    qualifyingSetups: qualifying.length,
    tradesTaken: taken.length,
    missedSetups: missedToday.length,
    dailyRealisedPnl: roundMoney(closedToday.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0)),
  };
}

export function cycleSample(trades: Trade[], cycleId: string) {
  const closed = trades.filter(
    (trade) => trade.cycleId === cycleId && trade.status === "CLOSED" && trade.fills.length > 0,
  );
  const qualifying = closed.filter(isQualifyingClose);
  const netPnl = roundMoney(qualifying.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0));
  const rated = qualifying.filter((trade) => trade.realisedR != null);
  const totalR = rated.reduce((sum, trade) => sum + (trade.realisedR ?? 0), 0);
  const wins = qualifying.filter((trade) => bucket(trade.netPnl ?? 0) === "win").length;
  const losses = qualifying.filter((trade) => bucket(trade.netPnl ?? 0) === "loss").length;
  const flats = qualifying.length - wins - losses;
  const met = closed.filter((trade) => trade.rulesPassed && !trade.disqualified);
  return {
    qualifying,
    closed,
    count: qualifying.length,
    netPnl,
    totalR,
    winRate: qualifying.length ? wins / qualifying.length : null,
    expectancy: rated.length ? totalR / rated.length : null,
    compliance: closed.length ? met.length / closed.length : null,
    wins,
    losses,
    flats,
  };
}

const PLAN_EXITS: CloseReason[] = ["TAKE_PROFIT", "STOP_LOSS"];

export function exitNeedsRuleCheck(reason: CloseReason): boolean {
  return !PLAN_EXITS.includes(reason);
}

export function closeMessage(
  reason: CloseReason,
  realisedR: number | null,
  costs: number,
): { title: string; body: string } {
  const near = (target: number) =>
    realisedR != null && Math.abs(realisedR - target) <= 0.05 + Math.max(costs, 0) / 10_000;

  switch (reason) {
    case "TAKE_PROFIT": {
      const costLine =
        costs > 0 && realisedR != null && realisedR < 2.85
          ? " Costs kept the net under a full +3R. The price target and the money result are not the same thing."
          : "";
      return {
        title: near(3) ? "You are up 3R" : "Target reached",
        body:
          "Congratulations. Your target was reached. A full target is about +3R before costs, if the fill matched the plan. Check the realised net. Do not increase risk because of one win." +
          costLine,
      };
    }
    case "STOP_LOSS":
      return {
        title: near(-1) ? "A controlled 1R loss" : "Stop was hit",
        body: "Your stop was hit. If you followed the plan, this was a controlled loss, not a failure. You risked what you could afford to lose — at most 1% of the fixed base. Take time to analyse carefully. The market is not going anywhere, and the next trade does not have to win this one back.",
      };
    case "BREAKEVEN":
      return {
        title: "Closed at breakeven",
        body: "The balance does not move except for costs. Record whether leaving here matched your exit rules. A flat result can still be a process miss.",
      };
    case "MANUAL_PROFIT":
    case "MANUAL_LOSS":
      return {
        title: "Manual close",
        body: "Record why you closed, and compare it with your exit rules. A profitable manual exit can still be a rule violation. A losing exit can be the right risk decision.",
      };
    default:
      return {
        title: "Close recorded",
        body: "The result is on the balance. Keep the reason next to the plan so a later review can tell skill from impulse.",
      };
  }
}
