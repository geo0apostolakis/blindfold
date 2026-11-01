import "server-only";
import { createPublicClient, erc20Abi, http, isAddressEqual, parseEventLogs, type Address, type Hash } from "viem";
import { CHAIN, PAYMENTS_ON, RPC_URL, TOKEN, TREASURY } from "./config";
import { fail } from "./http";
import { LIMITS } from "./limits";

export const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

// Checked once per process. A config pointing the coin at one chain and the
// RPC at another makes every read return nothing, and nothing would say why.
const g = globalThis as unknown as { __blindfoldChainCheck?: Promise<void> };
export function assertChain() {
  return (g.__blindfoldChainCheck ??= (async () => {
    const id = await client.getChainId();
    if (id !== CHAIN.id) {
      throw new Error(`RPC ${RPC_URL} is chain ${id}, but the app is configured for ${CHAIN.name} (${CHAIN.id})`);
    }
    if (!PAYMENTS_ON) return;
    const code = await client.getCode({ address: TOKEN.address });
    if (!code || code === "0x") {
      throw new Error(`NEXT_PUBLIC_BLINDFOLD_TOKEN ${TOKEN.address} has no contract code on ${CHAIN.name}`);
    }
  })().catch((e) => {
    g.__blindfoldChainCheck = undefined; // retry on the next request
    throw e;
  }));
}

/** For the money routes: without a coin and a treasury there is nothing to pay. */
export function assertPayments() {
  if (!PAYMENTS_ON) fail(409, "Buying credits is not set up on this server yet. Chat still works in demo mode.");
}

export async function tokenBalance(wallet: Address): Promise<bigint> {
  return client.readContract({ address: TOKEN.address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
}

export type RedeemCheck =
  | { ok: true; amount: bigint; txKey: string }
  | { ok: false; reason: string; retry?: boolean };

/** Finds a stablecoin transfer from `wallet` to the treasury in `txHash` worth at
 *  least `minAmount`, with enough confirmations. */
export async function checkRedeemTx(txHash: Hash, wallet: Address, minAmount: bigint): Promise<RedeemCheck> {
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { ok: false, reason: "Transfer not found yet. Wait for it to confirm.", retry: true };
  }
  if (receipt.status !== "success") return { ok: false, reason: "That transfer failed on chain." };
  const head = await client.getBlockNumber();
  if (head - receipt.blockNumber + 1n < BigInt(LIMITS.confirmations)) {
    return { ok: false, reason: "Transfer still confirming.", retry: true };
  }
  const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs });
  const match = logs.find(
    (l) =>
      isAddressEqual(l.address, TOKEN.address) &&
      isAddressEqual(l.args.from, wallet) &&
      isAddressEqual(l.args.to, TREASURY) &&
      l.args.value >= minAmount,
  );
  if (!match) return { ok: false, reason: `No ${TOKEN.symbol} transfer from this wallet to the treasury of at least the quoted amount in that transaction.` };
  return { ok: true, amount: match.args.value, txKey: `${CHAIN.id}:${txHash.toLowerCase()}:${match.logIndex}` };
}
