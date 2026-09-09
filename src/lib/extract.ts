import { createServerFn } from "@tanstack/react-start";
import {
  AMOUNT_FIELDS,
  INVOICE_FIELDS,
  LINE_ITEM_FIELDS,
  type InvoiceField,
  type LineItemField,
} from "./gst";

export type ExtractPage = { imageBase64: string; mimeType: string };

export type ExtractOk = {
  ok: true;
  isInvoice: boolean;
  fields: Partial<Record<InvoiceField, string | number>>;
  lineItems: Array<Partial<Record<LineItemField, string | number>>>;
  notes: string;
};

export type ExtractErr = { ok: false; error: string };

export type ExtractResult = ExtractOk | ExtractErr;

export type ExtractInput = {
  pages: ExtractPage[];
  pageIndex?: number;
  pageCount?: number;
};

const FAST_MODEL = "grok-4-fast";
const FALLBACK_MODEL = "grok-4.5";
let preferredModel = FAST_MODEL;

const SYSTEM_PROMPT = `Extract India GST tax invoice JSON from THIS page only.
Keys: is_invoice, notes, invoice_number, invoice_date, supplier_name, supplier_gstin, supplier_address, supplier_place, supplier_pincode, buyer_name, buyer_gstin, buyer_address, buyer_place, buyer_pincode, hsn_sac, taxable_value, cgst, sgst, igst, total_invoice_value, place_of_supply, irn, ack_no, ack_date, signed_qr, line_items[{description,hsn_sac,quantity,unit,rate,taxable_value,cgst,sgst,igst,line_total}].
Unreadable text "". Unreadable amounts null. Never invent GSTIN, IRN, names, or amounts. Dates YYYY-MM-DD. Amounts as numbers. line_items = billed rows on this page only; skip totals/tax-summary rows.`;

