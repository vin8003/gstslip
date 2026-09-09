import { createServerFn } from "@tanstack/react-start";
import { IRN_RE, lineItemsFromExtract } from "./gst";
import { decodeSignedQr, type SignedQrPayload } from "./irn-decode";
import { SANDBOX_IRN_RECORDS, type GspIrnRecord } from "./gsp-sandbox";

export type { GspIrnRecord };

export type GetIrnResult =
  | { ok: true; record: GspIrnRecord }
  | { ok: false; error: string };

export const getIrnSandbox = createServerFn({ method: "POST" })
  .validator((input: { irn?: string; signedQr?: string }) => input)
  .handler(async ({ data }): Promise<GetIrnResult> => {
    const irn = data.irn?.trim() ?? "";
    const signedQr = data.signedQr?.trim() ?? "";

    if (signedQr) {
      const decoded = decodeSignedQr(signedQr);
      if (!decoded) {
        return { ok: false, error: "That signed QR could not be decoded." };
      }
      const catalog = decoded.irn ? SANDBOX_IRN_RECORDS[decoded.irn.toLowerCase()] : undefined;
      if (catalog) return { ok: true, record: { ...catalog, signedQr, source: "gsp-sandbox" } };
      return { ok: true, record: recordFromQr(decoded, signedQr) };
    }

    if (!irn) return { ok: false, error: "Enter an IRN or paste a signed QR." };
    if (!IRN_RE.test(irn)) return { ok: false, error: "IRN must be 64 hex characters." };

    const live = await tryLiveGsp(irn);
    if (live) return live;

    const catalog = SANDBOX_IRN_RECORDS[irn.toLowerCase()];
    if (catalog) return { ok: true, record: catalog };

    return {
      ok: false,
      error:
        "This GSP sandbox does not have that IRN. Decode a signed QR, or use a GSTSlip sample IRN.",
    };
  });

function recordFromQr(payload: SignedQrPayload, signedQr: string): GspIrnRecord {
  return {
    irn: payload.irn,
    ackNo: "",
    ackDt: payload.irnDt,
    status: "ACT",
    source: "signed-qr",
    signedQr,
    fields: {
      supplier_gstin: payload.sellerGstin,
      buyer_gstin: payload.buyerGstin,
      invoice_number: payload.docNo,
      invoice_date: payload.docDt,
      total_invoice_value: payload.totInvVal != null ? String(payload.totInvVal) : "",
      hsn_sac: payload.mainHsnCode,
      irn: payload.irn,
      ack_date: payload.irnDt,
      signed_qr: signedQr,
    },
    lineItems: [],
  };
}

async function tryLiveGsp(irn: string): Promise<GetIrnResult | null> {
  const gstin = process.env.GSP_GSTIN?.trim();
  const clientId = process.env.GSP_CLIENT_ID?.trim();
  const clientSecret = process.env.GSP_CLIENT_SECRET?.trim();
  const base =
    process.env.GSP_SANDBOX_URL?.trim() || "https://einv-apisandbox.nic.in";
  if (!gstin || !clientId || !clientSecret) return null;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/eicore/v1.03/Invoice/irn/${irn}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        client_id: clientId,
        client_secret: clientSecret,
        gstin,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `GSP sandbox returned ${res.status}. Check credentials or use local decode.`,
      };
    }
    const body = (await res.json()) as Record<string, unknown>;
    const irnValue = String(body.Irn ?? body.irn ?? irn);
    return {
      ok: true,
      record: {
        irn: irnValue,
        ackNo: String(body.AckNo ?? body.ackNo ?? ""),
        ackDt: String(body.AckDt ?? body.ackDt ?? ""),
        status: body.Status === "CNL" ? "CNL" : "ACT",
        source: "gsp-sandbox",
        fields: { irn: irnValue, ack_no: String(body.AckNo ?? ""), ack_date: String(body.AckDt ?? "") },
        lineItems: [],
      },
    };
  } catch {
    return { ok: false, error: "Could not reach the GSP sandbox." };
  }
}

export function lineItemsFromGsp(record: GspIrnRecord) {
  return lineItemsFromExtract(record.lineItems);
}
