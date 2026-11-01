"use client";
import { creditsForUsd } from "@/lib/pricing";
import { useStatus } from "./use-status";

const fmt = (n: number) => n.toLocaleString("en-US");

// Live numbers, read from /api/status. Public on purpose: anyone can check
// that every credit sold is backed by real AI budget.
export function LiveStats() {
  const { status } = useStatus();
  const c = status?.capacity;
  const perDollar = creditsForUsd(1);
  const total = c ? c.spentUsd + c.remainingUsd : 0;
  const leftPct = c && total > 0 ? (c.remainingUsd / total) * 100 : 100;

  const cards = [
    {
      label: "Paid in",
      value: c ? `$${c.paidInUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "…",
      note: "Every dollar ever turned into credits.",
    },
    {
      label: "Credits per dollar",
      value: `${fmt(perDollar)} credits`,
      note: "Roughly that many short prompts on the default model.",
    },
    {
      label: "AI budget left",
      value: c ? `$${c.remainingUsd.toFixed(2)}` : "…",
      note: c?.soldOut ? "Cap reached. New credits are paused; existing credits keep working." : "New credits stop before this runs out, never after.",
      bar: leftPct,
    },
    {
      label: "Messages answered",
      value: c ? fmt(c.messages) : "…",
      note: "Counted, never stored. Zero prompts written to disk.",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((k, i) => (
        <div key={k.label} data-reveal style={{ "--delay": `${i * 90}ms` } as React.CSSProperties} className="panel p-6">
          <p className="text-sm text-paper">{k.label}</p>
          <p className="mt-2 text-3xl font-medium tracking-tight tabular-nums">{k.value}</p>
          <p className="mt-2 text-sm text-mute">{k.note}</p>
          {k.bar !== undefined && (
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ink-3">
              <div className="h-full rounded-full bg-paper transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(2, k.bar)}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
