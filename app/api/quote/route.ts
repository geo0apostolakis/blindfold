import { randomUUID } from "node:crypto";
import { formatUnits, getAddress, isAddress } from "viem";
import { capacityOf, keyLeft } from "@/lib/capacity";
import { assertChain, assertPayments, tokenBalance } from "@/lib/chain";
import { CHAIN, TOKEN } from "@/lib/config";
import { fail, readJson, route } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { creditsForUsd } from "@/lib/pricing";
import { store } from "@/lib/store";

const fmt = (n: number) => n.toLocaleString("en-US");

// Step 1 of a purchase: price it and hold the capacity for ten minutes, before
// the user sends anything. Selling out is decided here, never after a
// transfer, so nobody can pay for credits that do not exist.
export const POST = route(async (req) => {
  await assertChain();
  assertPayments();
  const body = await readJson<{ wallet?: string; amountWei?: string }>(req);
  if (!body.wallet || !isAddress(body.wallet)) fail(400, "wallet must be an address.");
  if (!body.amountWei || !/^[0-9]{1,40}$/.test(body.amountWei)) fail(400, "amountWei must be a whole number.");
  const wallet = getAddress(body.wallet!);
  const amount = BigInt(body.amountWei!);
  // A dollar stablecoin: the amount is the price, no feed needed.
  const usd = Number(formatUnits(amount, TOKEN.decimals));

  const credits = creditsForUsd(usd);
  if (credits < LIMITS.minRedeemCredits) fail(400, `Pay enough for at least ${fmt(LIMITS.minRedeemCredits)} credits.`);
  if (credits > LIMITS.maxRedeemCredits) fail(400, `Buy at most ${fmt(LIMITS.maxRedeemCredits)} credits at a time.`);

  // Holding the coins is the price of a quote: it stops anyone from reserving
  // the whole budget with quotes they never pay.
  if ((await tokenBalance(wallet)) < amount) fail(400, `This wallet does not hold that much ${TOKEN.symbol}.`);

  const now = Date.now();
  const left = await keyLeft();
  const result = await store.createQuote(
    {
      id: randomUUID(),
      chainId: CHAIN.id,
      wallet: wallet.toLowerCase(),
      amountWei: amount.toString(),
      priceUsd: 1,
      usd,
      credits,
      createdAt: now,
      expiresAt: now + LIMITS.quoteTtlMs,
      status: "open",
    },
    (snap) => !capacityOf(snap, left, credits).soldOut,
    LIMITS.maxCreditsPerWalletPerDay,
  );
  if (result.kind === "wallet-cap") {
    fail(429, `One wallet can take up to ${fmt(LIMITS.maxCreditsPerWalletPerDay)} credits a day. This one has ${fmt(Math.max(0, LIMITS.maxCreditsPerWalletPerDay - result.used))} left today.`);
  }
  if (result.kind === "sold-out") fail(409, "Credits are sold out right now. Existing credits keep working; check back soon.", { soldOut: true });
  return Response.json({ quote: result.quote, existing: result.kind === "existing" });
});
