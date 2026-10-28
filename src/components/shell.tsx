import { Link, useRouterState } from "@tanstack/react-router";
import { CandlestickChart, LayoutDashboard, ListChecks, NotebookPen, Orbit, Settings } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/accounts";
import { EnterScreen } from "@/components/auth/enter";
import { initialData, useJournal } from "@/lib/journal/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Desk", icon: LayoutDashboard },
  { to: "/chart", label: "Chart", icon: CandlestickChart },
  { to: "/setups", label: "Trades", icon: ListChecks },
  { to: "/journal", label: "Day", icon: NotebookPen },
  { to: "/cycle", label: "Cycle", icon: Orbit },
] as const;

function loadUserJournal() {
  useJournal.setState({ ...initialData(), hydrated: false });
  void Promise.resolve(useJournal.persist.rehydrate());
}

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const session = useSession();
  const wide = path.startsWith("/chart");

  useEffect(() => {
    if (session) loadUserJournal();
  }, [session?.id]);

  if (!session) {
    return (
      <div className="min-h-dvh text-fg">
        <EnterScreen onEnter={loadUserJournal} />
        <BrandMarks />
      </div>
    );
  }

  const onSettings = path.startsWith("/settings");

  return (
    <div className="min-h-dvh text-fg">
      <div className={cn("mx-auto flex min-h-dvh w-full flex-col", wide ? "max-w-6xl" : "max-w-md")}>
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
              <span className="mt-1 max-w-40 truncate text-[11px] tracking-[0.14em] text-faint uppercase">{session.name}</span>
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
        <main className="flex-1 px-4 pb-36 pt-4">{children}</main>
        <nav className="safe-nav pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3">
          <div className="pointer-events-auto mx-auto flex max-w-6xl rounded-full bg-surface/90 p-1 ring-1 ring-line backdrop-blur-xl">
            {NAV.map((item) => {
              const on = item.to === "/" ? path === "/" : path.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "press flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium",
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
      <BrandMarks />
    </div>
  );
}

function BrandMarks() {
  return (
    <>
      <a
        href="https://wa.me/2349150538944"
        target="_blank"
        rel="noreferrer"
        className="press fixed bottom-24 left-3 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-[#25D366] px-3 text-sm font-medium text-[#06210f]"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.4a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2Zm5.76 13.92c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.42-.14-.95-.31-1.64-.6-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.28.64-.41 1.02-.41h.37c.12 0 .28-.04.44.34.17.4.57 1.39.62 1.49.06.1.1.22.02.36-.08.14-.12.22-.24.34-.12.12-.25.27-.36.36-.12.1-.24.22-.1.43.14.2.62 1.02 1.33 1.66.92.82 1.69 1.08 1.93 1.2.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.18 1.26Z"
          />
        </svg>
        09150538944
      </a>
      <p className="pointer-events-none fixed bottom-24 right-3 z-30 font-gothic text-xl leading-none text-fg/30">
        Created by Dux
      </p>
    </>
  );
}
