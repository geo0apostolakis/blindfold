"use client";
import { useStatus } from "./use-status";

// The model price list, read live. Credits per typical message come from each
// model's price ceiling, so the real charge is usually a little lower.
export function LivePricing() {
  const { status } = useStatus();
  if (!status) return <p className="p-6 text-mute">Loading live prices…</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left">
        <thead className="text-sm text-mute">
          <tr className="border-b border-line">
            <th className="px-6 py-4 font-normal">Model</th>
            <th className="px-6 py-4 font-normal">A typical message</th>
            <th className="px-6 py-4 font-normal">In dollars</th>
          </tr>
        </thead>
        <tbody>
          {status.models.map((m) => (
            <tr key={m.id} className="border-b border-line last:border-0">
              <td className="px-6 py-4">
                <span className="text-paper">{m.label}</span>
                <span className="block text-sm text-mute">{m.blurb}</span>
              </td>
              <td className="px-6 py-4 font-mono text-sm">
                about {m.typicalCredits} credit{m.typicalCredits === 1 ? "" : "s"}
              </td>
              <td className="px-6 py-4 font-mono text-sm text-mute">${(m.typicalCredits * status.pricing.creditUsd).toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
