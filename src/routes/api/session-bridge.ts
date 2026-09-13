import { createFileRoute } from "@tanstack/react-router";
import {
  HANDOFF_SESSION_COOKIE,
  handoffSecret,
  mintHandoffTicket,
  readCookie,
  requestHostname,
  sessionCookieHeader,
  verifyHandoffTicket,
} from "@/lib/host-handoff";
import { isCustomAppHost, safeNextPath } from "@/lib/public-origins";

function redirectTo(location: string, setCookie?: string): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers });
}

function loginOn(toHost: string | undefined, next: string): string {
  if (toHost && isCustomAppHost(toHost)) {
    const params = new URLSearchParams();
    if (next !== "/profile") params.set("next", next);
    const query = params.toString();
    return `https://${toHost}/login${query ? `?${query}` : ""}`;
  }
  return "/login";
}

function handleSessionBridge(request: Request): Response {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next")) ?? "/profile";
  const toHost = (url.searchParams.get("to") ?? "").trim().toLowerCase();
  const ticket = url.searchParams.get("ticket")?.trim() ?? "";
  const host = requestHostname(request);
  const secret = handoffSecret();

  if (ticket) {
    if (!secret) return redirectTo("/login");
    const parsed = verifyHandoffTicket(ticket, secret);
    if (!parsed || parsed.h !== host) return redirectTo(loginOn(host, next));
    const dest = safeNextPath(parsed.n) ?? "/profile";
    return redirectTo(dest, sessionCookieHeader(parsed.t));
  }

  if (!secret) return redirectTo("/login");
  if (!isCustomAppHost(toHost)) return redirectTo("/login");

  const token = readCookie(request, HANDOFF_SESSION_COOKIE);
  if (!token) return redirectTo(loginOn(toHost, next));

  const minted = mintHandoffTicket({ token, next, host: toHost }, secret);
  const accept = new URL(`https://${toHost}/api/session-bridge`);
  accept.searchParams.set("ticket", minted);
  accept.searchParams.set("next", next);
  return redirectTo(accept.toString());
}

export const Route = createFileRoute("/api/session-bridge")({
  server: {
    handlers: {
      GET: ({ request }) => handleSessionBridge(request),
    },
  },
});
