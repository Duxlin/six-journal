export interface InstrumentPreset {
  id: string;
  label: string;
  unitLabel: string;
  pointValue: number;
  hint: string;
}

/**
 * pointValue = account currency gained when price moves 1.0, per 1 unit.
 * XAUUSD per ounce is $1. A standard USD-quote FX lot is $100,000 per 1.0
 * (that is $10 per 0.0001 pip). Edit the value if the broker contract differs.
 */
export const PRESETS: InstrumentPreset[] = [
  {
    id: "risk-only",
    label: "Cash risk only",
    unitLabel: "R",
    pointValue: 0,
    hint: "Result in money follows the cash risk you enter and where price closes relative to the stop. No contract size.",
  },
  {
    id: "xau-oz",
    label: "XAUUSD per ounce",
    unitLabel: "oz",
    pointValue: 1,
    hint: "One ounce gains $1 when gold moves $1. A 100 oz lot is the usual 1.00 standard lot.",
  },
  {
    id: "xau-lot",
    label: "XAUUSD standard lot",
    unitLabel: "lot",
    pointValue: 100,
    hint: "One standard lot (100 oz) gains $100 when gold moves $1. Confirm the contract with your broker.",
  },
  {
    id: "fx-usd",
    label: "FX lot, USD quote",
    unitLabel: "lot",
    pointValue: 100_000,
    hint: "EURUSD-style standard lot: about $10 a pip. Do not use this for gold, indices, or yen crosses.",
  },
  {
    id: "fx-jpy",
    label: "FX lot, JPY quote",
    unitLabel: "lot",
    pointValue: 667,
    hint: "Approximate point value near USDJPY 150. Replace it with your broker's figure before you trust the size.",
  },
  {
    id: "index",
    label: "Index, $1 a point",
    unitLabel: "contract",
    pointValue: 1,
    hint: "Change the point value if the contract pays $5, $20, or something else per point.",
  },
  {
    id: "btc",
    label: "BTC per coin",
    unitLabel: "BTC",
    pointValue: 1,
    hint: "One coin gains $1 when price moves $1. Size fractional coins from the cash risk.",
  },
];

export function presetById(id: string): InstrumentPreset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
