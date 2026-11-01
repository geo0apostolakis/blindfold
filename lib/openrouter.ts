import "server-only";
import { MODELS } from "./config";
import { estimateTokens, type ModelPrice } from "./pricing";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const API = "https://openrouter.ai/api/v1";
const key = () => process.env.OPENROUTER_API_KEY || "";

/** Demo mode: no key set. Answers are canned and the cost is simulated from
 *  real model prices, so every number in the app still behaves for real. */
export const isDemo = () => !key();

/** Per-token prices used for holds: each model's ceiling, never the cheapest
 *  listed price. With zero-retention routing the cheap providers are often
 *  excluded or down; one test paid 6x the listed price. */
export async function modelPrices(): Promise<Record<string, ModelPrice>> {
  return Object.fromEntries(
    MODELS.map((m) => [m.id, { prompt: m.maxPrice.prompt / 1e6, completion: m.maxPrice.completion / 1e6 }]),
  );
}

/** Real money left: the lower of the key's own limit (if it has one) and the
 *  account's credit balance. The account can hold far less than the budget
 *  in config, and a key with no limit can spend all of it, so both are read.
 *  If neither can be read, answer 0: selling credits blind is the one thing
 *  this must never do. Cached 60 s. */
const gk = globalThis as unknown as { __blindfoldLeft?: { at: number; value: number | null } };
export async function keyRemainingUsd(): Promise<number | null> {
  if (isDemo()) return null;
  const cached = gk.__blindfoldLeft;
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const headers = { authorization: `Bearer ${key()}` };
  let value = 0;
  try {
    const [k, c] = await Promise.all([
      fetch(`${API}/key`, { headers, cache: "no-store" }).then((r) => r.json()),
      fetch(`${API}/credits`, { headers, cache: "no-store" }).then((r) => r.json()),
    ]);
    const keyLeft = (k as { data?: { limit_remaining?: number | null } }).data?.limit_remaining;
    const credits = (c as { data?: { total_credits?: number; total_usage?: number } }).data;
    const accountLeft =
      typeof credits?.total_credits === "number" && typeof credits.total_usage === "number"
        ? credits.total_credits - credits.total_usage
        : null;
    const known = [keyLeft, accountLeft].filter((x): x is number => typeof x === "number");
    value = known.length ? Math.min(...known) : 0;
  } catch {
    value = 0;
  }
  gk.__blindfoldLeft = { at: Date.now(), value };
  return value;
}

export type ChatResult = { text: string; costUsd: number };

const SYSTEM =
  "You are Blindfold, a helpful and direct assistant. The person you are talking to is anonymous by design, so never ask who they are. Everything earlier in this conversation is visible to you: use it, and refer back to it when asked.";

export async function chat(model: string, messages: ChatMessage[], maxTokens: number, price: ModelPrice): Promise<ChatResult> {
  if (isDemo()) {
    const last = messages[messages.length - 1]?.content ?? "";
    const text =
      `Demo mode: no OpenRouter key is set, so this answer is canned.\n\n` +
      `Your message was ${last.length} characters. With a real key, ${model} would answer here, ` +
      `and the server would forward it with no wallet, no IP and no account attached.`;
    const promptChars = messages.reduce((n, m) => n + m.content.length, SYSTEM.length);
    const costUsd = price.prompt * estimateTokens(promptChars) + price.completion * estimateTokens(text.length);
    return { text, costUsd };
  }

  const choice = MODELS.find((m) => m.id === model);
  if (!choice) throw new Error("unknown model");
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      usage: { include: true },
      reasoning: choice.reasoning,
      // Only providers that neither train on nor keep prompts, and none
      // priced above the ceiling the hold was sized from.
      provider: { data_collection: "deny", zdr: true, max_price: choice.maxPrice },
    }),
  });
  if (!res.ok) throw new Error(`model provider answered ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  const u = body.usage ?? {};
  const costUsd =
    typeof u.cost === "number"
      ? u.cost
      : price.prompt * (u.prompt_tokens ?? 0) + price.completion * (u.completion_tokens ?? maxTokens);
  return { text, costUsd };
}
