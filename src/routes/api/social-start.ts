import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS } from "@/lib/auth/providers";
import {
  HANDOFF_SESSION_COOKIE,
  readCookie,
  requestHostname,
} from "@/lib/host-handoff";
import {
  CANONICAL_APP_HOST,
  isCustomAppHost,
  safeNextPath,
} from "@/lib/public-origins";

function redirectTo(location: string, setCookies: string[] = []): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function loginFallback(toHost: string | undefined, next: string): string {
  if (toHost && isCustomAppHost(toHost)) {
    const params = new URLSearchParams();
    if (next !== "/profile") params.set("next", next);
    const query = params.toString();
    return `https://${toHost}/login${query ? `?${query}` : ""}`;
  }
  return next === "/profile" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

function bridgePath(next: string, toHost: string): string {
  const params = new URLSearchParams({ next, to: toHost });
  return `/api/session-bridge?${params.toString()}`;
}

async function handleSocialStart(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const providerId = url.searchParams.get("provider")?.trim() ?? "";
  const next = safeNextPath(url.searchParams.get("next")) ?? "/profile";
  const toHost = (url.searchParams.get("to") ?? "").trim().toLowerCase();
  const allowed = GROK_PROVIDERS.some((provider) => provider.providerId === providerId);
  if (!allowed) {
    return redirectTo(loginFallback(toHost, next));
  }

  const host = requestHostname(request);
  if (isCustomAppHost(host)) {
    const bounce = new URL(`https://${CANONICAL_APP_HOST}/api/social-start`);
    bounce.searchParams.set("provider", providerId);
    bounce.searchParams.set("next", next);
    bounce.searchParams.set("to", host);
    return redirectTo(bounce.toString());
  }

  const handoff = host === CANONICAL_APP_HOST && isCustomAppHost(toHost);
  const callbackURL = handoff ? bridgePath(next, toHost) : next;
  const errorCallbackURL = loginFallback(handoff ? toHost : undefined, next);

  if (readCookie(request, HANDOFF_SESSION_COOKIE)) {
    return redirectTo(handoff ? bridgePath(next, toHost) : next);
  }

  const { auth } = await import("@/lib/auth/server");
  try {
    const apiRes = await auth.api.signInWithOAuth2({
      body: {
        providerId,
        callbackURL,
        errorCallbackURL,
      },
      headers: request.headers,
      asResponse: true,
    });

    if (!apiRes.ok) {
      return redirectTo(errorCallbackURL);
    }

    const body = (await apiRes.json().catch(() => null)) as { url?: string } | null;
    const location = body?.url;
    if (!location) return redirectTo(errorCallbackURL);

    const cookies = typeof apiRes.headers.getSetCookie === "function" ? apiRes.headers.getSetCookie() : [];
    return redirectTo(location, cookies);
  } catch {
    return redirectTo(errorCallbackURL);
  }
}

export const Route = createFileRoute("/api/social-start")({
  server: {
    handlers: {
      GET: ({ request }) => handleSocialStart(request),
    },
  },
});
