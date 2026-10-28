export interface MarketSymbol {
  id: string;
  yahoo: string;
  label: string;
  digits: number;
  note?: string;
}

export const SYMBOLS: MarketSymbol[] = [
  { id: "EURUSD", yahoo: "EURUSD=X", label: "EUR/USD", digits: 5 },
  { id: "GBPUSD", yahoo: "GBPUSD=X", label: "GBP/USD", digits: 5 },
  { id: "USDJPY", yahoo: "JPY=X", label: "USD/JPY", digits: 3 },
  { id: "AUDUSD", yahoo: "AUDUSD=X", label: "AUD/USD", digits: 5 },
  { id: "USDCAD", yahoo: "CAD=X", label: "USD/CAD", digits: 5 },
  { id: "USDCHF", yahoo: "CHF=X", label: "USD/CHF", digits: 5 },
  { id: "NZDUSD", yahoo: "NZDUSD=X", label: "NZD/USD", digits: 5 },
  { id: "EURGBP", yahoo: "EURGBP=X", label: "EUR/GBP", digits: 5 },
  { id: "XAUUSD", yahoo: "GC=F", label: "Gold", digits: 2, note: "COMEX gold future. Not a broker spot quote." },
];

export const TIMEFRAMES = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "30m", label: "30m" },
  { id: "1h", label: "1H" },
  { id: "4h", label: "4H" },
  { id: "1d", label: "1D" },
  { id: "1wk", label: "1W" },
  { id: "1mo", label: "1M" },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

export function symbolById(id: string): MarketSymbol | undefined {
  return SYMBOLS.find((item) => item.id === id);
}
