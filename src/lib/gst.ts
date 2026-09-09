export const FREE_CAPTURES = 10;
export const MAX_INVOICE_PAGES = 4;

export const INVOICE_FIELDS = [
  "invoice_number",
  "invoice_date",
  "supplier_name",
  "supplier_gstin",
  "supplier_address",
  "supplier_place",
  "supplier_pincode",
  "buyer_name",
  "buyer_gstin",
  "buyer_address",
  "buyer_place",
  "buyer_pincode",
  "hsn_sac",
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "total_invoice_value",
  "place_of_supply",
  "irn",
  "ack_no",
  "ack_date",
  "signed_qr",
] as const;

export type InvoiceField = (typeof INVOICE_FIELDS)[number];

export type InvoiceFields = Record<InvoiceField, string>;

export type GstInvoice = {
  id: string;
  sourceName: string;
  capturedAt: string;
  fields: InvoiceFields;
  notes?: string;
  filledFromDefaults?: InvoiceField[];
  lineItems: LineItem[];
  pageCount?: number;
};

export const LINE_ITEM_FIELDS = [
  "description",
  "hsn_sac",
  "quantity",
  "unit",
  "rate",
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "line_total",
] as const;

export type LineItemField = (typeof LINE_ITEM_FIELDS)[number];

export type LineItem = { id: string } & Record<LineItemField, string>;

export type FieldIssue = { field: InvoiceField; message: string };

export const LINE_ITEM_LABELS: Record<LineItemField, string> = {
  description: "Description",
  hsn_sac: "HSN / SAC",
  quantity: "Qty",
  unit: "Unit",
  rate: "Rate",
  taxable_value: "Taxable",
  cgst: "CGST",
  sgst: "SGST",
  igst: "IGST",
  line_total: "Line total",
};

export const LINE_AMOUNT_FIELDS: LineItemField[] = [
  "quantity",
  "rate",
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "line_total",
];

export const EMPTY_LINE_ITEM: Omit<LineItem, "id"> = {
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
};

export const FIELD_LABELS: Record<InvoiceField, string> = {
  invoice_number: "Invoice number",
  invoice_date: "Invoice date",
  supplier_name: "Supplier name",
  supplier_gstin: "Supplier GSTIN",
  supplier_address: "Supplier address",
  supplier_place: "Supplier place",
  supplier_pincode: "Supplier PIN",
  buyer_name: "Buyer name",
  buyer_gstin: "Buyer GSTIN",
  buyer_address: "Buyer address",
  buyer_place: "Buyer place",
  buyer_pincode: "Buyer PIN",
  hsn_sac: "HSN / SAC",
  taxable_value: "Taxable value",
  cgst: "CGST",
  sgst: "SGST",
  igst: "IGST",
  total_invoice_value: "Total invoice value",
  place_of_supply: "Place of supply",
  irn: "IRN",
  ack_no: "Ack. number",
  ack_date: "Ack. date",
  signed_qr: "Signed QR",
};

export const FIELD_HINTS: Record<InvoiceField, string> = {
  invoice_number: "As printed on the tax invoice",
  invoice_date: "DD/MM/YYYY or YYYY-MM-DD",
  supplier_name: "Registered name of the supplier",
  supplier_gstin: "15-character GSTIN",
  supplier_address: "Street address from the tax invoice",
  supplier_place: "City or locality",
  supplier_pincode: "6-digit PIN code",
  buyer_name: "Registered name of the recipient",
  buyer_gstin: "15-character GSTIN, if B2B",
  buyer_address: "Street address of the recipient",
  buyer_place: "City or locality",
  buyer_pincode: "6-digit PIN code",
  hsn_sac: "Comma-separated HSN or SAC codes",
  taxable_value: "Sum of taxable amounts, INR",
  cgst: "Central GST, INR",
  sgst: "State GST, INR",
  igst: "Integrated GST, INR",
  total_invoice_value: "Grand total including tax",
  place_of_supply: "State name and code, e.g. Maharashtra (27)",
  irn: "64-character Invoice Reference Number",
  ack_no: "IRP acknowledgement number",
  ack_date: "YYYY-MM-DD HH:MM:SS",
  signed_qr: "Signed QR JWT from the IRP, if printed",
};

