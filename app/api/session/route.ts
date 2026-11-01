import { sha256hex, verifyTicket } from "@/lib/blind";
import { DENOMS, type Denom } from "@/lib/config";
import { b64, fail, isHex32, readJson, route } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { store } from "@/lib/store";

type Body = { session?: string; tickets?: { denom: number; prepared: string; sig: string }[] };

// Turns tickets into chat balance. No wallet, no login: the session is a
// random secret the browser made, and the server keeps only its hash. Each
// ticket can be spent exactly once; its hash is recorded, not who spent it.
export const POST = route(async (req) => {
  const body = await readJson<Body>(req);
  if (!isHex32(body.session)) fail(400, "session must be 32 random bytes in hex.");
  const sessionKey = sha256hex(body.session!);
  const tickets = Array.isArray(body.tickets) ? body.tickets : [];
  if (tickets.length > LIMITS.maxTicketsPerDeposit) fail(400, `Deposit at most ${LIMITS.maxTicketsPerDeposit} tickets at once.`);

  if (!tickets.length) return Response.json(await store.balance(sessionKey));

  let credits = 0;
  const hashes: string[] = [];
  for (const [i, t] of tickets.entries()) {
    if (!DENOMS.includes(t.denom as Denom)) fail(400, `Ticket ${i} has an unknown size.`);
    const prepared = b64(t.prepared, `Ticket ${i}`);
    const sig = b64(t.sig, `Ticket ${i} signature`);
    if (!(await verifyTicket(t.denom as Denom, prepared, sig))) fail(400, `Ticket ${i} is not a valid ticket.`, { invalid: i });
    credits += t.denom;
    hashes.push(sha256hex(prepared));
  }
  if (new Set(hashes).size !== hashes.length) fail(400, "The same ticket appears twice.");

  const result = await store.deposit(sessionKey, hashes, credits);
  if (result.kind === "spent") fail(409, "Some of these tickets were already used.", { spent: result.hashes });
  return Response.json({ balance: result.balance, deposited: credits });
});
