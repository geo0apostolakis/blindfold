// Proves the shop sells out instead of overselling. Run the app with a tiny
// budget and its own store first:
//
//   OPENROUTER_API_KEY= OPENROUTER_BUDGET_USD=0.85 BLINDFOLD_STORE_FILE=.data/soldout.json npx next dev -p 3006
//   APP_URL=http://localhost:3006 npm run soldout
//
// Demo mode (no key), budget $0.85 minus the $0.10 minimum buffer leaves $0.75
// of real cost: 9,000 credits at the 1.2 markup. $1 buys 8,000 credits.
// Local chain only.
import { createPublicClient, createWalletClient, http, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const APP = process.env.APP_URL ?? "http://localhost:3006";
const RPC = "http://127.0.0.1:8545";
const DEPLOYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex);
const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const faucetAbi = [{ type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] }] as const;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};
const call = async (path: string, body?: unknown) => {
  const res = await fetch(APP + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test script reading loose JSON
  return { status: res.status, data: (await res.json()) as any };
};

const status = (await call("/api/status")).data;
if (status.chain.id !== 31337) throw new Error("local chain only");
check("budget is the tiny test budget", status.capacity.budgetUsd === 0.85, `${status.capacity.availableCredits} credits available`);

async function freshWallet() {
  const user = privateKeyToAccount(generatePrivateKey());
  const d = createWalletClient({ chain: foundry, transport: http(RPC), account: DEPLOYER });
  await pub.waitForTransactionReceipt({ hash: await d.writeContract({ address: status.token.address, abi: faucetAbi, functionName: "faucet", args: [user.address, parseUnits("100", 6)] }) });
  return user;
}

const a = await freshWallet();
const b = await freshWallet();
const big = await call("/api/quote", { wallet: a.address, amountWei: parseUnits("1.25", 6).toString() }); // 10,000 credits
check("a purchase bigger than what is left is refused", big.status === 409 && big.data.soldOut === true, big.data.error);
const small = await call("/api/quote", { wallet: a.address, amountWei: parseUnits("1.09375", 6).toString() }); // 8,750 credits
check("a purchase that fits is quoted", small.status === 200, `${small.data.quote?.credits} credits`);
const second = await call("/api/quote", { wallet: b.address, amountWei: parseUnits("1.09375", 6).toString() });
check("the next one no longer fits, because the first is reserved", second.status === 409, second.data.error);
const after = (await call("/api/status")).data;
check("status shows sold out", after.capacity.soldOut === true, `${after.capacity.availableCredits} credits left`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