export const AMOUNT_FIELDS: InvoiceField[] = [
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "total_invoice_value",
];

export const GSTIN_FIELDS: InvoiceField[] = ["supplier_gstin", "buyer_gstin"];

export const PINCODE_FIELDS: InvoiceField[] = ["supplier_pincode", "buyer_pincode"];

export const TEXTAREA_FIELDS: InvoiceField[] = [
  "supplier_address",
  "buyer_address",
  "signed_qr",
];

export const IRN_META_FIELDS: InvoiceField[] = ["irn", "ack_no", "ack_date", "signed_qr"];

export const REGISTER_FIELDS: InvoiceField[] = [
  "invoice_number",
  "invoice_date",
  "supplier_name",
  "supplier_gstin",
  "buyer_name",
  "buyer_gstin",
  "hsn_sac",
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "total_invoice_value",
  "place_of_supply",
];

export const EMPTY_FIELDS: InvoiceFields = {
  invoice_number: "",
  invoice_date: "",
  supplier_name: "",
  supplier_gstin: "",
  supplier_address: "",
  supplier_place: "",
  supplier_pincode: "",
  buyer_name: "",
  buyer_gstin: "",
  buyer_address: "",
  buyer_place: "",
  buyer_pincode: "",
  hsn_sac: "",
  taxable_value: "",
  cgst: "",
  sgst: "",
  igst: "",
  total_invoice_value: "",
  place_of_supply: "",
  irn: "",
  ack_no: "",
  ack_date: "",
  signed_qr: "",
};

export const FIELD_GROUPS: Array<{ title: string; fields: InvoiceField[] }> = [
  { title: "Invoice", fields: ["invoice_number", "invoice_date"] },
  {
    title: "Supplier",
    fields: ["supplier_name", "supplier_gstin", "supplier_address", "supplier_place", "supplier_pincode"],
  },
  {
    title: "Buyer",
    fields: ["buyer_name", "buyer_gstin", "buyer_address", "buyer_place", "buyer_pincode"],
  },
  {
    title: "Tax heads",
    fields: ["hsn_sac", "taxable_value", "cgst", "sgst", "igst", "total_invoice_value"],
  },
  { title: "Supply", fields: ["place_of_supply"] },
  { title: "e-Invoice", fields: ["irn", "ack_no", "ack_date", "signed_qr"] },
];

export const DEFAULT_FIELD_GROUPS = FIELD_GROUPS.filter((group) => group.title !== "e-Invoice");

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PINCODE_RE = /^[1-9][0-9]{5}$/;
export const IRN_RE = /^[a-fA-F0-9]{64}$/;

export const STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export const PLACE_OPTIONS = Object.entries(STATE_CODES)
  .sort((a, b) => a[1].localeCompare(b[1]))
  .map(([code, name]) => `${name} (${code})`);

export function remainingCaptures(used: number, isPro: boolean): number {
  if (isPro) return Number.POSITIVE_INFINITY;
  return Math.max(0, FREE_CAPTURES - used);
}