function pageMessages(
  pages: Array<{ mime: string; raw: string }>,
  pageIndex: number,
  pageCount: number,
) {
  const images = pages.map((page) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${page.mime};base64,${page.raw}`,
      detail: pageIndex === 0 ? "auto" : "low",
    },
  }));
  const hint =
    pageCount > 1
      ? `Page ${pageIndex + 1} of ${pageCount} of one invoice. Header only if printed here. Line items on this page only. JSON only.`
      : "Extract fields and line items. JSON only.";
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: [...images, { type: "text" as const, text: hint }],
    },
  ];
}

function normalizePages(input: ExtractPage[]): Array<{ mime: string; raw: string }> {
  return input.slice(0, 4).map((page) => ({
    mime: page.mimeType === "image/png" ? "image/png" : "image/jpeg",
    raw: page.imageBase64.replace(/^data:[^;]+;base64,/, ""),
  }));
}

export const extractInvoice = createServerFn({ method: "POST" })
  .validator((input: ExtractInput) => input)
  .handler(async ({ data }): Promise<ExtractResult> => {
    const apiKey = process.env.XAI_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, error: "AI extraction is not available in this environment." };
    }

    const pages = normalizePages(data.pages ?? []);
    if (!pages.length) {
      return { ok: false, error: "No document pages were provided." };
    }
    for (const page of pages) {
      if (!page.raw || page.raw.length < 80) {
        return { ok: false, error: "A document image is empty." };
      }
      if (page.raw.length > 900_000) {
        return { ok: false, error: "A page is too large. Photograph a tighter crop." };
      }
    }

    const pageCount = Math.max(1, data.pageCount ?? pages.length);
    const pageIndex = Math.min(Math.max(0, data.pageIndex ?? 0), pageCount - 1);

    if (pages.length === 1) {
      return extractOnePage(apiKey, pages[0], pageIndex, pageCount);
    }

    const parts = await Promise.all(
      pages.map((page, index) => extractOnePage(apiKey, page, index, pages.length)),
    );
    return mergeExtractResults(parts);
  });

async function extractOnePage(
  apiKey: string,
  page: { mime: string; raw: string },
  pageIndex: number,
  pageCount: number,
): Promise<ExtractResult> {
  const messages = pageMessages([page], pageIndex, pageCount);
  const maxTokens = pageCount > 1 && pageIndex > 0 ? 1200 : 1600;

  const first = await callModel(apiKey, preferredModel, messages, maxTokens, 18_000);
  if (first.kind === "ok") return first.result;
  if (first.kind === "timeout") {
    return { ok: false, error: "Extraction timed out. Try a tighter crop of the invoice." };
  }
  if (first.kind === "auth") {
    return { ok: false, error: "Extraction is not authorised in this environment." };
  }
  if (first.kind === "busy") {
    return { ok: false, error: "Extraction is busy. Try again in a moment." };
  }
  if (first.kind === "network") {
    return { ok: false, error: "Could not reach the extraction service. Try again." };
  }

  if (preferredModel !== FALLBACK_MODEL) {
    preferredModel = FALLBACK_MODEL;
    const second = await callModel(apiKey, FALLBACK_MODEL, messages, maxTokens, 20_000);
    if (second.kind === "ok") return second.result;
    if (second.kind === "timeout") {
      return { ok: false, error: "Extraction timed out. Try a tighter crop of the invoice." };
    }
  }
  return { ok: false, error: "Extraction failed. Try a clearer photo." };
}

type CallOutcome =
  | { kind: "ok"; result: ExtractResult }
  | { kind: "timeout" }
  | { kind: "auth" }
  | { kind: "busy" }
  | { kind: "bad_model" }
  | { kind: "network" }
  | { kind: "fail"; status?: number };

async function callModel(
  apiKey: string,
  model: string,
  messages: unknown,
  maxTokens: number,
  timeoutMs: number,
): Promise<CallOutcome> {
  let res: Response;
  try {
    res = await fetchCompletions(
      apiKey,
      {
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      },
      timeoutMs,
    );
  } catch (error) {
    if (isAbortError(error)) return { kind: "timeout" };
    return { kind: "network" };
  }

  if (res.status === 400 || res.status === 404) return { kind: "bad_model" };
  if (res.status === 401 || res.status === 403) return { kind: "auth" };
  if (res.status === 429) return { kind: "busy" };
  if (!res.ok) return { kind: "fail", status: res.status };

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const parsed = parseExtracted(payload.choices?.[0]?.message?.content ?? "");
  if (!parsed.ok) return { kind: "fail" };
  return { kind: "ok", result: parsed };
}

async function fetchCompletions(
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "AbortError"
  );
}

function fieldValue(
  value: string | number | undefined,
): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  return value;
}

export function mergeExtractResults(parts: ExtractResult[]): ExtractResult {
  const oks = parts.filter((part): part is ExtractOk => part.ok);
  if (!oks.length) {
    const timeout = parts.some(
      (part) => !part.ok && /timed out/i.test(part.error),
    );
    if (timeout) {
      return { ok: false, error: "Extraction timed out. Try a tighter crop of the invoice." };
    }
    const first = parts.find((part): part is ExtractErr => !part.ok);
    return first ?? { ok: false, error: "Could not read this document." };
  }

  const invoicePages = oks.filter((part) => part.isInvoice);
  const usable = invoicePages.length ? invoicePages : oks;
  const fields: Partial<Record<InvoiceField, string | number>> = {};

  for (const key of INVOICE_FIELDS) {
    if (key === "hsn_sac") continue;
    const preferLast = AMOUNT_FIELDS.includes(key);
    const ordered = preferLast ? [...usable].reverse() : usable;
    for (const part of ordered) {
      const value = fieldValue(part.fields[key]);
      if (value === undefined) continue;
      fields[key] = value;
      break;
    }
  }

  const hsnSeen = new Set<string>();
  const hsns: string[] = [];
  for (const part of usable) {
    const raw = part.fields.hsn_sac;
    if (typeof raw !== "string") continue;
    for (const piece of raw.split(/[,;/]+/)) {
      const code = piece.trim();
      if (!code) continue;
      const token = code.toUpperCase();
      if (hsnSeen.has(token)) continue;
      hsnSeen.add(token);
      hsns.push(code);
    }
  }
  if (hsns.length) fields.hsn_sac = hsns.join(", ");

  const failed = parts.length - oks.length;
  const notes = [
    ...usable.map((part) => part.notes).filter((note) => note.trim()),
    failed ? `${failed} page${failed === 1 ? "" : "s"} could not be read` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    ok: true,
    isInvoice:
      usable.some((part) => part.isInvoice) ||
      usable.some((part) => part.lineItems.length > 0 || Boolean(fieldValue(part.fields.invoice_number))),
    fields,
    lineItems: usable.flatMap((part) => part.lineItems),
    notes,
  };
}

function parseExtracted(content: string): ExtractResult {
  const json = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const isInvoice = parsed.is_invoice !== false;
    const fields: Partial<Record<InvoiceField, string | number>> = {};
    for (const key of INVOICE_FIELDS) {
      const value = parsed[key];
      if (typeof value === "number" && Number.isFinite(value)) fields[key] = value;
      else if (typeof value === "string" && value.trim()) fields[key] = value.trim();
    }
    return {
      ok: true,
      isInvoice,
      fields,
      lineItems: parseLineItems(parsed.line_items),
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  } catch {
    return { ok: false, error: "Could not read structured fields from the document." };
  }
}

function parseLineItems(
  raw: unknown,
): Array<Partial<Record<LineItemField, string | number>>> {
  if (!Array.isArray(raw)) return [];
  const items: Array<Partial<Record<LineItemField, string | number>>> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const item: Partial<Record<LineItemField, string | number>> = {};
    let hasValue = false;
    for (const key of LINE_ITEM_FIELDS) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        item[key] = value;
        hasValue = true;
      } else if (typeof value === "string" && value.trim()) {
        item[key] = value.trim();
        hasValue = true;
      }
    }
    if (hasValue) items.push(item);
  }
  return items;
}
