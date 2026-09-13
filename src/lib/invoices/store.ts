import { createServerFn } from "@tanstack/react-start";
import { userQuotaId } from "@/lib/quota/rules";
import { optionalSession } from "@/lib/quota/session";
import {
  analysisStatusOf,
  listingFields,
  parseInvoice,
  serializeInvoice,
  shouldPersistInvoice,
  type StoredInvoiceSummary,
} from "./payload";
import { MAX_INVOICE_PAGES, type GstInvoice } from "@/lib/gst";
import type { OriginalFile } from "./files";
import { mimeFromName, safeFileName } from "./files";

export type { StoredInvoiceSummary };

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ownerKey(userId: string | null): Promise<string> {
  if (userId) return userQuotaId(userId);
  const { hashedClientIp } = await import("@/lib/quota/ip.server");
  return hashedClientIp();
}

type InvoiceRow = {
  id: string;
  captured_at: string | Date;
  updated_at: string | Date;
  source_name: string;
  invoice_number: string;
  supplier_name: string;
  taxable_value: string;
  analysis_status: string;
  pending_quota: boolean;
  payload: string;
  file_count?: number | string;
};

function iso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function mapRow(row: InvoiceRow): StoredInvoiceSummary | null {
  const invoice = parseInvoice(row.payload);
  if (!invoice) return null;
  const status = analysisStatusOf(invoice);
  return {
    id: row.id,
    capturedAt: iso(row.captured_at),
    updatedAt: iso(row.updated_at),
    sourceName: row.source_name || invoice.sourceName,
    invoiceNumber: row.invoice_number || invoice.fields.invoice_number,
    supplierName: row.supplier_name || invoice.fields.supplier_name,
    taxableValue: row.taxable_value || invoice.fields.taxable_value,
    analysisStatus: status,
    pendingQuota: row.pending_quota === true || invoice.pendingQuota === true,
    fileCount: Math.max(0, Number(row.file_count ?? invoice.originalFileCount ?? 0)),
    invoice: {
      ...invoice,
      originalFileCount: Math.max(0, Number(row.file_count ?? invoice.originalFileCount ?? 0)) || undefined,
    },
  };
}

export const listStoredInvoices = createServerFn({ method: "GET" })
  .middleware([optionalSession])
  .handler(async ({ context }): Promise<StoredInvoiceSummary[]> => {
    const key = await ownerKey(context.userId);
    const db = await sql();
    const rows = await db<InvoiceRow>`
      select id, captured_at, updated_at, source_name, invoice_number, supplier_name,
             taxable_value, analysis_status, pending_quota, payload,
             (select count(*)::int from stored_invoice_files f
              where f.invoice_id = stored_invoices.id and f.owner_key = stored_invoices.owner_key) as file_count
      from stored_invoices
      where owner_key = ${key}
      order by captured_at desc
      limit 200
    `;
    const out: StoredInvoiceSummary[] = [];
    for (const row of rows) {
      const mapped = mapRow(row);
      if (mapped) out.push(mapped);
    }
    return out;
  });

export const upsertStoredInvoice = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator((input: { invoice?: GstInvoice }) => ({
    invoice: input?.invoice ?? null,
  }))
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    if (!data.invoice || !shouldPersistInvoice(data.invoice)) return { ok: false };
    const invoice = data.invoice;
    const key = await ownerKey(context.userId);
    const listing = listingFields(invoice);
    const db = await sql();
    const payload = serializeInvoice(invoice);
    const status = analysisStatusOf(invoice);
    await db`
      insert into stored_invoices (
        id, owner_key, captured_at, updated_at, source_name, invoice_number,
        supplier_name, taxable_value, analysis_status, pending_quota, payload
      )
      values (
        ${invoice.id},
        ${key},
        ${invoice.capturedAt},
        now(),
        ${invoice.sourceName},
        ${listing.invoiceNumber},
        ${listing.supplierName},
        ${listing.taxableValue},
        ${status},
        ${invoice.pendingQuota === true},
        ${payload}
      )
      on conflict (id, owner_key) do update
        set updated_at = now(),
            source_name = excluded.source_name,
            invoice_number = excluded.invoice_number,
            supplier_name = excluded.supplier_name,
            taxable_value = excluded.taxable_value,
            analysis_status = excluded.analysis_status,
            pending_quota = excluded.pending_quota,
            payload = excluded.payload
    `;
    return { ok: true };
  });

