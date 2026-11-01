// The wallet is only ever used in the shop: to send the stablecoin and to sign the claim.
// The chat never touches it.
import { createPublicClient, createWalletClient, custom, erc20Abi, http, numberToHex, type Address, type EIP1193Provider, type Hash } from "viem";
import { CHAIN, RPC_URL, TOKEN, TREASURY } from "../config";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

function provider(): EIP1193Provider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet found in this browser. Install MetaMask or Rabby, then reload.");
  }
  return window.ethereum;
}

const wallet = () => createWalletClient({ chain: CHAIN, transport: custom(provider()) });

export async function connect(): Promise<Address> {
  const [account] = await wallet().requestAddresses();
  if (!account) throw new Error("The wallet did not share an address.");
  await ensureChain();
  return account;
}

async function ensureChain() {
  const p = provider();
  const current = await p.request({ method: "eth_chainId" });
  if (Number(current) === CHAIN.id) return;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(CHAIN.id) }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: numberToHex(CHAIN.id),
          chainName: CHAIN.name,
          nativeCurrency: CHAIN.nativeCurrency,
          rpcUrls: [RPC_URL],
          blockExplorerUrls: CHAIN.blockExplorers ? [CHAIN.blockExplorers.default.url] : undefined,
        },
      ],
    });
  }
}

export async function tokenBalanceOf(account: Address): Promise<bigint> {
  return publicClient.readContract({ address: TOKEN.address, abi: erc20Abi, functionName: "balanceOf", args: [account] });
}

export async function sendToTreasury(account: Address, amount: bigint): Promise<Hash> {
  await ensureChain();
  const hash = await wallet().writeContract({
    account,
    address: TOKEN.address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [TREASURY, amount],
    chain: CHAIN,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transfer failed on chain. Nothing was sent.");
  return hash;
}

export async function sign(account: Address, message: string): Promise<Hash> {
  return wallet().signMessage({ account, message });
}
