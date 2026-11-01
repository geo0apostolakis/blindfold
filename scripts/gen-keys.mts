// Generates the production blind-signing keys (one RSA-2048 key per ticket
// size) and writes them to .data/prod-blind-keys.env as BLINDFOLD_BLIND_KEYS=...
// Paste that line into the server's environment; never commit it.
//
//   npm run gen-keys
//
// Whoever holds these keys can mint credits. Rotating them makes every unspent
// ticket worthless, so do it only before launch or after a leak.
import { RSABSSA } from "@cloudflare/blindrsa-ts";
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const DENOMS = [1000, 100, 10, 1];
const out = ".data/prod-blind-keys.env";

if (existsSync(out) && !process.argv.includes("--force")) {
  console.error(`${out} already exists. Re-run with --force to replace it (this invalidates every ticket signed with the old keys).`);
  process.exit(1);
}

const suite = RSABSSA.SHA384.PSS.Randomized();
const jwks: Record<string, JsonWebKey> = {};
for (const d of DENOMS) {
  const { privateKey } = await suite.generateKey({ publicExponent: Uint8Array.from([1, 0, 1]), modulusLength: 2048 });
  jwks[d] = await crypto.subtle.exportKey("jwk", privateKey);
  const spki = createPublicKey(createPrivateKey({ key: jwks[d] as never, format: "jwk" })).export({ type: "spki", format: "der" });
  console.log(`${String(d).padStart(4)}-credit key fingerprint ${createHash("sha256").update(spki).digest("hex")}`);
}
mkdirSync(".data", { recursive: true });
// Single quotes keep the JSON intact for both dotenv and a shell `source`.
writeFileSync(out, `BLINDFOLD_BLIND_KEYS='${JSON.stringify(jwks)}'\n`, { mode: 0o600 });
console.log(`\nWrote ${out}. Publish the fingerprints above (site footer, X) so anyone can see if they ever change.`);
