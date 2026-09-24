export const runtime = "nodejs";

export function GET(): Response {
  const configured = Boolean(
    process.env.TYPESAFE_API_KEY &&
      process.env.OPENAI_API_KEY &&
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN &&
      process.env.RATE_LIMIT_HASH_SECRET &&
      process.env.RATE_LIMIT_HASH_SECRET.length >= 32,
  );
  return Response.json(
    { status: configured ? "ready" : "unconfigured" },
    {
      status: configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
