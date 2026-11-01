// Sets up the local demo: deploys TestUSD on a running `anvil`, hands test
// dollars to three demo wallets and writes .env.local to match.
//
//   npm run chain     (in one terminal: starts anvil)
//   npm run setup     (in another: this script)
//
// Refuses to run against anything but chain 31337. The keys below are anvil's
// public, well-known development keys; they hold nothing anywhere real.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const RPC = "http://127.0.0.1:8545";
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0 deployer
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // #1 demo user
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9bbf4f5555a7d", // demo user (not an anvil default; funded by this script)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // #3 demo user
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6", // #9 treasury
];

async function main() {
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  const id = await pub.getChainId().catch(() => {
    throw new Error("No chain at 127.0.0.1:8545. Start it first: npm run chain");
  });
  if (id !== 31337) throw new Error(`Refusing: chain at ${RPC} is ${id}, this script is only for the local demo chain 31337.`);

  const artifact = JSON.parse(readFileSync(".forge-out/TestUSD.sol/TestUSD.json", "utf8"));
  const deployer = createWalletClient({ chain: foundry, transport: http(RPC), account: privateKeyToAccount(KEYS[0]) });
  const hash = await deployer.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object });
  const { contractAddress: token } = await pub.waitForTransactionReceipt({ hash });
  if (!token) throw new Error("deploy produced no contract");

  const treasury = privateKeyToAccount(KEYS[4]).address;
  const users = KEYS.slice(1, 4).map((k) => privateKeyToAccount(k).address);
  for (const u of users) {
    const h = await deployer.writeContract({ address: token, abi: artifact.abi, functionName: "faucet", args: [u, parseUnits("1000", 6)] });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  const bal = (await pub.readContract({ address: token, abi: artifact.abi, functionName: "balanceOf", args: [users[0]] })) as bigint;
  if (bal === 0n) throw new Error("faucet ran but the balance is still 0: the token address is wrong");

  const env = [
    "# Written by scripts/local-chain.ts for the local demo chain. Test dollars, no value.",
    "NEXT_PUBLIC_BLINDFOLD_CHAIN=local",
    "NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545",
    `NEXT_PUBLIC_BLINDFOLD_TOKEN=${token}`,
    `NEXT_PUBLIC_BLINDFOLD_TREASURY=${treasury}`,
    "OPENROUTER_BUDGET_USD=20",
    "# OPENROUTER_API_KEY=   (leave unset for demo mode: canned answers, simulated costs)",
    "",
  ].join("\n");
  if (existsSync(".env.local")) {
    const old = readFileSync(".env.local", "utf8");
    const key = old.match(/^OPENROUTER_API_KEY=.+$/m);
    writeFileSync(".env.local", key ? env.replace(/^# OPENROUTER_API_KEY=.*$/m, key[0]) : env);
  } else writeFileSync(".env.local", env);

  console.log(`TestUSD deployed at ${token}`);
  console.log(`Treasury ${treasury}`);
  for (const u of users) {
    const b = (await pub.readContract({ address: token, abi: artifact.abi, functionName: "balanceOf", args: [u] })) as bigint;
    console.log(`Demo wallet ${u}: ${formatUnits(b, 6)} test USDC`);
  }
  console.log("Import a demo wallet into MetaMask or Rabby with its key from this file to try the shop.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
