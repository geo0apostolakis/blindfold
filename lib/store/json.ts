import "server-only";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Quote, Session, Snapshot, Store } from "./types";

type State = {
  version: 1;
  spentUsd: number;
  issuedCredits: number;
  chargedCredits: number;
  messages: number;
  quotes: Record<string, Quote>;
  usedTx: Record<string, string>; // txKey -> quoteId
  spentTickets: Record<string, 1>; // sha256(ticket) -> 1
  sessions: Record<string, Session>; // sha256(session secret) -> session
  global: { minute: number; count: number };
};

const empty = (): State => ({
  version: 1,
  spentUsd: 0,
  issuedCredits: 0,
  chargedCredits: 0,
  messages: 0,
  quotes: {},
  usedTx: {},
  spentTickets: {},
  sessions: {},
  global: { minute: 0, count: 0 },
});

// Every operation that reads and then writes runs inside `locked`, one at a
// time. That is what stops two deposits of the same ticket from both passing
// the "not spent yet" check.
export class JsonStore implements Store {
  readonly backend: string;
  private state: State;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private file: string) {
    this.backend = `json (${path.relative(process.cwd(), file)})`;
    mkdirSync(path.dirname(file), { recursive: true });
    this.state = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as State) : empty();
  }

  private locked<T>(fn: (s: State) => T): Promise<T> {
    const run = this.queue.then(() => {
      const out = fn(this.state);
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state));
      renameSync(tmp, this.file);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private session(s: State, key: string): Session {
    return (s.sessions[key] ??= { balance: 0, held: 0, minute: 0, count: 0 });
  }

  private reserved(s: State, now: number) {
    let total = 0;
    for (const q of Object.values(s.quotes)) if (q.status === "open" && q.expiresAt > now) total += q.credits;
    return total;
  }

  private paidIn(s: State) {
    let total = 0n;
    for (const q of Object.values(s.quotes)) if (q.status === "claimed") total += BigInt(q.amountWei);
    return total.toString();
  }

  async snapshot(now: number): Promise<Snapshot> {
    const s = this.state;
    return {
      spentUsd: s.spentUsd,
      issuedCredits: s.issuedCredits,
      chargedCredits: s.chargedCredits,
      reservedCredits: this.reserved(s, now),
      messages: s.messages,
      redeemedWei: this.paidIn(s),
    };
  }

  async getQuote(id: string) {
    return this.state.quotes[id] ?? null;
  }

  createQuote(quote: Quote, fits: (snap: Snapshot) => boolean, walletDailyMax: number) {
    return this.locked((s) => {
      const open = Object.values(s.quotes).find(
        (q) => q.wallet === quote.wallet && q.status === "open" && q.expiresAt > quote.createdAt,
      );
      if (open) return { kind: "existing" as const, quote: open };
      // Credits this wallet took (or holds a live quote for) in the last 24h.
      let used = 0;
      for (const q of Object.values(s.quotes)) {
        if (q.wallet !== quote.wallet || q.createdAt <= quote.createdAt - 86_400_000) continue;
        if (q.status === "claimed" || q.expiresAt > quote.createdAt) used += q.credits;
      }
      if (used + quote.credits > walletDailyMax) return { kind: "wallet-cap" as const, used };
      const snap: Snapshot = {
        spentUsd: s.spentUsd,
        issuedCredits: s.issuedCredits,
        chargedCredits: s.chargedCredits,
        reservedCredits: this.reserved(s, quote.createdAt),
        messages: s.messages,
        redeemedWei: this.paidIn(s),
      };
      if (!fits(snap)) return { kind: "sold-out" as const };
      s.quotes[quote.id] = quote;
      return { kind: "created" as const, quote };
    });
  }

  claimQuote(args: Parameters<Store["claimQuote"]>[0]) {
    return this.locked((s) => {
      const q = s.quotes[args.quoteId];
      if (!q) return { kind: "not-open" as const };
      if (q.status === "claimed") {
        return q.claim && q.claim.blindedHash === args.blindedHash
          ? { kind: "replay" as const, sigs: q.claim.sigs }
          : { kind: "not-open" as const };
      }
      if (q.expiresAt <= args.now) return { kind: "not-open" as const };
      if (s.usedTx[args.txKey]) return { kind: "tx-used" as const };
      s.usedTx[args.txKey] = q.id;
      q.status = "claimed";
      q.claim = { txKey: args.txKey, blindedHash: args.blindedHash, sigs: args.sigs, claimedAt: args.now };
      s.issuedCredits += args.credits;
      return { kind: "claimed" as const };
    });
  }

  deposit(sessionKey: string, ticketHashes: string[], credits: number) {
    return this.locked((s) => {
      const spent = ticketHashes.filter((h) => s.spentTickets[h]);
      if (spent.length) return { kind: "spent" as const, hashes: spent };
      for (const h of ticketHashes) s.spentTickets[h] = 1;
      const sess = this.session(s, sessionKey);
      sess.balance += credits;
      return { kind: "ok" as const, balance: sess.balance - sess.held };
    });
  }

  async balance(sessionKey: string) {
    const sess = this.state.sessions[sessionKey];
    return { balance: sess ? sess.balance - sess.held : 0, held: sess?.held ?? 0 };
  }

  hold(sessionKey: string, credits: number, now: number, perSession: number, global: number) {
    return this.locked((s) => {
      const minute = Math.floor(now / 60_000);
      const sess = this.session(s, sessionKey);
      if (sess.minute !== minute) Object.assign(sess, { minute, count: 0 });
      if (s.global.minute !== minute) s.global = { minute, count: 0 };
      if (sess.count >= perSession) return { kind: "rate-limited" as const, scope: "session" as const };
      if (s.global.count >= global) return { kind: "rate-limited" as const, scope: "global" as const };
      const available = sess.balance - sess.held;
      if (available < credits) return { kind: "insufficient" as const, available };
      sess.held += credits;
      sess.count += 1;
      s.global.count += 1;
      return { kind: "held" as const };
    });
  }

  settle(sessionKey: string, held: number, charged: number, costUsd: number) {
    return this.locked((s) => {
      const sess = this.session(s, sessionKey);
      sess.held -= held;
      sess.balance -= charged;
      s.chargedCredits += charged;
      s.spentUsd += costUsd;
      s.messages += 1;
      return { balance: sess.balance - sess.held };
    });
  }

  release(sessionKey: string, held: number) {
    return this.locked((s) => {
      this.session(s, sessionKey).held -= held;
    });
  }
}
