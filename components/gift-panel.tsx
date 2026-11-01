"use client";
import { useEffect, useState } from "react";
import { MAX_GIFT_TICKETS, createGift, forgetGift, loadGifts, maxGift, takeBack, type SentGift } from "@/lib/client/gift";

const fmt = (n: number) => n.toLocaleString("en-US");

// Gift credits as a link. Sits under the shop on the Credits tab.
export function GiftPanel({ tickets, onChange }: { tickets: number; onChange: (sessionBalance?: number) => void }) {
  const [max, setMax] = useState(0);
  const [amount, setAmount] = useState("");
  const [gifts, setGifts] = useState<SentGift[]>([]);
  const [made, setMade] = useState<SentGift | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => {
    setMax(maxGift());
    setGifts(loadGifts());
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- re-read browser storage when the ticket count changes
  useEffect(refresh, [tickets]);

  function make() {
    const want = Math.min(Number(amount) || max, max);
    const g = createGift(want);
    if (!g) return setNote("No tickets in this browser to gift yet. Get credits first.");
    setMade(g);
    setNote(g.credits < want ? `Gifting ${fmt(g.credits)}: the closest your ticket sizes allow.` : null);
    setAmount("");
    refresh();
    onChange();
  }

  async function copy(link: string) {
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setNote("Link copied. Whoever opens it first gets the credits.");
  }

  function post(g: SentGift) {
    const text = `Dropping ${fmt(g.credits)} anonymous AI credits on Blindfold. First to open it gets them. No wallet, no account.`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(g.link)}`, "_blank", "noopener,noreferrer");
  }

  async function reclaim(g: SentGift) {
    const r = await takeBack(g);
    if (made?.id === g.id) setMade(null);
    refresh();
    if (r.kind === "ok") {
      setNote(`${fmt(r.credits)} credits are back in your chat balance.`);
      onChange(r.balance);
    } else setNote(r.kind === "taken" ? "Too late: someone already claimed that gift." : "That gift is no longer valid.");
  }

  return (
    <div className="flex flex-col gap-4 border-t border-line p-5 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold">🎁 Gift credits</h3>
        <p className="mt-1 text-sm text-mute">
          Turn tickets into a link. Send it to a friend or drop it on X: whoever opens it first gets the credits. The tickets ride in the link itself and
          never touch our server until they are claimed.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-2">
          <span className="text-sm text-mute">Credits to gift (up to {fmt(max)} in one link)</span>
          <input
            className="field px-4 py-2.5 font-mono"
            inputMode="numeric"
            placeholder={max ? String(Math.min(1000, max)) : "0"}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </label>
        <button className="btn btn-main" onClick={make} disabled={!max}>
          Create gift link
        </button>
      </div>
      <p className="text-xs text-mute">
        Uses tickets stored in this browser (at most {MAX_GIFT_TICKETS} per link). Credits already moved into your chat balance cannot be gifted.
      </p>

      {made && (
        <div className="rounded-xl border border-ok/40 bg-ok/5 p-4 text-sm">
          <p className="font-medium text-paper">{fmt(made.credits)} credits packed into a link</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-main text-sm" onClick={() => void copy(made.link)}>
              Copy link
            </button>
            <button className="btn btn-quiet text-sm" onClick={() => post(made)}>
              Drop it on X
            </button>
          </div>
        </div>
      )}
      {note && <p className="text-sm text-ok">{note}</p>}

      {gifts.length > 0 && (
        <div>
          <p className="text-sm text-mute">Gifts you made in this browser</p>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
            {gifts.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="font-mono">{fmt(g.credits)} credits</span>
                <span className="flex gap-3 text-xs">
                  <button className="text-paper underline-offset-4 hover:underline" onClick={() => void copy(g.link)}>
                    Copy
                  </button>
                  <button className="text-paper underline-offset-4 hover:underline" onClick={() => void reclaim(g)}>
                    Take back
                  </button>
                  <button className="text-mute underline-offset-4 hover:underline" onClick={() => (forgetGift(g.id), refresh())}>
                    Hide
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