export function canCapture(used: number, isPro: boolean): boolean {
  return remainingCaptures(used, isPro) > 0;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseAmount(value: string): number | null {
  const trimmed = value.trim().replace(/[,₹\s]/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function formatInr(value: string | number | null | undefined): string {
  const n = typeof value === "number" ? value : parseAmount(value ?? "");
  if (n === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatAmountInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : parseAmount(String(value));
  if (n === null) return String(value);
  return n.toFixed(2);
}

export function normalizeGstin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function normalizeDate(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)) return raw;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return raw;
}

export function displayDate(value: string): string {
  const iso = normalizeDate(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return value || "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function isValidIsoDate(value: string): boolean {
  const iso = normalizeDate(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function validateInvoice(fields: InvoiceFields, lineItems: LineItem[] = []): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!fields.invoice_number.trim()) issues.push({ field: "invoice_number", message: "Required" });
  if (!fields.invoice_date.trim()) issues.push({ field: "invoice_date", message: "Required" });
  else if (!isValidIsoDate(fields.invoice_date)) issues.push({ field: "invoice_date", message: "Use DD/MM/YYYY" });
  if (!fields.supplier_name.trim()) issues.push({ field: "supplier_name", message: "Required" });
  for (const key of GSTIN_FIELDS) {
    const raw = normalizeGstin(fields[key]);
    if (!raw) {
      if (key === "supplier_gstin") issues.push({ field: key, message: "Required" });
      continue;
    }
    if (raw.length !== 15) issues.push({ field: key, message: "Must be 15 characters" });
    else if (!GSTIN_RE.test(raw)) issues.push({ field: key, message: "Invalid GSTIN format" });
  }
  for (const key of PINCODE_FIELDS) {
    const raw = fields[key].trim();
    if (raw && !PINCODE_RE.test(raw)) issues.push({ field: key, message: "Use a 6-digit PIN" });
  }
  const irn = fields.irn.trim();
  if (irn && !IRN_RE.test(irn)) issues.push({ field: "irn", message: "IRN is 64 hex characters" });
  for (const key of AMOUNT_FIELDS) {
    const raw = fields[key].trim();
    if (!raw) {
      if (key === "taxable_value" || key === "total_invoice_value") {
        issues.push({ field: key, message: "Required" });
      }
      continue;
    }
    const n = parseAmount(raw);
    if (n === null) issues.push({ field: key, message: "Enter a number" });
    else if (n < 0) issues.push({ field: key, message: "Cannot be negative" });
  }
  const taxable = parseAmount(fields.taxable_value) ?? 0;
  const cgst = parseAmount(fields.cgst) ?? 0;
  const sgst = parseAmount(fields.sgst) ?? 0;
  const igst = parseAmount(fields.igst) ?? 0;
  const total = parseAmount(fields.total_invoice_value);
  if (cgst > 0 && sgst === 0) issues.push({ field: "sgst", message: "CGST usually pairs with SGST" });
  if (sgst > 0 && cgst === 0) issues.push({ field: "cgst", message: "SGST usually pairs with CGST" });
  if (igst > 0 && (cgst > 0 || sgst > 0)) {
    issues.push({ field: "igst", message: "IGST should not mix with CGST/SGST" });
  }
  if (total !== null) {
    const reconstructed = taxable + cgst + sgst + igst;
    if (Math.abs(reconstructed - total) > 2) {
      issues.push({ field: "total_invoice_value", message: `Tax heads sum to ${formatInr(reconstructed)}` });
    }
  }
  const supplierState = normalizeGstin(fields.supplier_gstin).slice(0, 2);
  const pos = fields.place_of_supply.toLowerCase();
  if (supplierState && STATE_CODES[supplierState]) {
    const stateName = STATE_CODES[supplierState].toLowerCase();
    const sameState = pos.includes(stateName) || pos.includes(`(${supplierState})`);
    if (sameState && igst > 0) {
      issues.push({ field: "igst", message: "Same-state supply is usually CGST + SGST" });
    }
    if (!sameState && pos.length > 2 && igst === 0 && (cgst > 0 || sgst > 0)) {
      issues.push({ field: "igst", message: "Inter-state supply is usually IGST" });
    }
  }
  const lines = pruneLineItems(lineItems);
  if (lines.length > 0) {
    const lineTaxable = sumLineField(lines, "taxable_value");
    const lineCgst = sumLineField(lines, "cgst");
    const lineSgst = sumLineField(lines, "sgst");
    const lineIgst = sumLineField(lines, "igst");
    if (Math.abs(lineTaxable - taxable) > 2) {
      issues.push({ field: "taxable_value", message: `Line items sum to ${formatInr(lineTaxable)}` });
    }
    if (cgst + sgst + igst > 0 && Math.abs(lineCgst + lineSgst + lineIgst - (cgst + sgst + igst)) > 2) {
      issues.push({
        field: "cgst",
        message: `Line tax sums to ${formatInr(lineCgst + lineSgst + lineIgst)}`,
      });
    }
  }
  return issues;
}

export function issuesByField(issues: FieldIssue[]): Partial<Record<InvoiceField, string>> {
  const map: Partial<Record<InvoiceField, string>> = {};
  for (const issue of issues) {
    if (!map[issue.field]) map[issue.field] = issue.message;
  }
  return map;
}

export function fieldsFromExtract(
  raw: Partial<Record<InvoiceField, string | number | null | undefined>>,
): InvoiceFields {
  const next: InvoiceFields = { ...EMPTY_FIELDS };
  for (const key of INVOICE_FIELDS) {
    const value = raw[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (AMOUNT_FIELDS.includes(key)) next[key] = formatAmountInput(value);
    else if (GSTIN_FIELDS.includes(key)) next[key] = normalizeGstin(String(value));
    else if (key === "invoice_date") next[key] = normalizeDate(String(value));
    else next[key] = String(value).trim();
  }
  return next;
}

export function coerceFields(value: unknown): InvoiceFields {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next: InvoiceFields = { ...EMPTY_FIELDS };
  for (const key of INVOICE_FIELDS) {
    const item = raw[key];
    if (typeof item === "string") next[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) next[key] = String(item);
  }
  return fieldsFromExtract(next);
}

export function isMissingValue(value: string | undefined | null): boolean {
  return !value || !value.trim();
}

export function countFilledFields(fields: InvoiceFields): number {
  let count = 0;
  for (const key of INVOICE_FIELDS) {
    if (!isMissingValue(fields[key])) count += 1;
  }
  return count;
}

export function applyFieldDefaults(
  fields: InvoiceFields,
  defaults: InvoiceFields,
): { fields: InvoiceFields; applied: InvoiceField[] } {
  const next: InvoiceFields = { ...fields };
  const applied: InvoiceField[] = [];
  for (const key of INVOICE_FIELDS) {
    if (!isMissingValue(next[key]) || isMissingValue(defaults[key])) continue;
    if (IRN_META_FIELDS.includes(key)) continue;
    if (AMOUNT_FIELDS.includes(key)) next[key] = formatAmountInput(defaults[key]);
    else if (GSTIN_FIELDS.includes(key)) next[key] = normalizeGstin(defaults[key]);
    else if (key === "invoice_date") next[key] = normalizeDate(defaults[key]);
    else next[key] = defaults[key].trim();
    applied.push(key);
  }
  return { fields: next, applied };
}

export function remainingDefaultFills(original: GstInvoice, draft: InvoiceFields): InvoiceField[] {
  return (original.filledFromDefaults ?? []).filter((field) => draft[field] === original.fields[field]);
}

export function emptyLineItem(): LineItem {
  return { id: newId(), ...EMPTY_LINE_ITEM };
}

export function isBlankLineItem(item: LineItem): boolean {
  return LINE_ITEM_FIELDS.every((key) => isMissingValue(item[key]));
}

export function pruneLineItems(items: LineItem[]): LineItem[] {
  return items.filter((item) => !isBlankLineItem(item));
}

export function lineItemsFromExtract(
  raw: Array<Partial<Record<LineItemField, string | number | null | undefined>>> | undefined,
): LineItem[] {
  if (!raw?.length) return [];
  const items: LineItem[] = [];
  for (const row of raw) {
    const next: LineItem = emptyLineItem();
    for (const key of LINE_ITEM_FIELDS) {
      const value = row[key];
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && !value.trim()) continue;
      if (LINE_AMOUNT_FIELDS.includes(key)) next[key] = formatAmountInput(value);
      else next[key] = String(value).trim();
    }
    if (!isBlankLineItem(next)) items.push(next);
  }
  return items;
}

export function coerceLineItem(value: unknown): LineItem {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next: LineItem = emptyLineItem();
  if (typeof raw.id === "string" && raw.id) next.id = raw.id;
  for (const key of LINE_ITEM_FIELDS) {
    const item = raw[key];
    if (typeof item === "string") next[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) next[key] = formatAmountInput(item);
  }
  return next;
}

export function coerceLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return pruneLineItems(value.map(coerceLineItem));
}

export function coerceInvoice(value: unknown): GstInvoice | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const filled = Array.isArray(raw.filledFromDefaults)
    ? raw.filledFromDefaults.filter((field): field is InvoiceField =>
        INVOICE_FIELDS.includes(field as InvoiceField),
      )
    : [];
  return {
    id: raw.id,
    sourceName: typeof raw.sourceName === "string" ? raw.sourceName : "invoice",
    capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : new Date().toISOString(),
    fields: coerceFields(raw.fields),
    notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes : undefined,
    filledFromDefaults: filled.length ? filled : undefined,
    lineItems: coerceLineItems(raw.lineItems),
    pageCount: typeof raw.pageCount === "number" && raw.pageCount > 0 ? raw.pageCount : undefined,
  };
}

export function sumLineField(items: LineItem[], field: LineItemField): number {
  return items.reduce((sum, item) => sum + (parseAmount(item[field]) ?? 0), 0);
}

export function uniqueLineHsns(items: LineItem[]): string {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const item of items) {
    for (const part of item.hsn_sac.split(/[,;/]+/)) {
      const code = part.trim();
      if (!code) continue;
      const key = code.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      codes.push(code);
    }
  }
  return codes.join(", ");
}

