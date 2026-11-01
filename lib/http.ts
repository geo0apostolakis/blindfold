import "server-only";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

// Typed as returning never so TypeScript knows code after a failed check is unreachable.
export const fail: (status: number, message: string, extra?: Record<string, unknown>) => never = (status, message, extra = {}) => {
  throw new HttpError(status, message, extra);
};

/** Wraps a handler so thrown HttpErrors become JSON answers and anything else
 *  becomes a plain 500 with no internals: config errors never reach a browser.
 *  Nothing here logs request bodies; prompts must never land in a log. */
export function route(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message, ...e.extra }, { status: e.status });
      console.error("[blindfold] internal error:", e instanceof Error ? e.message : e);
      return Response.json({ error: "Something went wrong on our side. Nothing was charged." }, { status: 500 });
    }
  };
}

const MAX_BODY = 256 * 1024;

export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (text.length > MAX_BODY) fail(413, "Request too large.");
  try {
    return JSON.parse(text) as T;
  } catch {
    return fail(400, "Body must be JSON.");
  }
}

export function b64(value: unknown, what: string): Uint8Array {
  if (typeof value !== "string" || value.length > 1024) fail(400, `${what} must be base64.`);
  const buf = Buffer.from(value as string, "base64");
  if (buf.toString("base64") !== value) fail(400, `${what} must be base64.`);
  return new Uint8Array(buf);
}

export const isHex32 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
