import "server-only";
import { CREDIT_USD, CHARGE_MARKUP } from "./config";
import { LIMITS } from "./limits";
import { keyRemainingUsd } from "./openrouter";
import { liabilityUsd } from "./pricing";
import type { Snapshot } from "./store";

export type Capacity = {
  remainingUsd: number; // budget left after real spend
  liabilityUsd: number; // worst-case cost of every credit sold and not yet used
  availableUsd: number; // what new redeems may still promise
  availableCredits: number;
  soldOut: boolean;
};

/** How many more credits can be sold with no chance of the budget running
 *  out under the people who already hold credits. Synchronous, so it can run
 *  inside the store's lock; `keyLeftUsd` is fetched beforehand. */
export function capacityOf(snap: Snapshot, keyLeftUsd: number | null, extraCredits = 0): Capacity {
  const local = LIMITS.budgetUsd - snap.spentUsd;
  const remainingUsd = keyLeftUsd === null ? local : Math.min(local, keyLeftUsd);
  const outstanding = snap.issuedCredits - snap.chargedCredits + snap.reservedCredits + extraCredits;
  const liab = liabilityUsd(outstanding);
  const buffer = Math.max(LIMITS.bufferMinUsd, remainingUsd * LIMITS.bufferPct);
  const availableUsd = remainingUsd - buffer - liab;
  return {
    remainingUsd,
    liabilityUsd: liab,
    availableUsd,
    availableCredits: Math.max(0, Math.floor((availableUsd * CHARGE_MARKUP) / CREDIT_USD)),
    soldOut: availableUsd < 0,
  };
}

export const keyLeft = keyRemainingUsd;
