import { FREE_CAPTURES } from "../gst.ts";

export type QuotaKind = "user" | "ip";

export function clampUsed(used: number): number {
  if (!Number.isFinite(used) || used < 0) return 0;
  return Math.min(FREE_CAPTURES, Math.floor(used));
}

/** Login must not grant extra captures — keep the higher of the two buckets. */
export function mergeUsed(userUsed: number, ipUsed: number): number {
  return Math.max(clampUsed(userUsed), clampUsed(ipUsed));
}

export function remainingOf(used: number, isPro: boolean): number {
  if (isPro) return FREE_CAPTURES;
  return Math.max(0, FREE_CAPTURES - clampUsed(used));
}

export function canUseFreeQuota(opts: {
  isPro: boolean;
  signedIn: boolean;
  emailVerified: boolean;
  used: number;
}): { ok: boolean; reason?: "exhausted" | "unverified" } {
  if (opts.isPro) return { ok: true };
  if (opts.signedIn && !opts.emailVerified) return { ok: false, reason: "unverified" };
  if (clampUsed(opts.used) >= FREE_CAPTURES) return { ok: false, reason: "exhausted" };
  return { ok: true };
}

export function normalizeIp(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "0.0.0.0";
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return mapped[1];
  if (value.startsWith("[") && value.endsWith("]")) return value.slice(1, -1);
  return value.split("%")[0] ?? value;
}

export function userQuotaId(userId: string): string {
  return `user:${userId}`;
}

export function ipQuotaId(hash: string): string {
  return `ip:${hash}`;
}

export function hashCode(userId: string, code: string): string {
  return `${userId}:${code.trim()}`;
}
