import { getAddress, isHash, type Hash } from "viem";
import { blindSign, sha256hex } from "@/lib/blind";
import { assertChain, assertPayments, checkRedeemTx, client } from "@/lib/chain";
import { blindedDigestInput, claimMessage } from "@/lib/claim-message";
import { DENOMS, type Denom } from "@/lib/config";
import { b64, fail, readJson, route } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { store } from "@/lib/store";

type Body = {
  quoteId?: string;
  txHash?: string;
  signature?: string;
  blinded?: { denom: number; blinded: string }[];
};

// Step 3 of a purchase: the transfer is on chain, the wallet proves it sent it,
// and the server signs the blinded tickets. The server sees the wallet and the
// blinded tickets, never the finished ones, so it can never tell which
// tickets came from which wallet when they are spent later.
export const POST = route(async (req) => {
  await assertChain();
  assertPayments();
  const body = await readJson<Body>(req);
  const quote = body.quoteId ? await store.getQuote(body.quoteId) : null;
  if (!quote) fail(404, "Unknown quote.");
  if (!body.txHash || !isHash(body.txHash)) fail(400, "txHash must be a transaction hash.");
  if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.signature)) fail(400, "signature is missing.");
  const list = Array.isArray(body.blinded) ? body.blinded : [];
  if (!list.length || list.length > LIMITS.maxTicketsPerClaim) fail(400, `Send between 1 and ${LIMITS.maxTicketsPerClaim} blinded tickets.`);

  let total = 0;
  const parsed = list.map((t, i) => {
    if (!DENOMS.includes(t.denom as Denom)) fail(400, `Ticket ${i} has an unknown size.`);
    total += t.denom;
    return { denom: t.denom as Denom, bytes: b64(t.blinded, `Ticket ${i}`), raw: t.blinded };
  });
  if (total !== quote!.credits) fail(400, `Tickets add up to ${total} credits but the quote is for ${quote!.credits}.`);

  const blindedHash = sha256hex(blindedDigestInput(list));
  const wallet = getAddress(quote!.wallet);
  const signed = await client.verifyMessage({
    address: wallet,
    message: claimMessage(quote!.id, body.txHash!, blindedHash),
    signature: body.signature as Hash,
  });
  if (!signed) fail(401, "That signature is not from the wallet that made this quote.");

  // A claim answered once and lost on the way back can be fetched again.
  if (quote!.status === "claimed") {
    const again = await store.claimQuote({ quoteId: quote!.id, txKey: "", blindedHash, sigs: [], credits: 0, now: Date.now() });
    if (again.kind === "replay") return Response.json({ sigs: again.sigs, replay: true });
    fail(409, "This quote was already claimed.");
  }
  if (quote!.expiresAt <= Date.now()) {
    fail(410, "This quote expired. Get a new quote: your transfer is still claimable with it.", { expired: true });
  }

  const tx = await checkRedeemTx(body.txHash as Hash, wallet, BigInt(quote!.amountWei));
  if (!tx.ok) fail(tx.retry ? 425 : 400, tx.reason, { retry: !!tx.retry });

  // Sign first, record second: if signing broke halfway, nothing is recorded
  // and the transfer stays claimable.
  const sigs = [];
  for (const t of parsed) {
    sigs.push({ denom: t.denom, blindSig: Buffer.from(await blindSign(t.denom, t.bytes)).toString("base64") });
  }
  const result = await store.claimQuote({
    quoteId: quote!.id,
    txKey: tx.ok ? tx.txKey : "",
    blindedHash,
    sigs,
    credits: total,
    now: Date.now(),
  });
  if (result.kind === "tx-used") fail(409, "That transfer was already used for credits.");
  if (result.kind === "not-open") fail(409, "This quote is no longer open.");
  if (result.kind === "replay") return Response.json({ sigs: result.sigs, replay: true });
  return Response.json({ sigs });
});
