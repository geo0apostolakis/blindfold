// The browser's ticket wallet. Tickets are made, unblinded and kept here; the
// server only ever sees them blinded (at claim) or finished (at deposit), and
// cannot match one to the other.
import { RSABSSA } from "@cloudflare/blindrsa-ts";

const suite = RSABSSA.SHA384.PSS.Randomized();

export type Ticket = { denom: number; prepared: string; sig: string };
export type PublicKeyInfo = { denom: number; spki: string; fingerprint: string };
export type Pending = {
  quoteId: string;
  credits: number;
  wallet?: string;
  amountWei?: string;
  txHash?: string;
  signature?: string;
  items: { denom: number; prepared: string; inv: string; blinded: string }[];
};

const KEYS = { tickets: "blindfold.tickets.v1", pending: "blindfold.pending.v1", session: "blindfold.session.v1", pins: "blindfold.keypins.v1" };

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

const imported = new Map<string, Promise<CryptoKey>>();
function importKey(spki: string) {
  if (!imported.has(spki)) {
    imported.set(spki, crypto.subtle.importKey("spki", fromB64(spki), { name: "RSA-PSS", hash: "SHA-384" }, true, ["verify"]));
  }
  return imported.get(spki)!;
}
const keyFor = (keys: PublicKeyInfo[], denom: number) => {
  const k = keys.find((x) => x.denom === denom);
  if (!k) throw new Error(`no key for ${denom}-credit tickets`);
  return k;
};

/** Remembers the server's ticket keys the first time they are seen. If they
 *  ever change, a server could be handing each person their own key to track
 *  them, so the app says so instead of staying quiet. */
export function checkKeyPins(keys: PublicKeyInfo[]): boolean {
  const pins = read<Record<string, string>>(KEYS.pins, {});
  let same = true;
  for (const k of keys) {
    if (pins[k.denom] && pins[k.denom] !== k.fingerprint) same = false;
  }
  // Warned once per change: the new keys become the pins, so the next swap is
  // still caught but this one does not warn on every visit forever.
  write(KEYS.pins, Object.fromEntries(keys.map((k) => [k.denom, k.fingerprint])));
  return same;
}

/** Drops stored tickets the server's current keys do not accept. After a key
 *  rotation (testnet to mainnet) old tickets can never be spent, and counting
 *  them would show credits that do not exist. */
export async function pruneTickets(keys: PublicKeyInfo[]): Promise<number> {
  const all = loadTickets();
  const keep: Ticket[] = [];
  for (const t of all) {
    const k = keys.find((x) => x.denom === t.denom);
    if (k && (await suite.verify(await importKey(k.spki), fromB64(t.sig), fromB64(t.prepared)).catch(() => false))) keep.push(t);
  }
  if (keep.length !== all.length) write(KEYS.tickets, keep);
  return all.length - keep.length;
}

export async function blindTickets(keys: PublicKeyInfo[], denoms: number[], quoteId: string, credits: number): Promise<Pending> {
  const items = [];
  for (const denom of denoms) {
    const pk = await importKey(keyFor(keys, denom).spki);
    const prepared = suite.prepare(crypto.getRandomValues(new Uint8Array(32)));
    const { blindedMsg, inv } = await suite.blind(pk, prepared);
    items.push({ denom, prepared: toB64(prepared), inv: toB64(inv), blinded: toB64(blindedMsg) });
  }
  const pending = { quoteId, credits, items };
  savePending(pending); // before anything is sent: a closed tab must not lose paid tickets
  return pending;
}

export async function finishTickets(keys: PublicKeyInfo[], pending: Pending, sigs: { denom: number; blindSig: string }[]): Promise<Ticket[]> {
  if (sigs.length !== pending.items.length) throw new Error("server returned the wrong number of signatures");
  const out: Ticket[] = [];
  for (const [i, item] of pending.items.entries()) {
    const pk = await importKey(keyFor(keys, item.denom).spki);
    // finalize also checks the signature against the published key, so a
    // ticket signed with any other key is refused here.
    const sig = await suite.finalize(pk, fromB64(item.prepared), fromB64(sigs[i].blindSig), fromB64(item.inv));
    out.push({ denom: item.denom, prepared: item.prepared, sig: toB64(sig) });
  }
  addTickets(out);
  clearPending();
  return out;
}

export const loadTickets = () => read<Ticket[]>(KEYS.tickets, []);
export const ticketTotal = (t: Ticket[] = loadTickets()) => t.reduce((n, x) => n + x.denom, 0);
export function addTickets(more: Ticket[]) {
  write(KEYS.tickets, [...loadTickets(), ...more]);
}
export function removeTickets(gone: Ticket[]) {
  const drop = new Set(gone.map((t) => t.prepared));
  write(KEYS.tickets, loadTickets().filter((t) => !drop.has(t.prepared)));
}

export const loadPending = () => read<Pending | null>(KEYS.pending, null);
export const savePending = (p: Pending) => write(KEYS.pending, p);
export const clearPending = () => localStorage.removeItem(KEYS.pending);

/** Tickets to deposit to cover `need` credits: smallest first, so the server
 *  sees small top-ups that look like everyone else's, not one big redeem. */
export function pickTickets(need: number, tickets: Ticket[] = loadTickets()): Ticket[] | null {
  const sorted = [...tickets].sort((a, b) => a.denom - b.denom);
  const picked: Ticket[] = [];
  let sum = 0;
  for (const t of sorted) {
    if (sum >= need) break;
    picked.push(t);
    sum += t.denom;
  }
  if (sum < need) return null;
  // Drop small tickets that a single larger one already made redundant.
  while (picked.length > 1 && sum - picked[0].denom >= need) sum -= picked.shift()!.denom;
  return picked;
}

/** The chat identity: 32 random bytes made here, never tied to a wallet. */
export function sessionSecret(): string {
  let s = read<string | null>(KEYS.session, null);
  if (!s) {
    s = hex(crypto.getRandomValues(new Uint8Array(32)));
    write(KEYS.session, s);
  }
  return s;
}
export function newSession(): string {
  localStorage.removeItem(KEYS.session);
  return sessionSecret();
}

export async function sha256hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}
