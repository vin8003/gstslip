import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extendPeriodEnd,
  grantSource,
  isAdminEmail,
  isPreviewOperatorMode,
  readAdminEmails,
} from "./access.ts";

describe("admin access", () => {
  it("parses comma, semicolon, and newline allowlists", () => {
    assert.deepEqual(
      readAdminEmails({ GSTSLIP_ADMIN_EMAILS: "ops@gstslip.in, other@x.com" }),
      ["ops@gstslip.in", "other@x.com"],
    );
    assert.deepEqual(readAdminEmails({ ADMIN_EMAILS: "A@X.COM; a@x.com" }), ["a@x.com"]);
  });

  it("treats missing DATABASE_URL as preview operator mode", () => {
    assert.equal(isPreviewOperatorMode({}), true);
    assert.equal(isPreviewOperatorMode({ DATABASE_URL: "postgres://n" }), false);
  });

  it("allows preview sessions when no allowlist is set", () => {
    assert.equal(isAdminEmail("anyone@gstslip.in", {}), true);
    assert.equal(isAdminEmail("anyone@gstslip.in", { DATABASE_URL: "postgres://n" }), false);
    assert.equal(
      isAdminEmail("ops@gstslip.in", {
        DATABASE_URL: "postgres://n",
        GSTSLIP_ADMIN_EMAILS: "ops@gstslip.in",
      }),
      true,
    );
  });

  it("extends Pro from the later of now and the current end", () => {
    const now = new Date("2026-09-13T00:00:00.000Z");
    assert.equal(extendPeriodEnd(null, now, 30), "2026-10-13T00:00:00.000Z");
    assert.equal(extendPeriodEnd("2026-11-01T00:00:00.000Z", now, 30), "2026-12-01T00:00:00.000Z");
    assert.equal(extendPeriodEnd("2026-01-01T00:00:00.000Z", now, 30), "2026-10-13T00:00:00.000Z");
  });

  it("labels desk grants separately from Razorpay orders", () => {
    assert.equal(grantSource(null), "none");
    assert.equal(grantSource("desk_abc_1"), "desk");
    assert.equal(grantSource("order_9x"), "razorpay");
  });
});
