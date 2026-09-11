import { createServerFn } from "@tanstack/react-start";
import {
  AMOUNT_FIELDS,
  INVOICE_FIELDS,
  type InvoiceField,
} from "./gst";
import {
  extractHasSignal,
  messageText,
  parseExtracted,
  type ExtractErr,
  type ExtractOk,
  type ExtractResult,
} from "./extract-parse";

export type { ExtractErr, ExtractOk, ExtractResult };
export { extractHasSignal, shouldRetryExtract } from "./extract-parse";

export type ExtractPage = { imageBase64: string; mimeType: string };

export type ExtractInput = {
  pages: ExtractPage[];
  pageIndex?: number;
  pageCount?: number;
};

const FAST_MODEL = "grok-4-fast";
const FALLBACK_MODEL = "grok-4.5";
const CALL_TIMEOUT_MS = 40_000;
const MAX_TOKENS = 2800;

const SYSTEM_PROMPT = `Extract India GST tax invoice JSON from THIS page only.
Keys: is_invoice, notes, invoice_number, invoice_date, supplier_name, supplier_gstin, supplier_address, supplier_place, supplier_pincode, buyer_name, buyer_gstin, buyer_address, buyer_place, buyer_pincode, hsn_sac, taxable_value, cgst, sgst, igst, total_invoice_value, place_of_supply, irn, ack_no, ack_date, signed_qr, line_items[{description,hsn_sac,quantity,unit,rate,taxable_value,cgst,sgst,igst,line_total}].
Unreadable text "". Unreadable amounts null. Never invent GSTIN, IRN, names, or amounts. Dates YYYY-MM-DD. Amounts as numbers. line_items = billed rows on this page only; skip totals/tax-summary rows. Return a single JSON object.`;

function pageMessages(
  pages: Array<{ mime: string; raw: string }>,
  pageIndex: number,
  pageCount: number,
) {
  const images = pages.map((page) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${page.mime};base64,${page.raw}`,
      detail: "auto" as const,
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
      if (page.raw.length > 1_200_000) {
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

  const first = await callModel(apiKey, FAST_MODEL, messages, true);
  if (first.kind === "ok") return first.result;
  if (first.kind === "auth") {
    return { ok: false, error: "Extraction is not authorised in this environment." };
  }

  if (first.kind === "bad_model") {
    const fallback = await callModel(apiKey, FALLBACK_MODEL, messages, false);
    if (fallback.kind === "ok") return fallback.result;
    return mapCallError(fallback);
  }

  return mapCallError(first);
}

function mapCallError(outcome: Exclude<CallOutcome, { kind: "ok" }>): ExtractErr {
  if (outcome.kind === "timeout") {
    return { ok: false, error: "This page timed out. Retry from the register row." };
  }
  if (outcome.kind === "auth") {
    return { ok: false, error: "Extraction is not authorised in this environment." };
  }
  if (outcome.kind === "busy") {
    return { ok: false, error: "Extraction is busy. Retry in a moment." };
  }
  if (outcome.kind === "network") {
    return { ok: false, error: "Could not reach the extraction service. Retry." };
  }
  return { ok: false, error: "Could not read this page. Try a clearer photo, then retry." };
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
  jsonMode: boolean,
): Promise<CallOutcome> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: MAX_TOKENS,
    messages,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetchCompletions(apiKey, body, CALL_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) return { kind: "timeout" };
    return { kind: "network" };
  }

  if (res.status === 400 || res.status === 404) return { kind: "bad_model" };
  if (res.status === 401 || res.status === 403) return { kind: "auth" };
  if (res.status === 429) return { kind: "busy" };
  if (!res.ok) return { kind: "fail", status: res.status };

  let payload: { choices?: { message?: { content?: unknown }; finish_reason?: string }[] };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { kind: "fail" };
  }
  const parsed = parseExtracted(messageText(payload.choices?.[0]?.message?.content ?? ""));
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
      return { ok: false, error: "Extraction timed out. Retry from the register row." };
    }
    const first = parts.find((part): part is ExtractErr => !part.ok);
    return first ?? { ok: false, error: "Could not read this document." };
  }

  const invoicePages = oks.filter((part) => part.isInvoice || extractHasSignal(part));
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
