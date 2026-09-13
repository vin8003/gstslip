import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canUseFreeQuota, clampUsed, mergeUsed, normalizeIp, remainingOf } from "./rules.ts";

describe("quota rules", () => {
  it("never lets login reset a higher IP or user count", () => {
    assert.equal(mergeUsed(0, 4), 4);
    assert.equal(mergeUsed(7, 2), 7);
    assert.equal(mergeUsed(10, 3), 10);
    assert.equal(clampUsed(-2), 0);
    assert.equal(clampUsed(99), 10);
  });

  it("blocks signed-in free captures until email is verified", () => {
    assert.deepEqual(
      canUseFreeQuota({ isPro: false, signedIn: true, emailVerified: false, used: 0 }),
      { ok: false, reason: "unverified" },
    );
    assert.deepEqual(
      canUseFreeQuota({ isPro: false, signedIn: true, emailVerified: true, used: 0 }),
      { ok: true },
    );
    assert.deepEqual(
      canUseFreeQuota({ isPro: true, signedIn: true, emailVerified: false, used: 0 }),
      { ok: true },
    );
  });

  it("lets signed-out IPs use the free quota without email", () => {
    assert.deepEqual(
      canUseFreeQuota({ isPro: false, signedIn: false, emailVerified: false, used: 3 }),
      { ok: true },
    );
    assert.deepEqual(
      canUseFreeQuota({ isPro: false, signedIn: false, emailVerified: false, used: 10 }),
      { ok: false, reason: "exhausted" },
    );
  });

  it("normalizes v4-mapped IPv6", () => {
    assert.equal(normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
    assert.equal(normalizeIp("  2001:db8::1%eth0  "), "2001:db8::1");
    assert.equal(remainingOf(3, false), 7);
  });
});
