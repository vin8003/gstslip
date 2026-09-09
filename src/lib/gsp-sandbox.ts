import { encodeSandboxQr } from "./irn-decode";
import type { InvoiceFields, LineItemField } from "./gst";

export type GspIrnRecord = {
  irn: string;
  ackNo: string;
  ackDt: string;
  status: "ACT" | "CNL";
  source: "gsp-sandbox" | "signed-qr";
  fields: Partial<InvoiceFields>;
  lineItems: Array<Partial<Record<LineItemField, string>>>;
  signedQr?: string;
};

function sandboxIrn(seed: string): string {
  const hex = "0123456789abcdef";
  let hash = 2166136261;
  let out = "";
  for (let i = 0; i < 64; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i % seed.length) ^ i, 16777619);
    out += hex[(hash >>> 0) % 16];
  }
  return out;
}

export const SAMPLE_IRNS = {
  navkaar: sandboxIrn("NT/2026-27/1842|27AABCU9603R1ZX"),
  malabar: sandboxIrn("MSP-3381|32AALCM4410D1Z2"),
  lotus: sandboxIrn("LA/INV/0926/077|07AAACL1234C1Z5"),
} as const;

function navkaarQr() {
  return encodeSandboxQr({
    sellerGstin: "27AABCU9603R1ZX",
    buyerGstin: "27AAPFW2194Q1Z3",
    docNo: "NT/2026-27/1842",
    docTyp: "INV",
    docDt: "12/08/2026",
    totInvVal: 89250,
    itemCnt: 2,
    mainHsnCode: "5208",
    irn: SAMPLE_IRNS.navkaar,
    irnDt: "2026-08-12 14:22:11",
  });
}

export const SAMPLE_SIGNED_QR = {
  navkaar: navkaarQr(),
};

export const SANDBOX_IRN_RECORDS: Record<string, GspIrnRecord> = {
  [SAMPLE_IRNS.navkaar]: {
    irn: SAMPLE_IRNS.navkaar,
    ackNo: "112026081234567",
    ackDt: "2026-08-12 14:22:11",
    status: "ACT",
    source: "gsp-sandbox",
    signedQr: SAMPLE_SIGNED_QR.navkaar,
    fields: {
      invoice_number: "NT/2026-27/1842",
      invoice_date: "2026-08-12",
      supplier_name: "Navkaar Textiles Pvt Ltd",
      supplier_gstin: "27AABCU9603R1ZX",
      supplier_address: "18 Kalbadevi Road",
      supplier_place: "Mumbai",
      supplier_pincode: "400002",
      buyer_name: "Westline Retail LLP",
      buyer_gstin: "27AAPFW2194Q1Z3",
      buyer_address: "4th Floor, Westline House, Andheri East",
      buyer_place: "Mumbai",
      buyer_pincode: "400069",
      hsn_sac: "5208, 5210",
      taxable_value: "85000.00",
      cgst: "2125.00",
      sgst: "2125.00",
      igst: "0.00",
      total_invoice_value: "89250.00",
      place_of_supply: "Maharashtra (27)",
      irn: SAMPLE_IRNS.navkaar,
      ack_no: "112026081234567",
      ack_date: "2026-08-12 14:22:11",
    },
    lineItems: [
      {
        description: "Cotton poplin 60s, dyed, 44 inch",
        hsn_sac: "5208",
        quantity: "420.00",
        unit: "MTR",
        rate: "125.00",
        taxable_value: "52500.00",
        cgst: "1312.50",
        sgst: "1312.50",
        igst: "0.00",
        line_total: "55125.00",
      },
      {
        description: "Cotton twill, printed, 58 inch",
        hsn_sac: "5210",
        quantity: "250.00",
        unit: "MTR",
        rate: "130.00",
        taxable_value: "32500.00",
        cgst: "812.50",
        sgst: "812.50",
        igst: "0.00",
        line_total: "34125.00",
      },
    ],
  },
  [SAMPLE_IRNS.malabar]: {
    irn: SAMPLE_IRNS.malabar,
    ackNo: "112026072845612",
    ackDt: "2026-07-28 10:05:44",
    status: "ACT",
    source: "gsp-sandbox",
    fields: {
      invoice_number: "MSP-3381",
      invoice_date: "2026-07-28",
      supplier_name: "Malabar Spice Gardens",
      supplier_gstin: "32AALCM4410D1Z2",
      supplier_address: "NH 66, Idukki Road",
      supplier_place: "Kumily",
      supplier_pincode: "685509",
      buyer_name: "Harbour Grocers Pvt Ltd",
      buyer_gstin: "27AADCH8821P1Z8",
      buyer_address: "12 Wadi Bunder",
      buyer_place: "Mumbai",
      buyer_pincode: "400009",
      hsn_sac: "0904, 0908",
      taxable_value: "124000.00",
      cgst: "0.00",
      sgst: "0.00",
      igst: "6200.00",
      total_invoice_value: "130200.00",
      place_of_supply: "Maharashtra (27)",
      irn: SAMPLE_IRNS.malabar,
      ack_no: "112026072845612",
      ack_date: "2026-07-28 10:05:44",
    },
    lineItems: [],
  },
  [SAMPLE_IRNS.lotus]: {
    irn: SAMPLE_IRNS.lotus,
    ackNo: "112026090177401",
    ackDt: "2026-09-01 16:40:02",
    status: "ACT",
    source: "gsp-sandbox",
    fields: {
      invoice_number: "LA/INV/0926/077",
      invoice_date: "2026-09-01",
      supplier_name: "Lotus Advisory Services",
      supplier_gstin: "07AAACL1234C1Z5",
      supplier_address: "B-22 Connaught Place",
      supplier_place: "New Delhi",
      supplier_pincode: "110001",
      buyer_name: "Northwind Exports",
      buyer_gstin: "07AAACN5678D1Z1",
      buyer_address: "Okhla Industrial Area",
      buyer_place: "New Delhi",
      buyer_pincode: "110020",
      hsn_sac: "9983",
      taxable_value: "45000.00",
      cgst: "4050.00",
      sgst: "4050.00",
      igst: "0.00",
      total_invoice_value: "53100.00",
      place_of_supply: "Delhi (07)",
      irn: SAMPLE_IRNS.lotus,
      ack_no: "112026090177401",
      ack_date: "2026-09-01 16:40:02",
    },
    lineItems: [],
  },
};
