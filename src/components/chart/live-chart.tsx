import { useEffect, useRef, useState } from "react";
import { Bell, Minus, MousePointer2, Spline, Triangle } from "lucide-react";
import { fetchCandles, type Candle } from "@/lib/market/candles";
import { SYMBOLS, TIMEFRAMES, symbolById, type TimeframeId } from "@/lib/market/symbols";
import { readSessionId } from "@/lib/accounts";
import { cn } from "@/lib/utils";

type Source = "yahoo" | "oanda" | "fxcm" | "forexcom";
type Tool = "cross" | "hline" | "trend" | "fib" | "alert";

interface Point {
  time: number;
  price: number;
}
interface HLine {
  id: string;
  price: number;
}
interface Segment {
  id: string;
  a: Point;
  b: Point;
}
interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  side: "above" | "below";
  fired: boolean;
}

interface ChartPrefs {
  source: Source;
  token: string;
  practice: boolean;
  alerts: PriceAlert[];
}

const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function prefsKey() {
  return `six-chart:${readSessionId() ?? "none"}`;
}

function loadPrefs(): ChartPrefs {
  const empty: ChartPrefs = { source: "yahoo", token: "", practice: true, alerts: [] };
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(prefsKey());
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Partial<ChartPrefs>) };
  } catch {
    return empty;
  }
}

function savePrefs(prefs: ChartPrefs) {
  localStorage.setItem(prefsKey(), JSON.stringify(prefs));
}

