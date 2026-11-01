import { connection } from "next/server";
import { formatUnits } from "viem";
import { publicKeys } from "@/lib/blind";
import { capacityOf, keyLeft } from "@/lib/capacity";
import { assertChain } from "@/lib/chain";
import { CHAIN, CHAIN_NAME, CHARGE_MARKUP, CREDIT_USD, EXPLORER, MODELS, PAYMENTS_ON, REDEEM_RATE, TOKEN, TREASURY } from "@/lib/config";
import { route } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { isDemo, modelPrices } from "@/lib/openrouter";
import { typicalMessageCredits } from "@/lib/pricing";
import { store } from "@/lib/store";

// Everything the browser needs to price, redeem and chat, in one read. Contains
// nothing about any person.
const handler = route(async () => {
  await assertChain();
  const now = Date.now();
  const [prices, keys, snap, left] = await Promise.all([
    modelPrices(),
    publicKeys(),
    store.snapshot(now),
    keyLeft(),
  ]);
  const cap = capacityOf(snap, left);
  return Response.json({
    chain: { name: CHAIN_NAME, id: CHAIN.id, label: CHAIN.name, explorer: EXPLORER },
    token: TOKEN,
    payments: PAYMENTS_ON,
    treasury: TREASURY,
    demo: isDemo(),
    pricing: { creditUsd: CREDIT_USD, redeemRate: REDEEM_RATE, chargeMarkup: CHARGE_MARKUP },
    limits: {
      minRedeemCredits: LIMITS.minRedeemCredits,
      maxRedeemCredits: LIMITS.maxRedeemCredits,
      maxCreditsPerWalletPerDay: LIMITS.maxCreditsPerWalletPerDay,
      maxOutputTokens: LIMITS.maxOutputTokens,
      maxHistoryMessages: LIMITS.maxHistoryMessages,
      maxPromptChars: LIMITS.maxPromptChars,
      quoteTtlMs: LIMITS.quoteTtlMs,
    },
    capacity: {
      soldOut: cap.availableCredits < LIMITS.minRedeemCredits,
      availableCredits: cap.availableCredits,
      budgetUsd: LIMITS.budgetUsd,
      remainingUsd: Number(cap.remainingUsd.toFixed(4)),
      spentUsd: Number(snap.spentUsd.toFixed(6)),
      messages: snap.messages,
      paidInUsd: Number(formatUnits(BigInt(snap.redeemedWei), TOKEN.decimals)),
    },
    models: MODELS.map((m) => ({ ...m, price: prices[m.id], typicalCredits: typicalMessageCredits(prices[m.id]) })),
    keys,
  });
});

// connection() marks the route as request-time. It stays outside route()'s
// catch, because during the build it rejects on purpose to stop prerendering.
export async function GET(req: Request) {
  await connection();
  return handler(req);
}
