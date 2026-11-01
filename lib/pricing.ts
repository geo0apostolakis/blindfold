// Pure money math, shared by the server and the browser so both always agree
// on what a redeem is worth and what a message costs.
import { CHARGE_MARKUP, CREDIT_USD, DENOMS, REDEEM_RATE, type Denom } from "./config";

export type ModelPrice = { prompt: number; completion: number }; // USD per token

/** Credits a payment of `usd` dollars buys. Always rounds down. */
export function creditsForUsd(usd: number): number {
  if (!(usd > 0)) return 0;
  return Math.floor((usd * REDEEM_RATE) / CREDIT_USD + 1e-9);
}

/** Split credits into ticket sizes, largest first. */
export function splitDenoms(credits: number): Denom[] {
  const out: Denom[] = [];
  let left = credits;
  for (const d of DENOMS) {
    while (left >= d) {
      out.push(d);
      left -= d;
    }
  }
  return out;
}

/** Conservative token estimate: real tokenisers average ~4 chars a token in
 *  English and fewer in other scripts, so 2 over-counts on purpose. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 2) + 16;
}

/** Credits held before a message: its worst case if the model writes the
 *  full output cap. */
export function holdCredits(price: ModelPrice, promptChars: number, maxOutputTokens: number): number {
  const usd = price.prompt * estimateTokens(promptChars) + price.completion * maxOutputTokens;
  return Math.max(1, Math.ceil((usd * CHARGE_MARKUP) / CREDIT_USD));
}

/** Credits charged after a message, from its real cost. Minimum one. */
export function chargeCredits(costUsd: number): number {
  return Math.max(1, Math.ceil((costUsd * CHARGE_MARKUP) / CREDIT_USD - 1e-9));
}

/** The most real money `credits` can ever cost us, since every credit is
 *  charged at cost x markup. */
export function liabilityUsd(credits: number): number {
  return (credits * CREDIT_USD) / CHARGE_MARKUP;
}

/** Typical message (1,000 tokens in, 500 out) in credits, for the price list. */
export function typicalMessageCredits(price: ModelPrice): number {
  return chargeCredits(price.prompt * 1000 + price.completion * 500);
}