export function applyLineTotalsToFields(fields: InvoiceFields, items: LineItem[]): InvoiceFields {
  const lines = pruneLineItems(items);
  if (!lines.length) return fields;
  const taxable = sumLineField(lines, "taxable_value");
  const cgst = sumLineField(lines, "cgst");
  const sgst = sumLineField(lines, "sgst");
  const igst = sumLineField(lines, "igst");
  const lineTotal = sumLineField(lines, "line_total");
  const hsns = uniqueLineHsns(lines);
  return {
    ...fields,
    hsn_sac: hsns || fields.hsn_sac,
    taxable_value: formatAmountInput(taxable),
    cgst: formatAmountInput(cgst),
    sgst: formatAmountInput(sgst),
    igst: formatAmountInput(igst),
    total_invoice_value: formatAmountInput(lineTotal || taxable + cgst + sgst + igst),
  };
}

export function fillMissingHeaderFromLines(fields: InvoiceFields, items: LineItem[]): InvoiceFields {
  const lines = pruneLineItems(items);
  if (!lines.length) return fields;
  const next = { ...fields };
  const hsns = uniqueLineHsns(lines);
  if (isMissingValue(next.hsn_sac) && hsns) next.hsn_sac = hsns;
  const mapped: Array<[InvoiceField, LineItemField]> = [
    ["taxable_value", "taxable_value"],
    ["cgst", "cgst"],
    ["sgst", "sgst"],
    ["igst", "igst"],
  ];
  for (const [header, line] of mapped) {
    if (isMissingValue(next[header])) next[header] = formatAmountInput(sumLineField(lines, line));
  }
  if (isMissingValue(next.total_invoice_value)) {
    const lineTotal = sumLineField(lines, "line_total");
    const reconstructed =
      (parseAmount(next.taxable_value) ?? 0) +
      (parseAmount(next.cgst) ?? 0) +
      (parseAmount(next.sgst) ?? 0) +
      (parseAmount(next.igst) ?? 0);
    next.total_invoice_value = formatAmountInput(lineTotal || reconstructed);
  }
  return next;
}

