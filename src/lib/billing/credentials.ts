/**
 * Razorpay Key Id + Key Secret from process env.
 * Dynamic `process.env[name]` so Vite/Nitro cannot bake empty strings at build.
 * Never log these values.
 */

const KEY_ID_NAMES = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY",
  "RZP_KEY_ID",
  "RAZORPAY_API_KEY",
] as const;

const KEY_SECRET_NAMES = [
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_SECRET",
  "RZP_KEY_SECRET",
  "RAZORPAY_API_SECRET",
] as const;

export const RAZORPAY_KEY_ID_RE = /^rzp_(live|test)_[A-Za-z0-9]+$/;

export type RazorpayKeys = {
  keyId: string;
  keySecret: string;
};

export type PaymentsMode = "off" | "test" | "live";

export function normalizeRazorpayValue(raw: string | undefined | null): string {
  let value = String(raw ?? "");
  if (value.charCodeAt(0) === 0xfeff) value = value.slice(1);
  value = value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  value = unwrapQuotes(value).trim();
  value = value.replace(/^(?:razorpay[\s_]*)?(?:key[\s_]*id|key_id|key)\s*[:=]\s*/i, "");
  value = value.replace(/^(?:razorpay[\s_]*)?(?:key[\s_]*secret|key_secret|secret)\s*[:=]\s*/i, "");
  value = unwrapQuotes(value).trim();
  if (/^(?:RAZORPAY_|RZP_)?[A-Z0-9_]+\s*=/.test(value)) {
    value = value.replace(/^[A-Z0-9_]+\s*=\s*/, "");
    value = unwrapQuotes(value).trim();
  }
  return value;
}

function unwrapQuotes(value: string): string {
  if (value.length < 2) return value;
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
    ["\u201c", "\u201d"],
    ["\u2018", "\u2019"],
  ];
  for (const [open, close] of pairs) {
    if (value.startsWith(open) && value.endsWith(close)) {
      return value.slice(open.length, value.length - close.length);
    }
  }
  return value;
}

export function isRazorpayKeyId(value: string): boolean {
  return RAZORPAY_KEY_ID_RE.test(value);
}

function pick(source: Record<string, string | undefined>, names: readonly string[]): string {
  for (const name of names) {
    const value = normalizeRazorpayValue(source[name]);
    if (value) return value;
  }
  return "";
}

function envMap(): Record<string, string | undefined> {
  if (typeof process === "undefined" || !process.env) return {};
  const out: Record<string, string | undefined> = {};
  for (const name of [...KEY_ID_NAMES, ...KEY_SECRET_NAMES]) {
    out[name] = process.env[name];
  }
  return out;
}

/** Resolve and optionally un-swap Key Id / Key Secret. */
export function resolveRazorpayKeys(source: Record<string, string | undefined>): RazorpayKeys {
  let keyId = pick(source, KEY_ID_NAMES);
  let keySecret = pick(source, KEY_SECRET_NAMES);
  if (!isRazorpayKeyId(keyId) && isRazorpayKeyId(keySecret) && keyId) {
    const swapped = keyId;
    keyId = keySecret;
    keySecret = swapped;
  }
  return { keyId, keySecret };
}

export function readRazorpayKeys(): RazorpayKeys {
  return resolveRazorpayKeys(envMap());
}

export function paymentsModeFrom(keys: RazorpayKeys): PaymentsMode {
  if (!keys.keyId || !keys.keySecret || !isRazorpayKeyId(keys.keyId)) return "off";
  if (keys.keySecret.length < 8) return "off";
  return keys.keyId.startsWith("rzp_live_") ? "live" : "test";
}

export const KEYS_REJECTED_MESSAGE =
  "Razorpay rejected the API keys. Use Key Id (starts with rzp_live_ or rzp_test_) plus the matching Key Secret from the same Test/Live toggle — not the webhook secret, and without quotes.";

export const LIVE_TEST_CARD_MESSAGE =
  "The bank or UPI app did not approve this payment. Live keys need a real UPI or card. Razorpay test cards only work with test keys (rzp_test_).";
