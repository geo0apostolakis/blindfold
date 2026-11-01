import "server-only";
import { RSABSSA } from "@cloudflare/blindrsa-ts";
import { constants, createHash, createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DENOMS, type Denom } from "./config";

// One RSA key per ticket size. A ticket signed by the 100 key is worth 100
// credits; the size is never written inside the ticket, so it cannot be lied
// about.
//
// Keys come from BLINDFOLD_BLIND_KEYS (JSON: { "1000": jwk, ... }) or, for local
// development, from .data/blind-keys.json, generated on first boot. Whoever
// holds these keys can mint credits: treat them like the OpenRouter key.

type Loaded = {
  sign: KeyObject;
  verify: CryptoKey;
  spki: string; // base64, sent to browsers
  fingerprint: string; // sha256 of the spki, published so key swaps are visible
};

const suite = RSABSSA.SHA384.PSS.Randomized();
const IMPORT = { name: "RSA-PSS", hash: "SHA-384" } as const;

async function generate(): Promise<Record<string, JsonWebKey>> {
  const out: Record<string, JsonWebKey> = {};
  for (const d of DENOMS) {
    const { privateKey } = await suite.generateKey({ publicExponent: Uint8Array.from([1, 0, 1]), modulusLength: 2048 });
    out[d] = await crypto.subtle.exportKey("jwk", privateKey);
  }
  return out;
}

async function readJwks(): Promise<Record<string, JsonWebKey>> {
  if (process.env.BLINDFOLD_BLIND_KEYS) return JSON.parse(process.env.BLINDFOLD_BLIND_KEYS);
  if (process.env.NODE_ENV === "production") {
    throw new Error("BLINDFOLD_BLIND_KEYS is not set. Production never generates signing keys on the fly.");
  }
  const file = path.join(process.cwd(), ".data", "blind-keys.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(path.dirname(file), { recursive: true });
  const jwks = await generate();
  writeFileSync(file, JSON.stringify(jwks), { mode: 0o600 });
  console.log(`[blindfold] generated development blind-signing keys at ${path.relative(process.cwd(), file)}`);
  return jwks;
}

async function load(): Promise<Map<Denom, Loaded>> {
  const jwks = await readJwks();
  const keys = new Map<Denom, Loaded>();
  for (const d of DENOMS) {
    const jwk = jwks[d];
    if (!jwk) throw new Error(`blind-signing key for ${d}-credit tickets is missing`);
    const sign = createPrivateKey({ key: jwk as never, format: "jwk" });
    const spkiDer = createPublicKey(sign).export({ type: "spki", format: "der" });
    const verify = await crypto.subtle.importKey("spki", spkiDer, IMPORT, true, ["verify"]);
    keys.set(d, {
      sign,
      verify,
      spki: spkiDer.toString("base64"),
      fingerprint: createHash("sha256").update(spkiDer).digest("hex"),
    });
  }
  return keys;
}

const g = globalThis as unknown as { __blindfoldKeys?: Promise<Map<Denom, Loaded>> };
const keys = () => (g.__blindfoldKeys ??= load());

export async function publicKeys() {
  const all = await keys();
  return DENOMS.map((d) => ({ denom: d, spki: all.get(d)!.spki, fingerprint: all.get(d)!.fingerprint }));
}

const MODULUS_BYTES = 256;

/** RFC 9474 BlindSign, done with Node's native RSA (about 0.3 ms) instead of
 *  the library's pure-JS path (about 150 ms). Raw RSA on the blinded value,
 *  then the RFC's own check that the signature verifies back to it. */
export async function blindSign(denom: Denom, blinded: Uint8Array): Promise<Uint8Array> {
  if (blinded.length !== MODULUS_BYTES) throw new Error("blinded message has the wrong length");
  const k = (await keys()).get(denom);
  if (!k) throw new Error("unknown ticket size");
  const sig = privateDecrypt({ key: k.sign, padding: constants.RSA_NO_PADDING }, blinded);
  const back = publicEncrypt({ key: k.sign, padding: constants.RSA_NO_PADDING }, sig);
  if (!back.equals(Buffer.from(blinded))) throw new Error("blind signature failed its own check");
  return new Uint8Array(sig);
}

/** True when `sig` is this server's signature over `prepared` for that size. */
export async function verifyTicket(denom: Denom, prepared: Uint8Array, sig: Uint8Array): Promise<boolean> {
  const k = (await keys()).get(denom);
  if (!k || sig.length !== MODULUS_BYTES) return false;
  try {
    return await suite.verify(k.verify, sig, prepared);
  } catch {
    return false;
  }
}

export const sha256hex = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
