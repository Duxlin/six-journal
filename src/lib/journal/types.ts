export type Direction = "LONG" | "SHORT";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type RiskMode = "ONE_PERCENT" | "CUSTOM";
export type NewsRuleMode = "block" | "warn";
export type PnlMethod = "contract" | "stated-risk";

export type TradeStatus =
  | "PLANNED"
  | "VALIDATED"
  | "PENDING"
  | "OPEN"
  | "CLOSED"
  | "CANCELLED"
  | "EXPIRED"
  | "REVIEW_REQUIRED";

export type CloseReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "BREAKEVEN"
  | "MANUAL_PROFIT"
  | "MANUAL_LOSS"
  | "STRATEGY_INVALIDATION"
  | "TRAILING_STOP"
  | "TIME_EXIT"
  | "OTHER";

export type CycleStatus = "ACTIVE" | "REVIEW_REQUIRED" | "REVIEWED";

export interface Checklist {
  strategyMatch: boolean;
  confirmation: boolean;
  stopValid: boolean;
  sizeCalculated: boolean;
  riskWithinCap: boolean;
  targetIs3R: boolean;
  newsChecked: boolean;
  exitRulesKnown: boolean;
  affordability: boolean;
}

export interface Violation {
  code: string;
  severity: "block" | "warn";
  message: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  kind: string;
  message: string;
}

export interface Fill {
  id: string;
  at: string;
  on: string;
  price: number;
  qty: number;
}

export interface Trade {
  id: string;
  cycleId: string;
  pair: string;
  direction: Direction;
  orderType: OrderType;
  timeframe: string;
  setupDate: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  initialEntry: number;
  initialStop: number;
  initialTarget: number;
  initialPlannedRisk: number;
  riskMode: RiskMode;
  plannedCashRisk: number;
  presetId: string;
  pointValue: number;
  unitLabel: string;
  units: number;
  plannedRr: number;
  expectedReward: number;
  rationale: string;
  checklist: Checklist;
  violations: Violation[];
  rulesPassed: boolean;
  disqualified: boolean;
  disqualifyReason?: string;
  status: TradeStatus;
  riskBaseAtDecision: number;
  maxRiskAtDecision: number;
  placedAt?: string;
  fills: Fill[];
  actualInitialRisk?: number;
  avgFill?: number;
  markPrice?: number;
  markAt?: string;
  exitPrice?: number;
  exitAt?: string;
  closedOn?: string;
  closeReason?: CloseReason;
  costs: number;
  grossPnl?: number;
  netPnl?: number;
  realisedR?: number;
  pnlMethod?: PnlMethod;
  closeNote?: string;
  events: AuditEvent[];
}

export interface CycleSnapshot {
  trades: number;
  netPnl: number;
  totalR: number;
  winRate: number | null;
  expectancy: number | null;
  compliance: number | null;
  wins: number;
  losses: number;
  flats: number;
}

export interface Cycle {
  id: string;
  index: number;
  startedAt: string;
  endedAt?: string;
  status: CycleStatus;
  reviewNotes?: string;
  reviewedAt?: string;
  snapshot?: CycleSnapshot;
}

export interface MissedSetup {
  id: string;
  at: string;
  on: string;
  pair: string;
  direction: Direction | "UNSURE";
  wasQualifying: boolean;
  reason: string;
}

export interface DailyAnswers {
  tookEvery: string;
  tookBad: string;
  respected: string;
  impulse: string;
  felt: string;
  improve: string;
}

export interface DailySnapshot {
  realisedBalance: number;
  floatingPnl: number;
  equity: number | null;
  returnPct: number;
  dailyRealisedPnl: number;
  setupsIdentified: number;
  qualifyingSetups: number;
  tradesTaken: number;
  missedSetups: number;
  ruleCompliancePct: number | null;
  executionRatePct: number | null;
}

export interface DailyAmendment {
  at: string;
  summary: string;
}

export interface DailyEntry {
  date: string;
  savedAt: string;
  snapshot: DailySnapshot;
  emotions: string;
  missedNotes: string;
  lessons: string;
  nextPlan: string;
  answers: DailyAnswers;
  amendments: DailyAmendment[];
}

export interface AccountSettings {
  currency: "USD";
  originalAccountSize: number;
  startingBalance: number;
  maxRiskPercent: number;
  targetRr: number;
  rrTolerance: number;
  cycleLength: number;
  noTradeNotes: string;
  newsRuleMode: NewsRuleMode;
  configured: boolean;
}

export const EMPTY_CHECKLIST: Checklist = {
  strategyMatch: false,
  confirmation: false,
  stopValid: false,
  sizeCalculated: false,
  riskWithinCap: false,
  targetIs3R: false,
  newsChecked: false,
  exitRulesKnown: false,
  affordability: false,
};

export const EMPTY_ANSWERS: DailyAnswers = {
  tookEvery: "",
  tookBad: "",
  respected: "",
  impulse: "",
  felt: "",
  improve: "",
};
