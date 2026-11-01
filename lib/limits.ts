// Every ceiling the app enforces, with the reason for the number. The budget
// is global, so the limits that matter are global too: a per-person limit
// cannot see two hundred honest people draining the same $20.

const num = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return n;
};

export const LIMITS = {
  // What the operator puts on OpenRouter. Also set as the hard limit on the API key
  // itself, so a bug here still cannot spend past it.
  budgetUsd: num("OPENROUTER_BUDGET_USD", 20),

  // Never sell the last 10% of the money actually left (at least $0.10).
  // Holds are sized from price ceilings; this absorbs anything they miss.
  bufferPct: 0.1,
  bufferMinUsd: 0.1,

  // Output cap per answer. Bounds the worst case of a single message.
  maxOutputTokens: 800,

  // Only the last few messages go to the model. Long chats are where cost
  // explodes, because every message resends the whole history.
  maxHistoryMessages: 8,

  // Input cap per request, across the trimmed history.
  maxPromptChars: 12_000,

  // A quote holds capacity for this long, then frees it.
  quoteTtlMs: 10 * 60_000,

  // Smallest purchase in credits ($0.05 of AI). Below this a transfer costs
  // more attention than it buys.
  minRedeemCredits: num("BLINDFOLD_MIN_REDEEM_CREDITS", 500),

  // Largest single redeem in credits ($5 of AI).
  maxRedeemCredits: num("BLINDFOLD_MAX_REDEEM_CREDITS", 50_000),

  // Most credits one wallet can take in 24 hours ($10 of AI). Stops one buyer
  // from taking the whole AI budget in one go. Splitting into many wallets is
  // possible, but costs gas and effort, and the global budget cap still holds.
  maxCreditsPerWalletPerDay: num("BLINDFOLD_MAX_CREDITS_PER_WALLET_DAY", 100_000),

  // Blinded messages signed per claim. The largest redeem (50,000 credits)
  // is 50 tickets of 1,000 plus up to 27 smaller ones.
  maxTicketsPerClaim: 80,

  // Tickets accepted in one deposit.
  maxTicketsPerDeposit: 80,

  // One person typing fast is under this; a script is not.
  chatPerMinutePerSession: 20,

  // Whole site. With cheap models this is ~$0.05 a minute at worst.
  chatPerMinuteGlobal: 120,

  // Blocks to wait on a redeem transfer before crediting it.
  confirmations: num("BLINDFOLD_CONFIRMATIONS", 1),
} as const;
