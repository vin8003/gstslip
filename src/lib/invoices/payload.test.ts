import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_FIELDS, type GstInvoice } from "../gst.ts";
import { analysisStatusOf, invoiceBucket, shouldPersistInvoice } from "./payload.ts";

function invoice(patch: Partial<GstInvoice>): GstInvoice {
  return {
    id: "inv_1",
    sourceName: "capture.jpg",
    capturedAt: "2026-09-13T00:00:00.000Z",
    fields: { ...EMPTY_FIELDS },
    lineItems: [],
    ...patch,
  };
}

describe("stored invoices", () => {
  it("skips empty manual drafts", () => {
    assert.equal(shouldPersistInvoice(invoice({ pendingQuota: true })), false);
    assert.equal(
      shouldPersistInvoice(
        invoice({
          pendingQuota: true,
          fields: { ...EMPTY_FIELDS, invoice_number: "INV-9" },
        }),
      ),
      true,
    );
  });

  it("buckets live and failed rows as background", () => {
    assert.equal(invoiceBucket("complete", false), "historical");
    assert.equal(invoiceBucket("idle", false), "historical");
    assert.equal(invoiceBucket("running", false), "background");
    assert.equal(invoiceBucket("error", false), "background");
    assert.equal(invoiceBucket("idle", true), "background");
  });

  it("reads analysis status from the invoice", () => {
    assert.equal(analysisStatusOf(invoice({})), "idle");
    assert.equal(
      analysisStatusOf(
        invoice({
          analysis: { status: "running", done: 1, total: 2, failed: 0, label: "Page 1" },
        }),
      ),
      "running",
    );
  });
});
