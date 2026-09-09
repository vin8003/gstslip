import {
  IRN_RE,
  fieldsFromExtract,
  formatAmountInput,
  normalizeDate,
  normalizeGstin,
  type InvoiceFields,
} from "./gst";

export type SignedQrPayload = {
  sellerGstin: string;
  buyerGstin: string;
  docNo: string;
  docTyp: string;
  docDt: string;
  totInvVal: number | null;
  itemCnt: number | null;
  mainHsnCode: string;
  irn: string;
  irnDt: string;
};

export function decodeBase64Url(part: string): string {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  try {
    return decodeURIComponent(
      [...binary].map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
  } catch {
    return binary;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readPayload(raw: Record<string, unknown>): SignedQrPayload | null {
  const nested =
    typeof raw.data === "string"
      ? asRecord(safeJson(raw.data))
      : (asRecord(raw.data) ?? raw);
  if (!nested) return null;
  const irn = String(nested.Irn ?? nested.irn ?? "").trim();
  const seller = normalizeGstin(String(nested.SellerGstin ?? nested.sellerGstin ?? ""));
  const docNo = String(nested.DocNo ?? nested.docNo ?? "").trim();
  if (!irn && !docNo && !seller) return null;
  const tot = nested.TotInvVal ?? nested.totInvVal;
  const cnt = nested.ItemCnt ?? nested.itemCnt;
  return {
    sellerGstin: seller,
    buyerGstin: normalizeGstin(String(nested.BuyerGstin ?? nested.buyerGstin ?? "")),
    docNo,
    docTyp: String(nested.DocTyp ?? nested.docTyp ?? "INV").trim() || "INV",
    docDt: String(nested.DocDt ?? nested.docDt ?? "").trim(),
    totInvVal: typeof tot === "number" && Number.isFinite(tot) ? tot : Number(tot) || null,
    itemCnt: typeof cnt === "number" && Number.isFinite(cnt) ? cnt : Number(cnt) || null,
    mainHsnCode: String(nested.MainHsnCode ?? nested.mainHsnCode ?? "").trim(),
    irn,
    irnDt: String(nested.IrnDt ?? nested.irnDt ?? "").trim(),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function decodeSignedQr(raw: string): SignedQrPayload | null {
  const text = raw.trim().replace(/^"+|"+$/g, "");
  if (!text) return null;
  if (IRN_RE.test(text)) {
    return {
      sellerGstin: "",
      buyerGstin: "",
      docNo: "",
      docTyp: "INV",
      docDt: "",
      totInvVal: null,
      itemCnt: null,
      mainHsnCode: "",
      irn: text,
      irnDt: "",
    };
  }
  if (text.startsWith("{")) {
    const json = asRecord(safeJson(text));
    return json ? readPayload(json) : null;
  }
  const jwt = text.split(".");
  if (jwt.length >= 2) {
    try {
      const payload = asRecord(safeJson(decodeBase64Url(jwt[1])));
      return payload ? readPayload(payload) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function fieldsFromSignedQr(payload: SignedQrPayload): Partial<InvoiceFields> {
  const next: Partial<InvoiceFields> = {};
  if (payload.sellerGstin) next.supplier_gstin = payload.sellerGstin;
  if (payload.buyerGstin) next.buyer_gstin = payload.buyerGstin;
  if (payload.docNo) next.invoice_number = payload.docNo;
  if (payload.docDt) next.invoice_date = normalizeDate(payload.docDt);
  if (payload.totInvVal != null) next.total_invoice_value = formatAmountInput(payload.totInvVal);
  if (payload.mainHsnCode) next.hsn_sac = payload.mainHsnCode;
  if (payload.irn) next.irn = payload.irn;
  if (payload.irnDt) next.ack_date = payload.irnDt;
  return next;
}

export function mergeQrFields(base: InvoiceFields, payload: SignedQrPayload): InvoiceFields {
  return fieldsFromExtract({ ...base, ...fieldsFromSignedQr(payload) });
}

export function encodeSandboxQr(payload: SignedQrPayload): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const body = {
    data: JSON.stringify({
      SellerGstin: payload.sellerGstin,
      BuyerGstin: payload.buyerGstin,
      DocNo: payload.docNo,
      DocTyp: payload.docTyp,
      DocDt: payload.docDt,
      TotInvVal: payload.totInvVal,
      ItemCnt: payload.itemCnt,
      MainHsnCode: payload.mainHsnCode,
      Irn: payload.irn,
      IrnDt: payload.irnDt,
    }),
    iss: "GSTSlip-sandbox",
  };
  const mid = btoa(JSON.stringify(body)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${header}.${mid}.sandbox`;
}
