import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type Route = "evaluation" | "comparison" | "improvement";
type GuardResult =
  | { readonly request: Request }
  | { readonly response: Response };

const POLICY: Record<
  Route,
  { bytes: number; minute: number; hour: number; cost: number }
> = {
  evaluation: { bytes: 16_384, minute: 8, hour: 40, cost: 1 },
  comparison: { bytes: 32_768, minute: 4, hour: 20, cost: 2 },
  improvement: { bytes: 65_536, minute: 4, hour: 20, cost: 3 },
};

// Each request checks and increments all four counters in one Redis operation.
const LIMIT_SCRIPT = `
for i = 1, #KEYS do
  local current = tonumber(redis.call('GET', KEYS[i]) or '0')
  if current + tonumber(ARGV[i]) > tonumber(ARGV[i + 4]) then return i end
end
for i = 1, #KEYS do
  redis.call('INCRBY', KEYS[i], tonumber(ARGV[i]))
  redis.call('EXPIRE', KEYS[i], tonumber(ARGV[i + 8]))
end
return 0`;

export async function guardProviderRequest(
  request: Request,
  route: Route,
): Promise<GuardResult> {
  const policy = POLICY[route];
  const lengthHeader = request.headers.get("content-length");
  if (
    lengthHeader !== null &&
    /^\d+$/.test(lengthHeader) &&
    Number(lengthHeader) > policy.bytes
  ) {
    return { response: rejected(route, "size") };
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBounded(request, policy.bytes);
  } catch (error) {
    const reason = error instanceof BodyTooLarge ? "size" : "invalid";
    return {
      response: rejected(route, reason),
    };
  }

  let result: number;
  try {
    const address = trustedAddress(request);
    const secret =
      process.env.RATE_LIMIT_HASH_SECRET?.trim() ||
      (process.env.NODE_ENV === "development"
        ? "postlens-local-development-only-secret"
        : undefined);
    if (!address || !secret || secret.length < 32)
      throw new Error("rate limit identity unavailable");
    const identity = createHmac("sha256", secret)
      .update(`${new Date().toISOString().slice(0, 10)}:${address}`)
      .digest("hex");
    result = await consume(route, identity, policy);
  } catch {
    return { response: rejected(route, "unavailable") };
  }
  if (result !== 0) {
    const window = result === 1 || result === 3 ? 60 : 3600;
    return {
      response: rejected(
        route,
        "limited",
        window - (Math.floor(Date.now() / 1000) % window),
      ),
    };
  }

  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return {
    request: new Request(request.url, {
      method: "POST",
      headers,
      body,
      signal: request.signal,
    }),
  };
}

class BodyTooLarge extends Error {}

async function readBounded(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maxBytes) throw new BodyTooLarge();
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function trustedAddress(request: Request): string | undefined {
  if (process.env.VERCEL === "1") {
    const value = request.headers
      .get("x-vercel-forwarded-for")
      ?.split(",", 1)[0]
      ?.trim();
    return value && isIP(value) ? value : undefined;
  }
  if (process.env.NODE_ENV === "development") return "local-development";
  return undefined;
}

async function consume(
  route: Route,
  identity: string,
  policy: (typeof POLICY)[Route],
): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !url.startsWith("https://")) {
    if (process.env.NODE_ENV === "development")
      return consumeLocal(route, identity, policy);
    throw new Error("rate limit store unavailable");
  }
  const now = Math.floor(Date.now() / 1000);
  const minute = Math.floor(now / 60);
  const hour = Math.floor(now / 3600);
  const keys = [
    `postlens:global:minute:${identity}:${minute}`,
    `postlens:global:hour:${identity}:${hour}`,
    `postlens:${route}:minute:${identity}:${minute}`,
    `postlens:${route}:hour:${identity}:${hour}`,
  ];
  const command = [
    "EVAL",
    LIMIT_SCRIPT,
    4,
    ...keys,
    policy.cost,
    policy.cost,
    policy.cost,
    policy.cost,
    12,
    60,
    policy.minute * policy.cost,
    policy.hour * policy.cost,
    120,
    7200,
    120,
    7200,
  ];
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error("rate limit store unavailable");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("result" in body))
    throw new Error("invalid rate limit response");
  const result = body.result;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < 0 ||
    result > 4
  ) {
    throw new Error("invalid rate limit result");
  }
  return result;
}

const localCounters = new Map<string, number>();
function consumeLocal(
  route: Route,
  identity: string,
  policy: (typeof POLICY)[Route],
): number {
  const now = Math.floor(Date.now() / 1000);
  const minute = Math.floor(now / 60);
  const hour = Math.floor(now / 3600);
  const keys = [
    `g:m:${identity}:${minute}`,
    `g:h:${identity}:${hour}`,
    `${route}:m:${identity}:${minute}`,
    `${route}:h:${identity}:${hour}`,
  ];
  const limits = [
    12,
    60,
    policy.minute * policy.cost,
    policy.hour * policy.cost,
  ];
  const denied = keys.findIndex(
    (key, index) => (localCounters.get(key) ?? 0) + policy.cost > limits[index],
  );
  if (denied >= 0) return denied + 1;
  for (const key of keys)
    localCounters.set(key, (localCounters.get(key) ?? 0) + policy.cost);
  if (localCounters.size > 1000) {
    for (const key of localCounters.keys()) {
      if (!key.endsWith(`:${minute}`) && !key.endsWith(`:${hour}`))
        localCounters.delete(key);
    }
  }
  return 0;
}

function rejected(
  route: Route,
  reason: "size" | "invalid" | "limited" | "unavailable",
  retryAfter?: number,
): Response {
  const improvement = route === "improvement";
  const code =
    reason === "size"
      ? "REQUEST_TOO_LARGE"
      : reason === "invalid"
        ? "INVALID_REQUEST"
        : reason === "limited"
          ? improvement
            ? "IMPROVEMENT_BUSY"
            : "EVALUATION_BUSY"
          : improvement
            ? "IMPROVEMENT_UNAVAILABLE"
            : "EVALUATION_UNAVAILABLE";
  const message =
    reason === "size"
      ? "The request is too large."
      : reason === "invalid"
        ? "Send a valid JSON request."
        : reason === "limited"
          ? "Too many requests. Please try again shortly."
          : "This service is temporarily unavailable.";
  const status =
    reason === "size"
      ? 413
      : reason === "invalid"
        ? 400
        : reason === "limited"
          ? 429
          : 503;
  const requestId = crypto.randomUUID();
  console.info(
    JSON.stringify({
      type: "request.guard",
      timestamp: new Date().toISOString(),
      requestId,
      route,
      outcome: reason,
      status,
    }),
  );
  return Response.json(
    {
      error: {
        code,
        message,
        retryable: reason === "limited" || reason === "unavailable",
        ...(route === "evaluation"
          ? { evaluationId: requestId }
          : route === "comparison"
            ? { comparisonId: requestId }
            : {}),
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}
