# Six

A 1:3 six-trade test journal with a chart. It records planned risk, fills, closes, and the cycle. It does not forecast price.

Each sign-in lives in this browser. That person's trades, drawings, and alerts stay separate. The starting balance is blank until they type it. The 1% cap is fixed from that number.

The chart uses public FX quotes (about every 30 seconds), with 1-minute through monthly bars. Daily and higher cover about 12 months. OANDA candles load only if you paste your own API token. Forex.com and FXCM do not offer a free candle feed, so those sources stay empty rather than showing invented prices.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8080

## Host on Vercel

1. Import this repository in [Vercel](https://vercel.com/new).
2. Leave the framework as **Other**. The build already writes Vercel’s output.
3. Build command: `npm run build`
4. Install command: `npm install`
5. No environment variables are required.

The live site is the journal. Balance and trades remain on the device that wrote them.
