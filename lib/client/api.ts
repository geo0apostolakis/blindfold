import type { ModelPrice } from "../pricing";
import type { PublicKeyInfo } from "./tickets";

export type Status = {
  chain: { name: string; id: number; label: string; explorer: string | null };
  token: { address: string; symbol: string; decimals: number };
  payments: boolean;
  treasury: string;
  demo: boolean;
  pricing: { creditUsd: number; redeemRate: number; chargeMarkup: number };
  limits: {
    minRedeemCredits: number;
    maxRedeemCredits: number;
    maxCreditsPerWalletPerDay: number;
    maxOutputTokens: number;
    maxHistoryMessages: number;
    maxPromptChars: number;
    quoteTtlMs: number;
  };
  capacity: {
    soldOut: boolean;
    availableCredits: number;
    budgetUsd: number;
    remainingUsd: number;
    spentUsd: number;
    messages: number;
    paidInUsd: number;
  };
  models: { id: string; label: string; blurb: string; price: ModelPrice; typicalCredits: number }[];
  keys: PublicKeyInfo[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? `Request failed (${res.status})`), data);
  return data as T;
}
