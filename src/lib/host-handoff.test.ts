import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HANDOFF_SESSION_COOKIE,
  HANDOFF_TTL_MS,
  isHandoffDestination,
  mintHandoffTicket,
  sessionCookieHeader,
  verifyHandoffTicket,
} from "./host-handoff.ts";
import {
  CANONICAL_APP_HOST,
  CUSTOM_APP_HOSTS,
  PAYMENT_APP_HOST,
  PAYWALL_RETURN_PATH,
  isCustomAppHost,
  isPaymentAppHost,
  PUBLIC_APP_ORIGINS,
  safeNextPath,
  socialStartUrl,
} from "./public-origins.ts";

describe("public origins", () => {
  it("names the custom domain and canonical grok.me host", () => {
    assert.equal(CANONICAL_APP_HOST, "gstslip.grok.me");
    assert.deepEqual([...CUSTOM_APP_HOSTS], ["gstslip.vin8003.com"]);
    assert.ok(PUBLIC_APP_ORIGINS.includes("https://gstslip.vin8003.com"));
    assert.equal(isCustomAppHost("gstslip.vin8003.com"), true);
    assert.equal(isCustomAppHost("GSTSLIP.VIN8003.COM"), true);
    assert.equal(isCustomAppHost("gstslip.grok.me"), false);
    assert.equal(PAYMENT_APP_HOST, "gstslip.vin8003.com");
    assert.equal(isPaymentAppHost("gstslip.vin8003.com"), true);
    assert.equal(isPaymentAppHost("gstslip.grok.me"), false);
    assert.equal(safeNextPath(PAYWALL_RETURN_PATH), "/?upgrade=1");
  });

  it("builds a social start URL on the canonical host", () => {
    const href = socialStartUrl({
      providerId: "grok-google",
      next: "/profile",
      returnHost: "gstslip.vin8003.com",
    });
    const url = new URL(href);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "gstslip.grok.me");
    assert.equal(url.pathname, "/api/social-start");
    assert.equal(url.searchParams.get("provider"), "grok-google");
    assert.equal(url.searchParams.get("next"), "/profile");
    assert.equal(url.searchParams.get("to"), "gstslip.vin8003.com");
  });

  it("rejects open redirects in next", () => {
    assert.equal(safeNextPath("/profile"), "/profile");
    assert.equal(safeNextPath("//evil.example"), undefined);
    assert.equal(safeNextPath("https://evil.example/"), undefined);
    assert.equal(safeNextPath("profile"), undefined);
  });
});

describe("session handoff tickets", () => {
  const secret = "test-handoff-secret";
  const now = Date.parse("2026-09-11T15:00:00.000Z");

  it("round-trips a valid ticket", () => {
    const ticket = mintHandoffTicket(
      { token: "sess_abc.sig", next: "/profile", host: "gstslip.vin8003.com" },
      secret,
      now,
    );
    const parsed = verifyHandoffTicket(ticket, secret, now + 1_000);
    assert.ok(parsed);
    assert.equal(parsed.t, "sess_abc.sig");
    assert.equal(parsed.n, "/profile");
    assert.equal(parsed.h, "gstslip.vin8003.com");
  });

  it("rejects expired, forged, and wrong-secret tickets", () => {
    const ticket = mintHandoffTicket(
      { token: "sess_abc.sig", next: "/profile", host: "gstslip.vin8003.com" },
      secret,
      now,
    );
    assert.equal(verifyHandoffTicket(ticket, secret, now + HANDOFF_TTL_MS + 1), null);
    assert.equal(verifyHandoffTicket(`${ticket}x`, secret, now), null);
    assert.equal(verifyHandoffTicket(ticket, "other-secret", now), null);
    assert.equal(verifyHandoffTicket("not-a-ticket", secret, now), null);
  });

  it("sets a __Host- session cookie (Secure, Path=/, no Domain)", () => {
    const header = sessionCookieHeader("sess_abc.sig");
    assert.ok(header.startsWith(`${HANDOFF_SESSION_COOKIE}=sess_abc.sig;`));
    assert.ok(header.includes("Path=/"));
    assert.ok(header.includes("Secure"));
    assert.ok(header.includes("HttpOnly"));
    assert.ok(header.includes("SameSite=Lax"));
    assert.equal(header.includes("Domain="), false);
    assert.throws(() => sessionCookieHeader("bad;token"));
  });
});
