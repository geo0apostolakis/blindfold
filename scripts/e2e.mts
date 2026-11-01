// End-to-end check of the whole money path against the RUNNING app and the
// local chain, using the same ticket code the browser uses.
//
//   npm run chain   &   npm run setup   &   npm run dev   then   npm run e2e
//
// Local chain only: it signs with anvil's public development keys.
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
});

const { blindTickets, finishTickets, pickTickets, loadTickets, ticketTotal, removeTickets, sha256hex, clearPending } = await import("../lib/client/tickets.ts");
const { claimMessage, blindedDigestInput } = await import("../lib/claim-message.ts");
const { splitDenoms } = await import("../lib/pricing.ts");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const RPC = "http://127.0.0.1:8545";
// A fresh wallet per run, so open quotes from an earlier run never get in the way.
const USER = privateKeyToAccount(generatePrivateKey());
const DEPLOYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex);
const OTHER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9bbf4f5555a7d" as Hex);
const pub = createPublicClient({ chain: foundry, transport: http(RPC) });

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function call(path: string, body?: unknown) {
  const res = await fetch(APP + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test script reading loose JSON
  return { status: res.status, data: (await res.json()) as any };
}

async function transfer(account: ReturnType<typeof privateKeyToAccount>, to: Address, amount: bigint) {
  const w = createWalletClient({ chain: foundry, transport: http(RPC), account });
  const hash = await w.writeContract({ address: status.token.address, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

const status = (await call("/api/status")).data;
check("status loads", !!status.keys?.length, `chain ${status.chain?.id}, demo ${status.demo}, payments ${status.payments}`);
if (status.chain?.id !== 31337) throw new Error("e2e only runs against the local chain");
const spentBefore = status.capacity.spentUsd;

{
  const d = createWalletClient({ chain: foundry, transport: http(RPC), account: DEPLOYER });
  await pub.waitForTransactionReceipt({ hash: await d.sendTransaction({ to: USER.address, value: parseUnits("1", 18) }) });
  const faucetAbi = [{ type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] }] as const;
  await pub.waitForTransactionReceipt({ hash: await d.writeContract({ address: status.token.address, abi: faucetAbi, functionName: "faucet", args: [USER.address, parseUnits("100", 6)] }) });
}

// 1. quote: $2.001125 at 8,000 credits per dollar = 16,009 credits (the odd
// amount yields nine 1-credit tickets, used further down)
const amount = parseUnits("2.001125", 6);
const q = await call("/api/quote", { wallet: USER.address, amountWei: amount.toString() });
check("quote created", q.status === 200 && q.data.quote.credits === 16009, `credits ${q.data.quote?.credits}`);
const quote = q.data.quote;
const again = await call("/api/quote", { wallet: USER.address, amountWei: amount.toString() });
check("second quote returns the open one", again.data.existing === true && again.data.quote.id === quote.id);
check("quote over the max is refused", (await call("/api/quote", { wallet: USER.address, amountWei: parseUnits("10", 6).toString() })).status === 400);
check("quote without the funds is refused", (await call("/api/quote", { wallet: "0x000000000000000000000000000000000000dEaD", amountWei: amount.toString() })).status === 400);

// 2. pay
const txHash = await transfer(USER, status.treasury, amount);

// 3. blind, sign, claim
const pending = await blindTickets(status.keys, splitDenoms(quote.credits), quote.id, quote.credits);
const blinded = pending.items.map((i) => ({ denom: i.denom, blinded: i.blinded }));
const blindedHash = await sha256hex(blindedDigestInput(blinded));
const msg = claimMessage(quote.id, txHash, blindedHash);

const thief = await call("/api/claim", { quoteId: quote.id, txHash, blinded, signature: await OTHER.signMessage({ message: msg }) });
check("claim signed by another wallet is refused", thief.status === 401, thief.data.error);

const signature = await USER.signMessage({ message: msg });
const claim = await call("/api/claim", { quoteId: quote.id, txHash, blinded, signature });
check("claim succeeds", claim.status === 200 && claim.data.sigs.length === blinded.length, `${claim.data.sigs?.length} tickets`);
const tickets = await finishTickets(status.keys, pending, claim.data.sigs);
check("tickets unblind and verify locally", ticketTotal() === 16009, `${tickets.length} tickets worth ${ticketTotal()}`);

const replay = await call("/api/claim", { quoteId: quote.id, txHash, blinded, signature });
check("lost claim can be fetched again", replay.status === 200 && replay.data.replay === true);

// 4. same transfer, new quote: must not mint twice
const q2 = await call("/api/quote", { wallet: USER.address, amountWei: parseUnits("0.625", 6).toString() });
const p2 = await blindTickets(status.keys, splitDenoms(q2.data.quote.credits), q2.data.quote.id, q2.data.quote.credits);
const b2 = p2.items.map((i) => ({ denom: i.denom, blinded: i.blinded }));
const s2 = await USER.signMessage({ message: claimMessage(q2.data.quote.id, txHash, await sha256hex(blindedDigestInput(b2))) });
const reuse = await call("/api/claim", { quoteId: q2.data.quote.id, txHash, blinded: b2, signature: s2 });
check("a transfer cannot be claimed twice", reuse.status === 409, reuse.data.error);

// 4b. the per-wallet daily cap: two full purchases reach 100,000 credits, the
// third request from the same wallet is refused
{
  const buyer = privateKeyToAccount(generatePrivateKey());
  const d = createWalletClient({ chain: foundry, transport: http(RPC), account: DEPLOYER });
  const faucetAbi2 = [{ type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] }] as const;
  await pub.waitForTransactionReceipt({ hash: await d.sendTransaction({ to: buyer.address, value: parseUnits("1", 18) }) });
  await pub.waitForTransactionReceipt({ hash: await d.writeContract({ address: status.token.address, abi: faucetAbi2, functionName: "faucet", args: [buyer.address, parseUnits("100", 6)] }) });
  const fullBuy = parseUnits("6.25", 6); // 50,000 credits, the largest single purchase
  for (let round = 1; round <= 2; round++) {
    const wq = await call("/api/quote", { wallet: buyer.address, amountWei: fullBuy.toString() });
    const wtx = await transfer(buyer, status.treasury, fullBuy);
    const wp = await blindTickets(status.keys, splitDenoms(wq.data.quote.credits), wq.data.quote.id, wq.data.quote.credits);
    const wb = wp.items.map((i) => ({ denom: i.denom, blinded: i.blinded }));
    const ws = await buyer.signMessage({ message: claimMessage(wq.data.quote.id, wtx, await sha256hex(blindedDigestInput(wb))) });
    const wc = await call("/api/claim", { quoteId: wq.data.quote.id, txHash: wtx, blinded: wb, signature: ws });
    check(`large purchase ${round} of 50,000 credits`, wc.status === 200, wc.data.error ?? `${wc.data.sigs?.length} tickets`);
    clearPending();
  }
  const third = await call("/api/quote", { wallet: buyer.address, amountWei: parseUnits("0.625", 6).toString() });
  check("a third purchase the same day hits the per-wallet cap", third.status === 429, third.data.error);
}

// 5. deposit into an anonymous session
const sessionA = (await sha256hex("session-a-" + Date.now())).slice(0, 64);
const sessionB = (await sha256hex("session-b-" + Date.now())).slice(0, 64);
const pick = pickTickets(300)!;
const dep = await call("/api/session", { session: sessionA, tickets: pick });
check("deposit credits the session", dep.status === 200 && dep.data.deposited >= 300, `deposited ${dep.data.deposited}, balance ${dep.data.balance}`);
const dbl = await call("/api/session", { session: sessionB, tickets: pick });
check("a ticket cannot be spent twice", dbl.status === 409);
removeTickets(pick);

const forged = { ...loadTickets().find((t) => t.denom === 1)!, denom: 1000 };
check("a ticket cannot claim a bigger size", (await call("/api/session", { session: sessionB, tickets: [forged] })).status === 400);
const flipped = loadTickets().find((t) => t.denom === 1)!;
const bad = { ...flipped, sig: Buffer.from(Buffer.from(flipped.sig, "base64").map((b, i) => (i === 10 ? b ^ 1 : b))).toString("base64") };
check("a tampered ticket is refused", (await call("/api/session", { session: sessionB, tickets: [bad] })).status === 400);

// 6. chat
const secretPrompt = "my private question " + Math.random().toString(36).slice(2);
const chat = await call("/api/chat", { session: sessionA, model: "deepseek/deepseek-v4-flash", messages: [{ role: "user", content: secretPrompt }] });
check("chat answers and charges", chat.status === 200 && chat.data.charged >= 1, `charged ${chat.data.charged}, balance ${chat.data.balance}`);
check("charge is far below the hold", chat.data.charged < 300);
const empty = await call("/api/chat", { session: sessionB, model: "deepseek/deepseek-v4-flash", messages: [{ role: "user", content: "hi" }] });
check("chat with no credits answers 402", empty.status === 402, `need ${empty.data.need}`);
// Holds are sized from each model's price ceiling: a session holding 9
// credits can afford a cheap message (hold ~6) but not a premium one (~106).
const sessionC = (await sha256hex("session-c-" + Date.now())).slice(0, 64);
const nine = loadTickets().filter((t) => t.denom === 1).slice(0, 9);
if (nine.length === 9) {
  await call("/api/session", { session: sessionC, tickets: nine });
  removeTickets(nine);
}
const premium = await call("/api/chat", { session: sessionC, model: "anthropic/claude-sonnet-5.5", messages: [{ role: "user", content: "hi" }] });
check("premium model needs a bigger hold than 9 credits", premium.status === 402, `need ${premium.data.need}, have ${premium.data.available}`);
const cheap = await call("/api/chat", { session: sessionC, model: "deepseek/deepseek-v4-flash", messages: [{ role: "user", content: "hi" }] });
check("the cheap model fits in the same 9 credits", cheap.status === 200, `charged ${cheap.data.charged}`);
check("unknown model is refused", (await call("/api/chat", { session: sessionA, model: "openai/o9-ultra", messages: [{ role: "user", content: "hi" }] })).status === 400);

// 7. the store must hold no prompt and no wallet-to-session link
const { readFileSync } = await import("node:fs");
const raw = readFileSync(process.env.BLINDFOLD_STORE_FILE ?? ".data/store.json", "utf8");
check("prompt never written to the store", !raw.includes(secretPrompt));
const store = JSON.parse(raw);
check("sessions are keyed by hash, not by the secret", !raw.includes(sessionA) && Object.keys(store.sessions).length > 0);
check("no session record contains a wallet", !JSON.stringify(store.sessions).toLowerCase().includes(USER.address.toLowerCase().slice(2)));

const after = (await call("/api/status")).data;
check("real spend is tracked", after.capacity.spentUsd > spentBefore, `$${after.capacity.spentUsd}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
