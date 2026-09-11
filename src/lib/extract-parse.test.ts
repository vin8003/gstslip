import assert from "node:assert/strict";
import test from "node:test";
import {
  extractHasSignal,
  parseExtracted,
  repairTruncatedJson,
  salvageJsonCandidates,
  shouldRetryExtract,
} from "./extract-parse.ts";

test("parseExtracted reads fenced JSON", () => {
  const result = parseExtracted(`\`\`\`json
{"is_invoice":true,"invoice_number":"GST/24-25/118","supplier_gstin":"07AABCU9603R1ZX","total_invoice_value":1180,"line_items":[{"description":"Service","taxable_value":1000}]}
\`\`\``);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields.invoice_number, "GST/24-25/118");
  assert.equal(result.lineItems.length, 1);
});

test("parseExtracted salvages truncated JSON", () => {
  const raw = '{"is_invoice":true,"invoice_number":"A-9","supplier_name":"Acme","line_items":[{"description":"Widget","taxable_value":200},{"description":"Wai';
  const repaired = repairTruncatedJson(raw);
  assert.match(repaired, /}$/);
  const result = parseExtracted(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields.invoice_number, "A-9");
  assert.equal(result.fields.supplier_name, "Acme");
  assert.ok(result.lineItems.length >= 1);
});

test("salvageJsonCandidates prefers the object body", () => {
  const candidates = salvageJsonCandidates('Sure.\n{"invoice_number":"12"}');
  assert.ok(candidates.some((item) => item === '{"invoice_number":"12"}'));
});

test("shouldRetryExtract retries timeouts and empty reads, not auth", () => {
  assert.equal(shouldRetryExtract({ ok: false, error: "This page timed out. Retry." }), true);
  assert.equal(shouldRetryExtract({ ok: false, error: "Extraction is busy. Retry in a moment." }), true);
  assert.equal(shouldRetryExtract({ ok: false, error: "Extraction is not authorised in this environment." }), false);
  assert.equal(
    shouldRetryExtract({
      ok: true,
      isInvoice: true,
      fields: {},
      lineItems: [],
      notes: "blurry",
    }),
    true,
  );
  assert.equal(
    extractHasSignal({
      ok: true,
      isInvoice: true,
      fields: { invoice_number: "1" },
      lineItems: [],
      notes: "",
    }),
    true,
  );
  assert.equal(
    shouldRetryExtract({
      ok: true,
      isInvoice: true,
      fields: { invoice_number: "1" },
      lineItems: [],
      notes: "",
    }),
    false,
  );
});
