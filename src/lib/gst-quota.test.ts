import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_FIELDS,
  hasMeaningfulInvoiceData,
  type InvoiceFields,
  type LineItem,
} from "./gst.ts";

function fields(patch: Partial<InvoiceFields>): InvoiceFields {
  return { ...EMPTY_FIELDS, ...patch };
}

test("blank form is not meaningful", () => {
  assert.equal(hasMeaningfulInvoiceData(EMPTY_FIELDS, []), false);
});

test("defaults-only form is not meaningful", () => {
  const next = fields({ buyer_gstin: "27AAPFW2194Q1Z3", buyer_name: "Westline" });
  assert.equal(
    hasMeaningfulInvoiceData(next, [], ["buyer_gstin", "buyer_name"]),
    false,
  );
});

test("invoice number is meaningful", () => {
  assert.equal(
    hasMeaningfulInvoiceData(fields({ invoice_number: "INV-1" }), []),
    true,
  );
});

test("user-edited field besides defaults is meaningful", () => {
  const next = fields({
    buyer_name: "Westline",
    invoice_number: "NT/1",
  });
  assert.equal(hasMeaningfulInvoiceData(next, [], ["buyer_name"]), true);
});

test("a real line item is meaningful", () => {
  const item = {
    id: "line-1",
    description: "Cotton",
    hsn_sac: "5208",
    quantity: "1",
    unit: "MTR",
    rate: "10",
    taxable_value: "10",
    cgst: "",
    sgst: "",
    igst: "",
    line_total: "10",
  } satisfies LineItem;
  assert.equal(hasMeaningfulInvoiceData(EMPTY_FIELDS, [item]), true);
});

test("blank line items are ignored", () => {
  const item = {
    id: "line-1",
    description: "",
    hsn_sac: "",
    quantity: "",
    unit: "",
    rate: "",
    taxable_value: "",
    cgst: "",
    sgst: "",
    igst: "",
    line_total: "",
  } satisfies LineItem;
  assert.equal(hasMeaningfulInvoiceData(EMPTY_FIELDS, [item]), false);
});
