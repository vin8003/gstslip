import {
  INVOICE_FIELDS,
  LINE_ITEM_FIELDS,
  type InvoiceField,
  type LineItemField,
} from "./gst.ts";

export type ExtractOk = {
  ok: true;
  isInvoice: boolean;
  fields: Partial<Record<InvoiceField, string | number>>;
  lineItems: Array<Partial<Record<LineItemField, string | number>>>;
  notes: string;
};

export type ExtractErr = { ok: false; error: string };

export type ExtractResult = ExtractOk | ExtractErr;

export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function salvageJsonCandidates(content: string): string[] {
  const trimmed = content.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = unfenced.indexOf("{");
  const fromBrace = start >= 0 ? unfenced.slice(start) : unfenced;
  const end = fromBrace.lastIndexOf("}");
  const object = end >= 0 ? fromBrace.slice(0, end + 1) : "";
  const repaired = repairTruncatedJson(end >= 0 ? object : fromBrace);
  const out: string[] = [];
  for (const item of [unfenced, object, repaired]) {
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

export function repairTruncatedJson(text: string): string {
  let s = text.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return "";
  s = s.replace(/,\s*"[^"\\]*$/u, "");
  s = s.replace(/:\s*"[^"\\]*$/u, ':""');
  s = s.replace(/:\s*-?\d+(?:\.\d*)?$/u, ":null");
  s = s.replace(/,\s*$/u, "");
  let braces = 0;
  let brackets = 0;
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === "[") brackets += 1;
    else if (ch === "]") brackets -= 1;
  }
  if (inStr) s += '"';
  while (brackets > 0) {
    s += "]";
    brackets -= 1;
  }
  while (braces > 0) {
    s += "}";
    braces -= 1;
  }
  return s;
}

export function parseExtracted(content: string): ExtractResult {
  for (const json of salvageJsonCandidates(content)) {
    try {
      return normalizeParsed(JSON.parse(json) as Record<string, unknown>);
    } catch {
      continue;
    }
  }
  return { ok: false, error: "Could not read structured fields from the document." };
}

export function extractHasSignal(result: ExtractResult): boolean {
  if (!result.ok) return false;
  if (result.lineItems.length > 0) return true;
  const fields = result.fields;
  return Boolean(
    fields.invoice_number ||
      fields.supplier_gstin ||
      fields.buyer_gstin ||
      fields.supplier_name ||
      fields.total_invoice_value ||
      fields.taxable_value ||
      fields.irn,
  );
}

export function shouldRetryExtract(result: ExtractResult): boolean {
  if (result.ok) return !extractHasSignal(result);
  const error = result.error.toLowerCase();
  if (error.includes("not authorised")) return false;
  if (error.includes("not available in this environment")) return false;
  if (error.includes("empty")) return false;
  if (error.includes("too large")) return false;
  return true;
}

function normalizeParsed(parsed: Record<string, unknown>): ExtractResult {
  const fields: Partial<Record<InvoiceField, string | number>> = {};
  for (const key of INVOICE_FIELDS) {
    const value = parsed[key];
    if (typeof value === "number" && Number.isFinite(value)) fields[key] = value;
    else if (typeof value === "string" && value.trim()) fields[key] = value.trim();
  }
  return {
    ok: true,
    isInvoice: parsed.is_invoice !== false,
    fields,
    lineItems: parseLineItems(parsed.line_items),
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
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
