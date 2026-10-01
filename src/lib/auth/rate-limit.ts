import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function requestIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Best-effort per-instance guard. Configure an edge/platform limit as well for multi-instance
 * production deployments, where in-memory buckets are not shared between serverless instances.
 */
export function consumeAuthLimit(
  scope: string,
  ip: string,
  identity: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): number | null {
  const key = createHash("sha256")
    .update(`${scope}\0${ip}\0${identity.toLowerCase()}`)
    .digest("hex");
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, bucket);
  } else if (bucket.count >= limit) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  } else {
    bucket.count += 1;
  }

  if (buckets.size > 5_000) {
    for (const [existingKey, existing] of buckets) {
      if (existing.resetAt <= now) buckets.delete(existingKey);
      if (buckets.size <= 5_000) break;
    }
  }

  return null;
}
