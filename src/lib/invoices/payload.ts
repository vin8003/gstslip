import {
  coerceInvoice,
  hasMeaningfulInvoiceData,
  type GstInvoice,
} from "../gst.ts";

export type AnalysisStatus = "idle" | "running" | "error" | "complete";

export type StoredInvoiceSummary = {
  id: string;
  capturedAt: string;
  updatedAt: string;
  sourceName: string;
  invoiceNumber: string;
  supplierName: string;
  taxableValue: string;
  analysisStatus: AnalysisStatus;
  pendingQuota: boolean;
  fileCount: number;
  invoice: GstInvoice;
};

export function analysisStatusOf(invoice: GstInvoice): AnalysisStatus {
  const status = invoice.analysis?.status;
  if (status === "running" || status === "error" || status === "complete") return status;
  return "idle";
}

export function shouldPersistInvoice(invoice: GstInvoice): boolean {
  if (invoice.pendingQuota === true) {
    return hasMeaningfulInvoiceData(invoice.fields, invoice.lineItems, invoice.filledFromDefaults);
  }
  return true;
}

export function invoiceBucket(
  status: AnalysisStatus,
  live: boolean,
): "background" | "historical" {
  if (live || status === "running" || status === "error") return "background";
  return "historical";
}

export function serializeInvoice(invoice: GstInvoice): string {
  return JSON.stringify({
    id: invoice.id,
    sourceName: invoice.sourceName,
    capturedAt: invoice.capturedAt,
    fields: invoice.fields,
    notes: invoice.notes,
    filledFromDefaults: invoice.filledFromDefaults,
    lineItems: invoice.lineItems,
    pageCount: invoice.pageCount,
    pendingQuota: invoice.pendingQuota === true ? true : undefined,
    originalFileCount: invoice.originalFileCount,
    analysis: invoice.analysis,
  });
}

export function parseInvoice(raw: string): GstInvoice | null {
  try {
    return coerceInvoice(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function listingFields(invoice: GstInvoice): {
  invoiceNumber: string;
  supplierName: string;
  taxableValue: string;
} {
  return {
    invoiceNumber: invoice.fields.invoice_number.trim(),
    supplierName: invoice.fields.supplier_name.trim(),
    taxableValue: invoice.fields.taxable_value.trim(),
  };
}
