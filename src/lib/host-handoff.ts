import { createHmac, timingSafeEqual } from "node:crypto";
import { isCustomAppHost, isPublicAppHost, safeNextPath } from "./public-origins.ts";

/** Must match `SESSION_TOKEN_COOKIE` in `src/lib/auth/server.ts`. */
export const HANDOFF_SESSION_COOKIE = "__Host-grok-auth.session_token";

export const HANDOFF_TTL_MS = 90_000;
export const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type HandoffTicket = {
  v: 1;
  t: string;
  n: string;
  h: string;
  exp: number;
};

export function requestHostname(request: Request): string {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host") || url.hostname;
  return host.toLowerCase().split(":")[0] ?? "";
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function sessionCookieHeader(token: string, maxAgeSec = SESSION_COOKIE_MAX_AGE_SEC): string {
  if (!token || /[\s;,]/.test(token)) {
    throw new Error("Refusing to set an invalid session cookie.");
  }
  return `${HANDOFF_SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function mintHandoffTicket(
  payload: { token: string; next: string; host: string },
  secret: string,
  now = Date.now(),
): string {
  const body: HandoffTicket = {
    v: 1,
    t: payload.token,
    n: payload.next,
    h: payload.host,
    exp: now + HANDOFF_TTL_MS,
  };
  const json = b64url(Buffer.from(JSON.stringify(body), "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(json).digest());
  return `${json}.${sig}`;
}

export function verifyHandoffTicket(ticket: string, secret: string, now = Date.now()): HandoffTicket | null {
  if (!ticket || !secret) return null;
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const json = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = b64url(createHmac("sha256", secret).update(json).digest());
  if (!equal(sig, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as HandoffTicket;
    if (body.v !== 1) return null;
    if (typeof body.t !== "string" || !body.t || /[\s;,]/.test(body.t)) return null;
    if (typeof body.n !== "string" || !safeNextPath(body.n)) return null;
    if (typeof body.h !== "string" || !isPublicAppHost(body.h)) return null;
    if (typeof body.exp !== "number" || body.exp < now) return null;
    return body;
  } catch {
    return null;
  }
}

export function handoffSecret(): string | undefined {
  const value = process.env.BETTER_AUTH_SECRET?.trim();
  return value || undefined;
}

export function isHandoffDestination(host: string): boolean {
  return isCustomAppHost(host);
}
