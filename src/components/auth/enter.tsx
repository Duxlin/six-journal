import { useState } from "react";
import { createAccount, signIn } from "@/lib/accounts";
import { fetchCandles } from "@/lib/market/candles";
import { useEffect } from "react";

export function EnterScreen({ onEnter }: { onEnter: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let stop = false;
    void fetchCandles({ data: { symbol: "EURUSD", timeframe: "1m", source: "yahoo" } }).then((result) => {
      if (stop || !result.ok) return;
      setPrice(result.candles[result.candles.length - 1]?.close ?? null);
    });
    return () => {
      stop = true;
    };
  }, []);

  async function submit() {
    setBusy(true);
    const result =
      mode === "up" ? await createAccount(email, password, name) : await signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onEnter();
  }

  return (
    <div className="relative flex min-h-dvh flex-col justify-end px-5 pb-28 pt-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(126,224,255,0.2),transparent_60%)]" />
      <p className="text-[11px] font-medium tracking-[0.22em] text-signal uppercase">Six</p>
      <h1 className="mt-2 max-w-sm font-display text-5xl leading-none tracking-tight">Your journal. Your chart.</h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
        Each sign-in on this device keeps its own trades, drawings, and alerts. The book is empty until you type the balance you are actually trading.
      </p>
      <p className="nums mt-5 font-display text-4xl tracking-tight">{price == null ? "EUR/USD" : price.toFixed(5)}</p>
      <p className="text-xs text-faint">EUR/USD from the public quote, not a broker fill.</p>

      <div className="mt-8 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("in")}
          className={mode === "in" ? "h-11 rounded-full bg-brass text-sm text-brass-ink" : "h-11 rounded-full bg-raised text-sm ring-1 ring-line"}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("up")}
          className={mode === "up" ? "h-11 rounded-full bg-brass text-sm text-brass-ink" : "h-11 rounded-full bg-raised text-sm ring-1 ring-line"}
        >
          Create account
        </button>
      </div>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {mode === "up" ? (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            className="h-12 rounded-xl bg-raised px-3 ring-1 ring-line"
          />
        ) : null}
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          className="h-12 rounded-xl bg-raised px-3 ring-1 ring-line"
        />
        <input
          type="password"
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          className="h-12 rounded-xl bg-raised px-3 ring-1 ring-line"
        />
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button type="submit" disabled={busy} className="press h-12 rounded-xl bg-brass font-medium text-brass-ink disabled:opacity-40">
          {busy ? "Checking…" : mode === "up" ? "Create and open" : "Open my journal"}
        </button>
      </form>
    </div>
  );
}