export const deleteStoredInvoice = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").trim(),
  }))
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    if (!data.id) return { ok: false };
    const key = await ownerKey(context.userId);
    const db = await sql();
    await db`
      delete from stored_invoice_files where invoice_id = ${data.id} and owner_key = ${key}
    `;
    await db`
      delete from stored_invoices where id = ${data.id} and owner_key = ${key}
    `;
    return { ok: true };
  });

export const saveStoredInvoiceFiles = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator((input: { id?: string; files?: OriginalFile[]; mode?: "replace" | "append" }) => ({
    id: String(input?.id ?? "").trim(),
    mode: input?.mode === "append" ? "append" : "replace",
    files: Array.isArray(input?.files)
      ? input.files
          .slice(0, MAX_INVOICE_PAGES)
          .map((file, index) => ({
            name: safeFileName(String(file?.name ?? ""), `page-${index + 1}.jpg`),
            mimeType: String(file?.mimeType ?? mimeFromName(String(file?.name ?? ""))),
            base64: String(file?.base64 ?? "").replace(/\s+/g, ""),
          }))
          .filter((file) => file.base64.length > 0)
      : [],
  }))
  .handler(async ({ context, data }): Promise<{ ok: boolean; fileCount: number }> => {
    if (!data.id || !data.files.length) return { ok: false, fileCount: 0 };
    const key = await ownerKey(context.userId);
    const db = await sql();
    let start = 0;
    if (data.mode === "replace") {
      await db`delete from stored_invoice_files where invoice_id = ${data.id} and owner_key = ${key}`;
    } else {
      const rows = await db<{ n: number }>`
        select coalesce(max(page_index), -1)::int + 1 as n
        from stored_invoice_files
        where invoice_id = ${data.id} and owner_key = ${key}
      `;
      start = Number(rows[0]?.n ?? 0);
    }
    const room = Math.max(0, MAX_INVOICE_PAGES - start);
    const files = data.files.slice(0, room);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const size = Math.floor((file.base64.length * 3) / 4);
      await db`
        insert into stored_invoice_files (
          invoice_id, owner_key, page_index, file_name, mime_type, byte_size, data_base64
        )
        values (
          ${data.id}, ${key}, ${start + i}, ${file.name}, ${file.mimeType}, ${size}, ${file.base64}
        )
        on conflict (invoice_id, owner_key, page_index) do update
          set file_name = excluded.file_name,
              mime_type = excluded.mime_type,
              byte_size = excluded.byte_size,
              data_base64 = excluded.data_base64
      `;
    }
    const countRows = await db<{ n: number }>`
      select count(*)::int as n from stored_invoice_files
      where invoice_id = ${data.id} and owner_key = ${key}
    `;
    return { ok: true, fileCount: Number(countRows[0]?.n ?? files.length) };
  });

export const getStoredInvoiceFiles = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").trim(),
  }))
  .handler(async ({ context, data }): Promise<{ files: OriginalFile[] }> => {
    if (!data.id) return { files: [] };
    const key = await ownerKey(context.userId);
    const db = await sql();
    const rows = await db<{ file_name: string; mime_type: string; data_base64: string }>`
      select file_name, mime_type, data_base64
      from stored_invoice_files
      where invoice_id = ${data.id} and owner_key = ${key}
      order by page_index asc
    `;
    return {
      files: rows.map((row) => ({
        name: row.file_name,
        mimeType: row.mime_type,
        base64: row.data_base64,
      })),
    };
  });

