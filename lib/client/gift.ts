// Gift links. Tickets are bearer tokens, so a gift is just tickets moved out
// of this browser and packed into the link's #fragment, which browsers never
// send to any server. Whoever opens the link first deposits them into their
// own anonymous session; after that the tickets are spent and the link is dead.
import { ApiError, api } from "./api";
import { loadTickets, removeTickets, sessionSecret, type Ticket } from "./tickets";

export const MAX_GIFT_TICKETS = 8; // keeps the link a few KB, short enough to paste anywhere
const GIFTS_KEY = "blindfold.gifts.v1";
const PREFIX = "#gift=";

export type SentGift = { id: string; credits: number; link: string; createdAt: number };

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const toUrl = (b: Uint8Array) => toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromUrl = (s: string) => fromB64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

/** version 1 | count | per ticket: denom u16 | prepared len u8 | prepared | sig len u16 | sig */
export function encodeGift(tickets: Ticket[]): string {
  const parts: number[] = [1, tickets.length];
  for (const t of tickets) {
    const p = fromB64(t.prepared);
    const s = fromB64(t.sig);
    parts.push(t.denom >> 8, t.denom & 255, p.length, ...p, s.length >> 8, s.length & 255, ...s);
  }
  return toUrl(Uint8Array.from(parts));
}

export function decodeGift(code: string): Ticket[] | null {
  try {
    const b = fromUrl(code);
    if (b[0] !== 1) return null;
    const out: Ticket[] = [];
    let i = 2;
    for (let n = 0; n < b[1]; n++) {
      const denom = (b[i] << 8) | b[i + 1];
      const pl = b[i + 2];
      const prepared = b.slice(i + 3, i + 3 + pl);
      i += 3 + pl;
      const sl = (b[i] << 8) | b[i + 1];
      const sig = b.slice(i + 2, i + 2 + sl);
      i += 2 + sl;
      if (prepared.length !== pl || sig.length !== sl || !denom) return null;
      out.push({ denom, prepared: toB64(prepared), sig: toB64(sig) });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export const giftFromHash = (hash: string) => (hash.startsWith(PREFIX) ? decodeGift(hash.slice(PREFIX.length)) : null);

/** Largest tickets first, never more than `amount` and at most MAX_GIFT_TICKETS. */
export function pickGift(amount: number, tickets: Ticket[] = loadTickets()) {
  const picked: Ticket[] = [];
  let total = 0;
  for (const t of [...tickets].sort((a, b) => b.denom - a.denom)) {
    if (picked.length >= MAX_GIFT_TICKETS) break;
    if (total + t.denom <= amount) {
      picked.push(t);
      total += t.denom;
    }
  }
  return { picked, total };
}

/** The most one link can carry from the tickets in this browser. */
export const maxGift = (tickets: Ticket[] = loadTickets()) => pickGift(Number.MAX_SAFE_INTEGER, tickets).total;

export const loadGifts = (): SentGift[] => {
  try {
    return JSON.parse(localStorage.getItem(GIFTS_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveGifts = (g: SentGift[]) => localStorage.setItem(GIFTS_KEY, JSON.stringify(g));

/** Moves tickets out of this browser into a link. The link is also kept here,
 *  so a sender who loses it can copy it again or take the gift back. */
export function createGift(amount: number): SentGift | null {
  const { picked, total } = pickGift(amount);
  if (!picked.length) return null;
  const gift: SentGift = {
    id: crypto.randomUUID(),
    credits: total,
    link: `${location.origin}/${PREFIX}${encodeGift(picked)}`,
    createdAt: Date.now(),
  };
  saveGifts([gift, ...loadGifts()]);
  removeTickets(picked);
  return gift;
}

export type ClaimOutcome = { kind: "ok"; credits: number; balance: number } | { kind: "taken" } | { kind: "invalid" };

/** Deposits gift tickets into this browser's session, which spends them. */
export async function claimTickets(tickets: Ticket[]): Promise<ClaimOutcome> {
  try {
    const res = await api<{ balance: number; deposited: number }>("/api/session", { session: sessionSecret(), tickets });
    return { kind: "ok", credits: res.deposited, balance: res.balance };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { kind: "taken" };
    if (e instanceof ApiError && e.status === 400) return { kind: "invalid" };
    throw e;
  }
}

/** Takes an unclaimed gift back into the sender's own chat balance. */
export async function takeBack(gift: SentGift): Promise<ClaimOutcome> {
  const tickets = decodeGift(gift.link.slice(gift.link.indexOf(PREFIX) + PREFIX.length));
  const out = tickets ? await claimTickets(tickets) : ({ kind: "invalid" } as const);
  saveGifts(loadGifts().filter((g) => g.id !== gift.id));
  return out;
}

export const forgetGift = (id: string) => saveGifts(loadGifts().filter((g) => g.id !== id));
