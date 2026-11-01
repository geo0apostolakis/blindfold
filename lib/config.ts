// The only place the app learns which chain, which coin and which models it
// runs against. Nothing else hardcodes an address, a chain id or a model id:
// moving from the local demo to testnet to mainnet is a change of env vars.
import { defineChain, type Address, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

export type ChainName = "local" | "testnet" | "mainnet";

const local = defineChain({
  id: 31337,
  name: "Local demo chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const chains: Record<ChainName, Chain> = {
  local,
  testnet: baseSepolia,
  mainnet: base,
};

function chainName(): ChainName {
  const name = process.env.NEXT_PUBLIC_BLINDFOLD_CHAIN ?? "local";
  if (name !== "local" && name !== "testnet" && name !== "mainnet") {
    throw new Error(`NEXT_PUBLIC_BLINDFOLD_CHAIN must be local, testnet or mainnet, got "${name}"`);
  }
  return name;
}

export const CHAIN_NAME = chainName();
export const CHAIN = chains[CHAIN_NAME];
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || CHAIN.rpcUrls.default.http[0];

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

// Credits are paid for in a dollar stablecoin, so one coin is one dollar and
// the app never needs a price feed. USDC by default; any ERC-20 dollar coin
// works by changing these three settings.
export const TOKEN = {
  address: (process.env.NEXT_PUBLIC_BLINDFOLD_TOKEN || ZERO) as Address,
  symbol: process.env.NEXT_PUBLIC_BLINDFOLD_SYMBOL || "USDC",
  decimals: Number(process.env.NEXT_PUBLIC_BLINDFOLD_DECIMALS || 6),
};

// Where payments go. The server only reads transfers into this address; it
// never holds a key for it.
export const TREASURY = (process.env.NEXT_PUBLIC_BLINDFOLD_TREASURY || ZERO) as Address;

// Without a coin and a treasury the site still runs (chat in demo mode, the
// model list, the explanation); only buying credits waits.
export const PAYMENTS_ON = TOKEN.address !== ZERO && TREASURY !== ZERO;

// One credit is a fixed slice of real AI cost: a hundredth of a cent. A larger
// unit was too coarse, a "hi" and a whole essay both cost 1-2 credits.
export const CREDIT_USD = 0.0001;

// A payment turns this share of its dollar value into credits. The rest is the
// operator's margin.
export const REDEEM_RATE = 0.8;

// Each message is charged its real OpenRouter cost times this.
export const CHARGE_MARKUP = 1.2;

// Ticket sizes in credits, largest first. One blind-signing key per size.
export const DENOMS = [1000, 100, 10, 1] as const;
export type Denom = (typeof DENOMS)[number];

export type ModelChoice = {
  id: string;
  label: string;
  blurb: string;
  // Price ceiling in USD per million tokens, sent to OpenRouter as
  // provider.max_price. No provider above it is ever used, and holds are
  // sized from it, so the worst case of a message is always covered.
  maxPrice: { prompt: number; completion: number };
  // Hidden reasoning ignores max_tokens on some providers; one test asked for
  // 60 tokens and was billed 803. Off where the model allows it.
  reasoning: { enabled: false } | { effort: "low" };
};

// Models a user may pick. Each was called through OpenRouter on 2026-10-07
// with zero-data-retention routing, its ceiling and its reasoning setting, and
// stayed inside max_tokens. Qwen 3.7 Flash was dropped: no ZDR provider.
export const MODELS: ModelChoice[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    blurb: "Fast and very cheap. The default.",
    maxPrice: { prompt: 0.2, completion: 0.6 },
    reasoning: { enabled: false },
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    blurb: "Quick all-rounder.",
    maxPrice: { prompt: 0.5, completion: 3 },
    reasoning: { enabled: false },
  },
  // Added 2026-10-08, both tested the same way: ZDR via Google/Bedrock (Haiku)
  // and Azure (Luna), reasoning off, inside max_tokens.
  {
    id: "anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
    blurb: "Anthropic's small model. Cheap and sharp.",
    maxPrice: { prompt: 0.12, completion: 0.6 },
    reasoning: { enabled: false },
  },
  {
    id: "openai/gpt-6-luna",
    label: "GPT-6 Luna",
    blurb: "OpenAI's small model. Cheap and quick.",
    maxPrice: { prompt: 0.12, completion: 0.6 },
    reasoning: { enabled: false },
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    blurb: "Smarter, about 5x the cost.",
    maxPrice: { prompt: 1.1, completion: 2.2 },
    reasoning: { enabled: false },
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    blurb: "Premium. About 20x the cost.",
    maxPrice: { prompt: 2.2, completion: 11 },
    reasoning: { effort: "low" },
  },
  // Flagships, added 2026-10-09 and tested the same way: ZDR via Bedrock (Opus)
  // and Azure (Astra). Neither can turn reasoning off; at effort low both
  // stayed inside max_tokens. Claude Fable 5.1 was left out: no ZDR provider.
  {
    id: "anthropic/claude-opus-5.5",
    label: "Claude Opus 5.5",
    blurb: "Anthropic's flagship. About 40x the cost.",
    maxPrice: { prompt: 4.4, completion: 22 },
    reasoning: { effort: "low" },
  },
  {
    id: "openai/gpt-6-astra",
    label: "GPT-6 Astra",
    blurb: "OpenAI's flagship. About 100x the cost.",
    maxPrice: { prompt: 11, completion: 55 },
    reasoning: { effort: "low" },
  },
];
export const DEFAULT_MODEL = MODELS[0].id;

export const EXPLORER = CHAIN.blockExplorers?.default.url ?? null;
