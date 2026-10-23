import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/journal/format";

export function EquityChart({ points }: { points: { label: string; balance: number }[] }) {
  const [mod, setMod] = useState<typeof import("recharts") | null>(null);

  useEffect(() => {
    let live = true;
    void import("recharts").then((lib) => {
      if (live) setMod(lib);
    });
    return () => {
      live = false;
    };
  }, []);

  if (points.length < 2) return null;
  if (!mod) return <div className="h-40 rounded-lg bg-surface" />;

  const { ResponsiveContainer, LineChart, Line, YAxis, Tooltip, XAxis } = mod;
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            formatter={(value) => formatMoney(Number(value))}
            labelFormatter={(label) => String(label)}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              borderRadius: 12,
              color: "var(--color-fg)",
              fontSize: 13,
            }}
          />
          <Line type="monotone" dataKey="balance" stroke="var(--color-brass)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
