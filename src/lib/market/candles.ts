import { createServerFn } from "@tanstack/react-start";
import { symbolById, type TimeframeId } from "./symbols";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type CandleResult =
  | { ok: true; source: string; candles: Candle[]; note: string }
  | { ok: false; error: string };

const YAHOO: Record<TimeframeId, { interval: string; range: string; aggregate?: "4h" }> = {
  "1m": { interval: "1m", range: "5d" },
  "5m": { interval: "5m", range: "1mo" },
  "15m": { interval: "15m", range: "1mo" },
  "30m": { interval: "30m", range: "1mo" },
  "1h": { interval: "60m", range: "1y" },
  "4h": { interval: "60m", range: "1y", aggregate: "4h" },
  "1d": { interval: "1d", range: "1y" },
  "1wk": { interval: "1wk", range: "1y" },
  "1mo": { interval: "1mo", range: "1y" },
};

function aggregate4h(candles: Candle[]): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const candle of candles) {
    const time = Math.floor(candle.time / 14_400) * 14_400;
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, { ...candle, time });
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function parseYahoo(payload: unknown): Candle[] {
  const chart = payload as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }[] } }[] };
  };
  const row = chart.chart?.result?.[0];
  const times = row?.timestamp ?? [];
  const quote = row?.indicators?.quote?.[0];
  if (!quote) return [];
  const candles: Candle[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({ time: times[index] ?? 0, open, high, low, close });
  }
  return candles;
}

async function fromYahoo(symbolId: string, timeframe: TimeframeId): Promise<CandleResult> {
  const symbol = symbolById(symbolId);
  const plan = YAHOO[timeframe];
  if (!symbol || !plan) return { ok: false, error: "That symbol or timeframe is not available." };
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.yahoo)}?interval=${plan.interval}&range=${plan.range}`;
  const response = await fetch(url, { headers: { "user-agent": "SixJournal/1.0" } });
  if (!response.ok) return { ok: false, error: `The public quote feed returned ${response.status}. Try again in a moment.` };
  let candles = parseYahoo(await response.json());
  if (plan.aggregate === "4h") candles = aggregate4h(candles);
  if (candles.length < 2) return { ok: false, error: "The feed returned no candles for that pair." };
  const limit =
    timeframe === "1m"
      ? "1-minute history is only the last few days on the public feed."
      : "Daily and higher timeframes cover about 12 months. This is a public quote, not your broker's bid or ask.";
  return {
    ok: true,
    source: "Yahoo Finance public quotes",
    candles,
    note: symbol.note ? `${symbol.note} ${limit}` : limit,
  };
}

async function fromOanda(symbolId: string, timeframe: TimeframeId, token: string, practice: boolean): Promise<CandleResult> {
  const symbol = symbolById(symbolId);
  if (!symbol) return { ok: false, error: "Unknown symbol." };
  if (token.trim().length < 20) return { ok: false, error: "Paste an OANDA API token in the chart settings. This app will not invent OANDA prices." };
  const granularity: Record<TimeframeId, string> = {
    "1m": "M1",
    "5m": "M5",
    "15m": "M15",
    "30m": "M30",
    "1h": "H1",
    "4h": "H4",
    "1d": "D",
    "1wk": "W",
    "1mo": "M",
  };
  const instrument = `${symbol.id.slice(0, 3)}_${symbol.id.slice(3)}`;
  const host = practice ? "api-fxpractice.oanda.com" : "api-fxtrade.oanda.com";
  const url = `https://${host}/v3/instruments/${instrument}/candles?granularity=${granularity[timeframe]}&count=500&price=M`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.trim()}` } });
  if (!response.ok) return { ok: false, error: `OANDA refused the request (${response.status}). Check the token and practice or live host.` };
  const body = (await response.json()) as {
    candles?: { time: string; mid?: { o: string; h: string; l: string; c: string }; complete?: boolean }[];
  };
  const candles: Candle[] = [];
  for (const row of body.candles ?? []) {
    if (!row.mid || row.complete === false) continue;
    candles.push({
      time: Math.floor(new Date(row.time).getTime() / 1000),
      open: Number(row.mid.o),
      high: Number(row.mid.h),
      low: Number(row.mid.l),
      close: Number(row.mid.c),
    });
  }
  if (candles.length < 2) return { ok: false, error: "OANDA returned no complete candles." };
  return { ok: true, source: practice ? "OANDA practice" : "OANDA live", candles, note: "Mid prices from your OANDA token. About the latest 500 candles." };
}

export const fetchCandles = createServerFn({ method: "POST" })
  .validator((input: { symbol: string; timeframe: TimeframeId; source: "yahoo" | "oanda" | "fxcm" | "forexcom"; token?: string; practice?: boolean }) => input)
  .handler(async ({ data }): Promise<CandleResult> => {
    if (data.source === "fxcm" || data.source === "forexcom") {
      return {
        ok: false,
        error:
          data.source === "fxcm"
            ? "FXCM does not publish a free candle API. Prices are not guessed."
            : "Forex.com does not publish a free candle API. Prices are not guessed.",
      };
    }
    if (data.source === "oanda") return fromOanda(data.symbol, data.timeframe, data.token ?? "", data.practice !== false);
    return fromYahoo(data.symbol, data.timeframe);
  });
