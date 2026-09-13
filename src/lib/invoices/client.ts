import { hydrateGstStore, useGstStore } from "@/lib/store";
import type { GstInvoice } from "@/lib/gst";
import { shouldPersistInvoice, type StoredInvoiceSummary } from "./payload";
import { downloadOriginals, fileToOriginal, type OriginalFile } from "./files";
import {
  deleteStoredInvoice,
  getStoredInvoiceFiles,
  listStoredInvoices,
  saveStoredInvoiceFiles,
  upsertStoredInvoice,
} from "./store";

export type { StoredInvoiceSummary, OriginalFile };

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const originalCache = new Map<string, OriginalFile[]>();

export async function pullStoredInvoices(): Promise<StoredInvoiceSummary[]> {
  try {
    return await listStoredInvoices();
  } catch {
    return [];
  }
}

export function mergeStoredIntoRegister(rows: StoredInvoiceSummary[]): void {
  hydrateGstStore();
  const store = useGstStore.getState();
  const have = new Set(store.invoices.map((invoice) => invoice.id));
  for (const row of rows) {
    const invoice = {
      ...row.invoice,
      originalFileCount: row.fileCount || row.invoice.originalFileCount,
    };
    if (have.has(row.id)) {
      if (row.fileCount && !store.invoices.find((item) => item.id === row.id)?.originalFileCount) {
        store.updateInvoice(row.id, { originalFileCount: row.fileCount });
      }
      continue;
    }
    store.mergeInvoice(invoice);
    have.add(row.id);
  }
}

export function persistStoredInvoice(invoice: GstInvoice): void {
  if (!shouldPersistInvoice(invoice)) return;
  const prev = timers.get(invoice.id);
  if (prev) clearTimeout(prev);
  timers.set(
    invoice.id,
    setTimeout(() => {
      timers.delete(invoice.id);
      void upsertStoredInvoice({ data: { invoice } }).catch(() => {
        /* keep the on-device row if the archive is unreachable */
      });
    }, 360),
  );
}

export function persistStoredInvoiceNow(invoice: GstInvoice): void {
  const prev = timers.get(invoice.id);
  if (prev) clearTimeout(prev);
  timers.delete(invoice.id);
  if (!shouldPersistInvoice(invoice)) return;
  void upsertStoredInvoice({ data: { invoice } }).catch(() => {
    /* keep the on-device row if the archive is unreachable */
  });
}

export function removeStoredInvoice(id: string): void {
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);
  timers.delete(id);
  originalCache.delete(id);
  void deleteStoredInvoice({ data: { id } }).catch(() => {
    /* local delete still stands */
  });
}

export async function rememberOriginalFiles(
  invoiceId: string,
  files: File[],
  mode: "replace" | "append" = "replace",
): Promise<void> {
  if (!files.length) return;
  const originals = await Promise.all(files.map(fileToOriginal));
  const current = originalCache.get(invoiceId) ?? [];
  const next = mode === "append" ? [...current, ...originals].slice(0, 4) : originals.slice(0, 4);
  originalCache.set(invoiceId, next);
  hydrateGstStore();
  useGstStore.getState().updateInvoice(invoiceId, { originalFileCount: next.length });
  try {
    const saved = await saveStoredInvoiceFiles({ data: { id: invoiceId, files: originals, mode } });
    if (saved.fileCount) {
      useGstStore.getState().updateInvoice(invoiceId, { originalFileCount: saved.fileCount });
    }
  } catch {
    /* session cache still lets this visit download */
  }
}

export async function downloadOriginalFiles(invoiceId: string, zipName?: string): Promise<boolean> {
  let files = originalCache.get(invoiceId) ?? [];
  if (!files.length) {
    try {
      const result = await getStoredInvoiceFiles({ data: { id: invoiceId } });
      files = result.files;
      if (files.length) originalCache.set(invoiceId, files);
    } catch {
      files = [];
    }
  }
  if (!files.length) return false;
  const invoice = useGstStore.getState().invoices.find((row) => row.id === invoiceId);
  const stamp = (invoice?.fields.invoice_number || invoice?.sourceName || "invoice")
    .replace(/[^\w.+-]+/g, "_")
    .slice(0, 40);
  downloadOriginals(files, zipName || `gstslip-${stamp || "invoice"}-originals.zip`);
  return true;
}