export function toCsv(invoices: GstInvoice[]): string {
  const header = INVOICE_FIELDS.join(",");
  const rows = invoices.map((inv) =>
    INVOICE_FIELDS.map((key) => {
      let value = inv.fields[key] ?? "";
      if (key === "invoice_date") value = displayDate(value);
      return csvEscape(value);
    }).join(","),
  );
  return `\uFEFF${header}\n${rows.join("\n")}\n`;
}

export function toLineItemsCsv(invoices: GstInvoice[]): string {
  const header = ["invoice_number", "invoice_date", "supplier_name", "supplier_gstin", "line_no", ...LINE_ITEM_FIELDS].join(
    ",",
  );
  const rows: string[] = [];
  for (const inv of invoices) {
    pruneLineItems(inv.lineItems).forEach((item, index) => {
      const cells = [
        inv.fields.invoice_number,
        displayDate(inv.fields.invoice_date),
        inv.fields.supplier_name,
        inv.fields.supplier_gstin,
        String(index + 1),
        ...LINE_ITEM_FIELDS.map((key) => item[key]),
      ];
      rows.push(cells.map(csvEscape).join(","));
    });
  }
  return `\uFEFF${header}\n${rows.join("\n")}\n`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(invoices: GstInvoice[]): void {
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(toCsv(invoices), `gstslip-register-${stamp}.csv`);
}

export function downloadLineItemsCsv(invoices: GstInvoice[]): void {
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(toLineItemsCsv(invoices), `gstslip-line-items-${stamp}.csv`);
}

export function invoicePageCount(invoice: Pick<GstInvoice, "pageCount">): number {
  return invoice.pageCount && invoice.pageCount > 0 ? invoice.pageCount : 1;
}

export function remainingInvoicePages(invoice: Pick<GstInvoice, "pageCount">): number {
  return Math.max(0, MAX_INVOICE_PAGES - invoicePageCount(invoice));
}

function lineItemKey(item: LineItem): string {
  return [item.description, item.hsn_sac, item.quantity, item.rate, item.taxable_value]
    .map((value) => value.trim().toLowerCase())
    .join("|");
}

export function appendExtractedPages(
  current: GstInvoice,
  extracted: {
    fields: Partial<Record<InvoiceField, string | number>>;
    lineItems: Array<Partial<Record<LineItemField, string | number>>>;
    notes?: string;
  },
  addedPageCount: number,
  addedLabel: string,
  defaults: InvoiceFields,
): GstInvoice {
  const incoming = fieldsFromExtract(extracted.fields);
  const defaulted = new Set(current.filledFromDefaults ?? []);
  const nextFields: InvoiceFields = { ...current.fields };

  for (const key of INVOICE_FIELDS) {
    if (isMissingValue(incoming[key])) continue;
    if (AMOUNT_FIELDS.includes(key)) {
      nextFields[key] = incoming[key];
      continue;
    }
    if (isMissingValue(nextFields[key]) || defaulted.has(key)) {
      nextFields[key] = incoming[key];
    }
  }

  const seen = new Set(current.lineItems.map(lineItemKey));
  const extraLines = lineItemsFromExtract(extracted.lineItems).filter((item) => {
    const key = lineItemKey(item);
    if (!key.replaceAll("|", "") || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const lineItems = pruneLineItems([...current.lineItems, ...extraLines]);
  const filled = applyFieldDefaults(fillMissingHeaderFromLines(nextFields, lineItems), defaults);
  const stillDefaulted = (current.filledFromDefaults ?? []).filter(
    (field) => filled.fields[field] === current.fields[field] && isMissingValue(incoming[field]),
  );
  const applied = [...new Set([...stillDefaulted, ...filled.applied])];
  const pageCount = invoicePageCount(current) + Math.max(1, addedPageCount);
  const notes = [current.notes, extracted.notes, `Added ${addedPageCount} page${addedPageCount === 1 ? "" : "s"}`]
    .filter((value) => typeof value === "string" && value.trim())
    .join(". ");

  return {
    ...current,
    sourceName: `${current.sourceName} + ${addedLabel}`,
    fields: filled.fields,
    notes: notes || undefined,
    filledFromDefaults: applied.length ? applied : undefined,
    lineItems,
    pageCount,
  };
}