export function LiveChart() {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<import("lightweight-charts").IChartApi | null>(null);
  const seriesRef = useRef<import("lightweight-charts").ISeriesApi<"Candlestick"> | null>(null);
  const toolRef = useRef<Tool>("cross");
  const draftRef = useRef<Point | null>(null);
  const [tool, setTool] = useState<Tool>("cross");
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState<TimeframeId>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [note, setNote] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<ChartPrefs>(loadPrefs);
  const [tokenDraft, setTokenDraft] = useState(prefs.token);
  const [hlines, setHlines] = useState<HLine[]>([]);
  const [trends, setTrends] = useState<Segment[]>([]);
  const [fibs, setFibs] = useState<Segment[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const [banner, setBanner] = useState("");
  candlesRef.current = candles;

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let dead = false;
    let cleanup = () => {};
    void import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode }) => {
      if (dead || !host.current) return;
      const chart = createChart(host.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "#0c1018" },
          textColor: "#9aa6b8",
          fontFamily: "Outfit, sans-serif",
        },
        grid: {
          vertLines: { color: "rgba(44,54,72,0.45)" },
          horzLines: { color: "rgba(44,54,72,0.45)" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#2c3648" },
        timeScale: { borderColor: "#2c3648", timeVisible: true, secondsVisible: false },
      });
      const series = chart.addCandlestickSeries({
        upColor: "#7ddea8",
        downColor: "#ff8b7a",
        borderUpColor: "#7ddea8",
        borderDownColor: "#ff8b7a",
        wickUpColor: "#7ddea8",
        wickDownColor: "#ff8b7a",
      });
      chartRef.current = chart;
      seriesRef.current = series;
      if (candlesRef.current.length) {
        series.setData(candlesRef.current as import("lightweight-charts").CandlestickData[]);
        chart.timeScale().fitContent();
      }
      chart.subscribeClick((param) => {
        if (!param.point || param.time == null) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price == null) return;
        const time = typeof param.time === "number" ? param.time : 0;
        const active = toolRef.current;
        if (active === "hline") {
          setHlines((rows) => [...rows, { id: crypto.randomUUID(), price }]);
          return;
        }
        if (active === "alert") {
          const last = seriesRef.current?.data()?.at(-1);
          const close = last && "close" in last ? last.close : price;
          setPrefs((current) => ({
            ...current,
            alerts: [
              ...current.alerts,
              {
                id: crypto.randomUUID(),
                symbol,
                price,
                side: price >= close ? "above" : "below",
                fired: false,
              },
            ],
          }));
          setBanner(`Alert armed on ${symbol} at ${price.toFixed(symbolById(symbol)?.digits ?? 5)}.`);
          if (typeof Notification !== "undefined" && Notification.permission === "default") {
            void Notification.requestPermission();
          }
          return;
        }
        if (active === "trend" || active === "fib") {
          const point = { time, price };
          if (!draftRef.current) {
            draftRef.current = point;
            setBanner("Tap the second point.");
            return;
          }
          const segment = { id: crypto.randomUUID(), a: draftRef.current, b: point };
          draftRef.current = null;
          setBanner("");
          if (active === "trend") setTrends((rows) => [...rows, segment]);
          else setFibs((rows) => [...rows, segment]);
        }
      });
      cleanup = () => chart.remove();
    });
    return () => {
      dead = true;
      cleanup();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol]);

  useEffect(() => {
    let stop = false;
    async function load() {
      setLoading(true);
      const result = await fetchCandles({
        data: {
          symbol,
          timeframe,
          source: prefs.source,
          token: prefs.token,
          practice: prefs.practice,
        },
      });
      if (stop) return;
      if (!result.ok) {
        setCandles([]);
        setError(result.error);
        setSourceLabel("");
        setNote("");
      } else {
        setError("");
        setCandles(result.candles);
        setSourceLabel(result.source);
        setNote(result.note);
        seriesRef.current?.setData(result.candles as import("lightweight-charts").CandlestickData[]);
        chartRef.current?.timeScale().fitContent();
        const last = result.candles[result.candles.length - 1];
        if (last) {
          setPrefs((current) => {
            let changed = false;
            const next = current.alerts.map((alert) => {
              if (alert.fired || alert.symbol !== symbol) return alert;
              const hit = alert.side === "above" ? last.close >= alert.price : last.close <= alert.price;
              if (!hit) return alert;
              changed = true;
              const message = `${alert.symbol} is ${alert.side} ${alert.price}`;
              setBanner(message);
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification("Six alert", { body: message });
              }
              return { ...alert, fired: true };
            });
            return changed ? { ...current, alerts: next } : current;
          });
        }
      }
      setLoading(false);
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [symbol, timeframe, prefs.source, prefs.token, prefs.practice]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const lines = [
      ...hlines.map((line) => series.createPriceLine({ price: line.price, color: "#7ee0ff", lineWidth: 1, title: "Level" })),
      ...fibs.flatMap((fib) =>
        FIBS.map((ratio) => {
          const price = fib.a.price + (fib.b.price - fib.a.price) * ratio;
          return series.createPriceLine({
            price,
            color: "rgba(231,194,122,0.85)",
            lineWidth: 1,
            lineStyle: 2,
            title: `${Math.round(ratio * 100)}%`,
          });
        }),
      ),
    ];
    const trendSeries = trends.map((trend) => {
      const row = chart.addLineSeries({ color: "#e7c27a", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      const ordered = [trend.a, trend.b].sort((a, b) => a.time - b.time);
      row.setData(ordered.map((point) => ({ time: point.time as import("lightweight-charts").UTCTimestamp, value: point.price })));
      return row;
    });
    return () => {
      for (const line of lines) series.removePriceLine(line);
      for (const row of trendSeries) chart.removeSeries(row);
    };
  }, [hlines, trends, fibs, candles]);

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const change = last && prev ? last.close - prev.close : 0;
  const digits = symbolById(symbol)?.digits ?? 5;
  const armed = prefs.alerts.filter((alert) => !alert.fired);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.2em] text-signal uppercase">Chart</p>
          <p className="font-display text-3xl tracking-tight">{symbolById(symbol)?.label ?? symbol}</p>
          <p className={cn("nums text-sm", change > 0 ? "text-moss" : change < 0 ? "text-clay" : "text-muted")}>
            {last ? last.close.toFixed(digits) : "—"} {last ? (change >= 0 ? "+" : "−") + Math.abs(change).toFixed(digits) : ""}
          </p>
        </div>
        <p className="max-w-[11rem] text-right text-[11px] leading-relaxed text-faint">{loading ? "Loading quotes…" : sourceLabel}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SYMBOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSymbol(item.id)}
            className={cn(
              "press h-10 shrink-0 rounded-full px-3 text-sm ring-1 ring-inset",
              symbol === item.id ? "bg-brass text-brass-ink ring-brass" : "bg-raised text-fg ring-line",
            )}
          >
            {item.id}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TIMEFRAMES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTimeframe(item.id)}
            className={cn(
              "press h-10 shrink-0 rounded-full px-3 text-sm ring-1 ring-inset",
              timeframe === item.id ? "bg-signal text-bg ring-signal" : "bg-raised text-fg ring-line",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        <ToolButton on={tool === "cross"} label="Cross" onClick={() => setTool("cross")}>
          <MousePointer2 className="size-4" />
        </ToolButton>
        <ToolButton on={tool === "hline"} label="Level" onClick={() => setTool("hline")}>
          <Minus className="size-4" />
        </ToolButton>
        <ToolButton on={tool === "trend"} label="Trend" onClick={() => setTool("trend")}>
          <Spline className="size-4" />
        </ToolButton>
        <ToolButton on={tool === "fib"} label="Fib" onClick={() => setTool("fib")}>
          <Triangle className="size-4" />
        </ToolButton>
        <ToolButton on={tool === "alert"} label="Alert" onClick={() => setTool("alert")}>
          <Bell className="size-4" />
        </ToolButton>
        <button
          type="button"
          className="press h-10 shrink-0 rounded-full px-3 text-sm text-faint ring-1 ring-line"
          onClick={() => {
            setHlines([]);
            setTrends([]);
            setFibs([]);
            draftRef.current = null;
          }}
        >
          Clear drawings
        </button>
      </div>

      <div className="relative h-[min(68dvh,640px)] min-h-80 overflow-hidden rounded-2xl ring-1 ring-line">
        <div ref={host} className="absolute inset-0" />
      </div>
      {error ? <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-clay ring-1 ring-line">{error}</p> : null}
      {banner ? <p className="text-sm text-brass">{banner}</p> : null}
      <p className="text-xs leading-relaxed text-faint">{note}</p>

      <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
        <h2 className="text-sm text-muted">Quote source</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["yahoo", "Public FX"],
              ["oanda", "OANDA"],
              ["forexcom", "Forex.com"],
              ["fxcm", "FXCM"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPrefs((current) => ({ ...current, source: id }))}
              className={cn(
                "press h-11 rounded-full text-sm ring-1 ring-inset",
                prefs.source === id ? "bg-brass text-brass-ink ring-brass" : "bg-raised text-fg ring-line",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {prefs.source === "oanda" ? (
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="password"
              autoComplete="off"
              value={tokenDraft}
              placeholder="OANDA API token"
              onChange={(event) => setTokenDraft(event.target.value)}
              className="h-12 rounded-xl bg-raised px-3 text-base ring-1 ring-line"
            />
            <button
              type="button"
              className="press h-11 rounded-xl bg-raised text-sm ring-1 ring-line"
              onClick={() => setPrefs((current) => ({ ...current, token: tokenDraft }))}
            >
              Use this token
            </button>
            <p className="text-xs leading-relaxed text-faint">
              The token stays in this browser. Practice host is used. Without a token, OANDA prices are not shown.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Forex.com and FXCM have no free candle feed, so they stay blank. The working chart uses public quotes, refreshed about every 30 seconds, out to roughly 12 months on 1H and higher.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm text-muted">Alerts {armed.length ? `(${armed.length} armed)` : ""}</h2>
        {prefs.alerts.length === 0 ? (
          <p className="text-sm text-faint">Choose Alert, then tap a price. The check runs when the chart refreshes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {prefs.alerts.map((alert) => (
              <li key={alert.id} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-line">
                <span className="nums">
                  {alert.symbol} {alert.side} {alert.price.toFixed(symbolById(alert.symbol)?.digits ?? 5)}
                  {alert.fired ? " · hit" : ""}
                </span>
                <button
                  type="button"
                  className="text-faint"
                  onClick={() =>
                    setPrefs((current) => ({ ...current, alerts: current.alerts.filter((item) => item.id !== alert.id) }))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ToolButton({
  on,
  label,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm ring-1 ring-inset",
        on ? "bg-signal text-bg ring-signal" : "bg-raised text-fg ring-line",
      )}
    >
      {children}
      {label}
    </button>
  );
}
