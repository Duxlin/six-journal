import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, NotebookPen, Orbit, Settings } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useJournal } from "@/lib/journal/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Desk", icon: LayoutDashboard },
  { to: "/setups", label: "Trades", icon: ListChecks },
  { to: "/journal", label: "Day", icon: NotebookPen },
  { to: "/cycle", label: "Cycle", icon: Orbit },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    void Promise.resolve(useJournal.persist.rehydrate());
  }, []);

  const onSettings = path.startsWith("/settings");

  return (
    <div className="min-h-dvh text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-bg/75 px-4 py-3 backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-raised ring-1 ring-line">
              <span className="flex items-end gap-0.5">
                <span className="h-2 w-0.5 rounded-full bg-brass" />
                <span className="h-3 w-0.5 rounded-full bg-signal" />
                <span className="h-4 w-0.5 rounded-full bg-fg" />
              </span>
            </span>
            <span className="flex flex-col">
              <span className="font-display text-lg leading-none tracking-tight">Six</span>
              <span className="mt-1 text-[11px] tracking-[0.16em] text-faint uppercase">1:3 test journal</span>
            </span>
          </Link>
          {onSettings ? (
            <Link to="/" className="press flex h-11 items-center rounded-full px-3 text-sm text-muted ring-1 ring-line">
              Close
            </Link>
          ) : (
            <Link
              to="/settings"
              aria-label="Settings"
              className="press flex size-11 items-center justify-center rounded-full text-muted ring-1 ring-line"
            >
              <Settings className="size-5" strokeWidth={1.75} />
            </Link>
          )}
        </header>
        <main className="flex-1 px-4 pb-32 pt-4">{children}</main>
        <nav className="safe-nav pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4">
          <div className="pointer-events-auto mx-auto flex max-w-md rounded-full bg-surface/90 p-1 ring-1 ring-line backdrop-blur-xl">
            {NAV.map((item) => {
              const on = item.to === "/" ? path === "/" : path.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "press flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium",
                    on ? "bg-raised text-signal" : "text-faint",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
