"use client";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError, api, type Status } from "@/lib/client/api";
import { loadTickets, pickTickets, removeTickets, sessionSecret, sha256hex, type Ticket } from "@/lib/client/tickets";
import { holdCredits } from "@/lib/pricing";
import { ShareCard } from "./share-card";
import { PromptInput } from "./ui/ai-chat-input";

type Msg = { role: "user" | "assistant"; content: string; charged?: number; model?: string };
const CHAT_KEY = "blindfold.chat.v1";

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function ticketHash(t: Ticket) {
  const d = await crypto.subtle.digest("SHA-256", fromB64(t.prepared));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** The most recent messages that fit the server's limits, newest last. Older
 *  ones are dropped from what is sent (never from the screen), so a long chat
 *  keeps working instead of being refused. */
function historyToSend(all: Msg[], maxMessages: number, maxChars: number) {
  const out: { role: Msg["role"]; content: string }[] = [];
  let chars = 0;
  for (let i = all.length - 1; i >= 0 && out.length < maxMessages; i--) {
    const m = all[i];
    if (chars + m.content.length > maxChars) break;
    chars += m.content.length;
    out.unshift({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return { history: out, chars };
}

export function ChatPanel({ status, onCredits }: { status: Status; onCredits: (sessionBalance: number) => void }) {
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [model, setModel] = useState(status.models[0].id);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverView, setServerView] = useState(false);
  const [sessionTag, setSessionTag] = useState("");
  const [sharing, setSharing] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    // The server keys a session by the hash of its secret; show the same thing.
    void sha256hex(sessionSecret()).then((h) => setSessionTag(h.slice(0, 12)));
  }, []);

  const chosen = status.models.find((m) => m.id === model) ?? status.models[0];

  // Top the anonymous session up with just enough tickets for this message.
  // Small, just-in-time deposits look like everyone else's.
  async function ensureCredits(need: number) {
    const session = sessionSecret();
    for (let tries = 0; tries < 3; tries++) {
      const { balance } = await api<{ balance: number }>("/api/session", { session, tickets: [] });
      if (balance >= need) return;
      const picked = pickTickets(need - balance);
      if (!picked) throw new Error("Not enough credits for this message. Get more in the Credits tab.");
      try {
        const res = await api<{ balance: number }>("/api/session", { session, tickets: picked });
        removeTickets(picked);
        onCredits(res.balance);
      } catch (e) {
        // Tickets spent elsewhere (another tab, a lost response): drop them.
        if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body.spent)) {
          const spent = new Set(e.body.spent as string[]);
          const gone: Ticket[] = [];
          for (const t of loadTickets()) if (spent.has(await ticketHash(t))) gone.push(t);
          removeTickets(gone);
          continue;
        }
        throw e;
      }
    }
  }

  async function send(text: string) {
    text = text.trim();
    if (!text || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    const { history, chars } = historyToSend(next, status.limits.maxHistoryMessages, status.limits.maxPromptChars);
    try {
      await ensureCredits(holdCredits(chosen.price, chars, status.limits.maxOutputTokens));
      type Reply = { reply: string; charged: number; balance: number };
      let res: Reply;
      try {
        res = await api<Reply>("/api/chat", { session: sessionSecret(), model, messages: history });
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 402)) throw e;
        await ensureCredits(Number(e.body.need) || 1);
        res = await api<Reply>("/api/chat", { session: sessionSecret(), model, messages: history });
      }
      setMessages([...next, { role: "assistant", content: res.reply, charged: res.charged, model: chosen.label }]);
      onCredits(res.balance);
    } catch (e) {
      setMessages(messages);
      setInput(text);
      setError(e instanceof Error ? e.message : "The message did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <p className="text-sm text-mute">{serverView ? "Showing what our server receives" : "Private chat"}</p>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <span className={serverView ? "text-paper" : "text-mute"}>What our server sees</span>
          <button
            role="switch"
            aria-checked={serverView}
            onClick={() => setServerView((v) => !v)}
            className={`relative h-6 w-11 rounded-full border border-line transition-colors duration-300 ${serverView ? "bg-paper" : "bg-ink"}`}
          >
            <span
              className={`absolute top-0.5 size-4.5 rounded-full transition-[left,background-color] duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${serverView ? "left-[22px] bg-ink" : "left-0.5 bg-mute"}`}
            />
          </button>
        </label>
      </div>

      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
            <img src="/logo.svg" alt="" width={56} height={56} className="rounded-2xl opacity-90" />
            <p className="mt-4 text-lg text-paper">Ask anything.</p>
            <p className="mt-1 max-w-xs text-sm text-mute">Paid with anonymous tickets, never your wallet. Flip the switch to see what our server receives.</p>
          </div>
        )}
        {messages.map((m, i) =>
          serverView && m.role === "user" ? (
            <ServerRecord key={i} text={m.content} session={sessionTag} />
          ) : m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="whitespace-pre-wrap rounded-3xl bg-paper px-4 py-2.5 leading-relaxed text-lilac-ink">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="max-w-[95%] animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="answer text-[15px] text-paper">
                <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
              </div>
              <div className="mt-2 flex items-center gap-3 font-mono text-xs text-mute">
                {m.charged !== undefined && (
                  <span>
                    {m.charged} credit{m.charged === 1 ? "" : "s"}
                  </span>
                )}
                <button className="underline-offset-4 transition-colors hover:text-paper hover:underline" onClick={() => setSharing(i)}>
                  Share as card
                </button>
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-1.5 text-mute" aria-label="Thinking">
            {[0, 150, 300].map((d) => (
              <span key={d} className="size-1.5 animate-pulse rounded-full bg-mute" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      {sharing !== null && messages[sharing] && (
        <ShareCard
          answer={messages[sharing].content}
          question={messages[sharing - 1]?.role === "user" ? messages[sharing - 1].content : null}
          model={messages[sharing].model ?? null}
          onClose={() => setSharing(null)}
        />
      )}
      {error && <p className="px-5 pb-2 text-sm text-warn">{error}</p>}
      <div className="px-4 pb-4 pt-2">
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={(v) => void send(v)}
          models={status.models.map((m) => ({ id: m.id, label: m.label, hint: `~${m.typicalCredits} cr` }))}
          model={model}
          onModelChange={setModel}
          busy={busy}
          placeholder="Ask something you would not ask with your name on it"
        />
        {messages.length > 0 && (
          <button className="mx-auto mt-3 block text-xs text-mute underline-offset-4 hover:underline" onClick={() => setMessages([])}>
            Clear this chat from this device
          </button>
        )}
      </div>
    </div>
  );
}

// What the server receives for one message, field by field. The bars cover
// what it never gets.
function ServerRecord({ text, session }: { text: string; session: string }) {
  const rows: [string, React.ReactNode][] = [
    ["Wallet", <span key="w" className="redact font-mono">0x00000000000000000000</span>],
    ["Name or account", <span key="n" className="redact" style={{ "--d": "80ms" } as React.CSSProperties}>no account exists</span>],
    ["IP address saved", <span key="i" className="redact" style={{ "--d": "160ms" } as React.CSSProperties}>never stored</span>],
    ["Session", <span key="s" className="font-mono">{session}…</span>],
    ["Message", <span key="m" className="whitespace-pre-wrap">{text}</span>],
  ];
  return (
    <div className="rounded-2xl border border-line bg-ink p-4 text-sm animate-in fade-in duration-300">
      <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-mute">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-mute">The message is passed to the AI and not saved. The session is a random number made by this browser.</p>
    </div>
  );
}
