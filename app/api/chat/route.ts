import { sha256hex } from "@/lib/blind";
import { MODELS } from "@/lib/config";
import { fail, isHex32, readJson, route } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { chat, modelPrices, type ChatMessage } from "@/lib/openrouter";
import { chargeCredits, holdCredits } from "@/lib/pricing";
import { store } from "@/lib/store";

type Body = { session?: string; model?: string; messages?: ChatMessage[] };

// One message: hold its worst case, ask the model, charge the real cost x
// markup, give the rest of the hold back. The prompt is passed through and
// forgotten: it is never written to the store or to a log.
export const POST = route(async (req) => {
  const body = await readJson<Body>(req);
  if (!isHex32(body.session)) fail(400, "session must be 32 random bytes in hex.");
  const model = MODELS.find((m) => m.id === body.model);
  if (!model) fail(400, "Pick one of the listed models.");

  const all = Array.isArray(body.messages) ? body.messages : [];
  const messages = all
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-LIMITS.maxHistoryMessages)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!messages.length || messages[messages.length - 1].role !== "user") fail(400, "End with a user message.");
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  if (promptChars > LIMITS.maxPromptChars) fail(400, "That conversation is too long to send. Start a new chat.");

  const price = (await modelPrices())[model!.id];
  const sessionKey = sha256hex(body.session!);
  const hold = holdCredits(price, promptChars, LIMITS.maxOutputTokens);

  const held = await store.hold(sessionKey, hold, Date.now(), LIMITS.chatPerMinutePerSession, LIMITS.chatPerMinuteGlobal);
  if (held.kind === "rate-limited") {
    fail(429, held.scope === "session" ? "Slow down a little: too many messages this minute." : "Blindfold is very busy right now. Try again in a minute.");
  }
  if (held.kind === "insufficient") fail(402, "Not enough credits for this message.", { need: hold, available: held.available });

  let result;
  try {
    result = await chat(model!.id, messages, LIMITS.maxOutputTokens, price);
  } catch {
    await store.release(sessionKey, hold);
    fail(502, "The AI provider did not answer. Nothing was charged.");
  }
  // Never charge past the hold. If the estimate ever missed, the difference is
  // ours; the real cost still counts against the budget, so capacity stays true.
  const charged = Math.min(chargeCredits(result!.costUsd), hold);
  const { balance } = await store.settle(sessionKey, hold, charged, result!.costUsd);
  return Response.json({ reply: result!.text, charged, balance });
});
