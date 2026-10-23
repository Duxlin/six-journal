# Six

A 1:3 six-trade test journal. It records planned risk, fills, closes, and the cycle. It does not connect to a broker, and it does not forecast price.

Trades stay in the browser (`localStorage`). The journal starts at $24,760.40 on a $25,000 account, with a fixed 1% risk cap.

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
