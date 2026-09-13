import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRazorpayKeyId,
  normalizeRazorpayValue,
  paymentsModeFrom,
  resolveRazorpayKeys,
} from "./credentials.ts";

describe("razorpay credentials", () => {
  it("strips quotes, labels, and KEY=value paste", () => {
    assert.equal(normalizeRazorpayValue('"rzp_live_abc123xyz"'), "rzp_live_abc123xyz");
    assert.equal(normalizeRazorpayValue("'rzp_test_abc'"), "rzp_test_abc");
    assert.equal(normalizeRazorpayValue("RAZORPAY_KEY_ID=rzp_live_abc123xyz"), "rzp_live_abc123xyz");
    assert.equal(normalizeRazorpayValue("Key Id: rzp_live_abc123xyz"), "rzp_live_abc123xyz");
    assert.equal(normalizeRazorpayValue("  rzp_live_abc123xyz \n"), "rzp_live_abc123xyz");
  });

  it("unswaps Key Id and Key Secret when they were reversed", () => {
    const keys = resolveRazorpayKeys({
      RAZORPAY_KEY_ID: "s3cretValueGoesHere99",
      RAZORPAY_KEY_SECRET: "rzp_live_INmerchant1",
    });
    assert.equal(keys.keyId, "rzp_live_INmerchant1");
    assert.equal(keys.keySecret, "s3cretValueGoesHere99");
    assert.equal(paymentsModeFrom(keys), "live");
  });

  it("reads alias env names", () => {
    const keys = resolveRazorpayKeys({
      RAZORPAY_KEY: "rzp_test_abc123xyz",
      RAZORPAY_SECRET: "testsecretvalue12",
    });
    assert.equal(keys.keyId, "rzp_test_abc123xyz");
    assert.equal(keys.keySecret, "testsecretvalue12");
    assert.equal(paymentsModeFrom(keys), "test");
  });

  it("treats unpaired or short values as off", () => {
    assert.equal(isRazorpayKeyId("rzp_live_abc"), true);
    assert.equal(isRazorpayKeyId("live_abc"), false);
    assert.equal(
      paymentsModeFrom({ keyId: "nope", keySecret: "s3cretValueGoesHere99" }),
      "off",
    );
  });
});
