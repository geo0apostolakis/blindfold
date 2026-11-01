export type Quote = {
  id: string;
  chainId: number;
  wallet: string; // lowercase
  amountWei: string;
  priceUsd: number; // 1: payments are in a dollar stablecoin
  usd: number;
  credits: number;
  createdAt: number;
  expiresAt: number;
  status: "open" | "claimed";
  claim?: {
    txKey: string;
    blindedHash: string;
    // Kept so a claim whose response got lost can be fetched again. Blind
    // signatures reveal nothing about the finished tickets.
    sigs: { denom: number; blindSig: string }[];
    claimedAt?: number;
  };
};

export type Session = {
  balance: number; // credits deposited and not yet charged
  held: number; // credits reserved by messages in flight
  minute: number;
  count: number;
};

export type Snapshot = {
  spentUsd: number;
  issuedCredits: number;
  chargedCredits: number;
  reservedCredits: number;
  messages: number;
  redeemedWei: string; // total stablecoin ever paid in, in base units
};

export type CreateQuoteResult =
  | { kind: "created"; quote: Quote }
  | { kind: "existing"; quote: Quote }
  | { kind: "wallet-cap"; used: number }
  | { kind: "sold-out" };

export type ClaimResult =
  | { kind: "claimed" }
  | { kind: "replay"; sigs: NonNullable<Quote["claim"]>["sigs"] }
  | { kind: "tx-used" }
  | { kind: "not-open" };

export type HoldResult =
  | { kind: "held" }
  | { kind: "insufficient"; available: number }
  | { kind: "rate-limited"; scope: "session" | "global" };

export interface Store {
  readonly backend: string;
  snapshot(now: number): Promise<Snapshot>;
  getQuote(id: string): Promise<Quote | null>;
  createQuote(quote: Quote, fits: (snap: Snapshot) => boolean, walletDailyMax: number): Promise<CreateQuoteResult>;
  claimQuote(args: {
    quoteId: string;
    txKey: string;
    blindedHash: string;
    sigs: NonNullable<Quote["claim"]>["sigs"];
    credits: number;
    now: number;
  }): Promise<ClaimResult>;
  deposit(sessionKey: string, ticketHashes: string[], credits: number): Promise<{ kind: "ok"; balance: number } | { kind: "spent"; hashes: string[] }>;
  balance(sessionKey: string): Promise<{ balance: number; held: number }>;
  hold(sessionKey: string, credits: number, now: number, perSession: number, global: number): Promise<HoldResult>;
  settle(sessionKey: string, held: number, charged: number, costUsd: number): Promise<{ balance: number }>;
  release(sessionKey: string, held: number): Promise<void>;
}
