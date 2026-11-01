"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { claimTickets, giftFromHash } from "@/lib/client/gift";
import { checkKeyPins, pruneTickets, sessionSecret, ticketTotal, type Ticket } from "@/lib/client/tickets";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";
import { GiftPanel } from "./gift-panel";
import { ShopPanel } from "./shop-panel";
import { useStatus } from "./use-status";

const fmt = (n: number) => n.toLocaleString("en-US");
type Tab = "chat" | "credits";
const tabFromHash = (): Tab | null => (location.hash === "#credits" ? "credits" : location.hash === "#chat" ? "chat" : null);

// The product itself: chat on one tab, the credit shop on the other. Links to
// #chat or #credits anywhere on the page switch the tab.
export function BlindfoldApp() {
  const { status, error } = useStatus();
  const [tab, setTab] = useState<Tab>("chat");
  const [tickets, setTickets] = useState(0);
  const [session, setSession] = useState(0);
  const [keysChanged, setKeysChanged] = useState(false);
  const [gift, setGift] = useState<Ticket[] | null>(null);
  const [giftNote, setGiftNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
    setTickets(ticketTotal());
    const received = giftFromHash(location.hash);
    if (received) setGift(received);
    const fromHash = tabFromHash();
    if (fromHash) setTab(fromHash);
    const onHash = () => {
      const t = tabFromHash();
      if (t) setTab(t);
    };
    window.addEventListener("hashchange", onHash);
    void api<{ balance: number }>("/api/session", { session: sessionSecret(), tickets: [] })
      .then((r) => setSession(r.balance))
      .catch(() => undefined);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!status) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- comparing server keys to the ones pinned in this browser
    setKeysChanged(!checkKeyPins(status.keys));
    void pruneTickets(status.keys).then((dropped) => dropped && setTickets(ticketTotal()));
  }, [status]);

  if (!status) {
    return (
      <div className="panel flex h-[680px] items-center justify-center p-6 text-mute">
        {error ? <p className="text-warn">{error}</p> : <p className="animate-pulse">Opening Blindfold…</p>}
      </div>
    );
  }

  async function claimGift() {
    if (!gift) return;
    setClaiming(true);
    try {
      const r = await claimTickets(gift);
      if (r.kind === "ok") {
        setSession(r.balance);
        setGiftNote({ ok: true, text: `${fmt(r.credits)} credits are yours. Start asking.` });
      } else {
        setGiftNote({ ok: false, text: r.kind === "taken" ? "Someone already claimed this gift." : "This gift link is not valid any more." });
      }
      setGift(null);
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {
      setGiftNote({ ok: false, text: e instanceof Error ? e.message : "Could not claim the gift. Try again." });
    } finally {
      setClaiming(false);
    }
  }

  const total = tickets + session;
  const giftCredits = gift?.reduce((n, t) => n + t.denom, 0) ?? 0;
  return (
    <div className="panel flex h-[680px] max-h-[88vh] flex-col overflow-hidden">
      {keysChanged && (
        <p className="border-b border-warn/40 bg-warn/10 px-5 py-2 text-xs text-warn">
          The server&apos;s ticket keys changed since your last visit. That can be a normal rotation, or a way to tell people apart. Be careful.
        </p>
      )}
      {gift && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ok/40 bg-ok/10 px-5 py-3 text-sm">
          <p>
            🎁 Someone gifted you <span className="font-mono">{fmt(giftCredits)}</span> anonymous AI credits. First to claim gets them.
          </p>
          <button className="btn btn-main text-sm" onClick={() => void claimGift()} disabled={claiming}>
            {claiming ? "Claiming…" : "Claim"}
          </button>
        </div>
      )}
      {giftNote && <p className={`border-b border-line px-5 py-2 text-sm ${giftNote.ok ? "text-ok" : "text-warn"}`}>{giftNote.text}</p>}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div role="tablist" className="relative flex rounded-full border border-line bg-ink p-1">
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-paper transition-transform duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
            style={{ transform: tab === "credits" ? "translateX(100%)" : "translateX(0)" }}
          />
          {(["chat", "credits"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "relative z-10 w-24 rounded-full py-1.5 text-sm font-medium transition-colors duration-300",
                tab === t ? "text-lilac-ink" : "text-mute hover:text-paper",
              )}
            >
              {t === "chat" ? "Chat" : "Credits"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setTab("credits")}
          className="rounded-full border border-line px-3 py-1.5 font-mono text-xs text-mute transition-colors hover:text-paper"
          title="Tickets in this browser plus your chat balance"
        >
          {fmt(total)} credits
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "chat" ? (
          <ChatPanel
            status={status}
            onCredits={(b) => {
              setSession(b);
              setTickets(ticketTotal());
            }}
          />
        ) : (
          <>
            <ShopPanel status={status} onTickets={() => setTickets(ticketTotal())} />
            <GiftPanel
              tickets={tickets}
              onChange={(b) => {
                setTickets(ticketTotal());
                if (b !== undefined) setSession(b);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
