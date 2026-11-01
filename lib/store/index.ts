import "server-only";
import path from "node:path";
import { JsonStore } from "./json";
import type { Store } from "./types";

// Picked explicitly and announced once. Never a silent fallback: a deployment
// quietly writing to a local file looks healthy and loses everything on the
// next restart of a serverless function.
function pick(): Store {
  if (process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is set but the Postgres store is not built yet. Unset it to use the JSON store.");
  }
  const file = process.env.BLINDFOLD_STORE_FILE || path.join(process.cwd(), ".data", "store.json");
  const store = new JsonStore(file);
  console.log(`[blindfold] store backend: ${store.backend}`);
  return store;
}

// One instance per process. Route handlers can be bundled separately, so the
// instance lives on globalThis rather than in this module's scope; two copies
// would each think a ticket was unspent.
const g = globalThis as unknown as { __blindfoldStore?: Store };
export const store: Store = (g.__blindfoldStore ??= pick());
export type * from "./types";
