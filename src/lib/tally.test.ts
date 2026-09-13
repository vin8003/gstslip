import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FIELDS, EMPTY_LINE_ITEM, type GstInvoice, type LineItem } from "./gst.ts";
import { toTallyXml, validateTallyXml, purchaseLedgerPlan, buildTallyExport } from "./tally.ts";

function invoice(patch: {
  id?: string;
  fields?: Partial<GstInvoice["fields"]>;
  lineItems?: LineItem[];
}): GstInvoice {
  return {
    id: patch.id ?? "inv_schema",
    sourceName: "schema.pdf",
    capturedAt: "2026-09-13T00:00:00.000Z",
    fields: { ...EMPTY_FIELDS, ...patch.fields },
    lineItems: patch.lineItems ?? [],
  };
}

function line(patch: Partial<LineItem>): LineItem {
  return { ...EMPTY_LINE_ITEM, id: patch.id ?? "ln_1", ...patch };
}

test("sample invoices produce a Tally file-import envelope", () => {
  const xml = toTallyXml([
    invoice({
      fields: {
        invoice_number: "NT/2026-27/1842",
        invoice_date: "2026-08-12",
        supplier_name: "Navkaar Textiles Pvt Ltd",
        supplier_gstin: "27AABCU9603R1ZX",
        supplier_place: "Mumbai",
        taxable_value: "85000",
        cgst: "2125",
        sgst: "2125",
        total_invoice_value: "89250",
        buyer_name: "Westline Retail LLP",
        buyer_gstin: "27AAPFW2194Q1Z3",
        place_of_supply: "Maharashtra (27)",
      },
      lineItems: [
        line({
          id: "a",
          description: "Cotton poplin 60s, dyed, 44 inch",
          hsn_sac: "5208",
          quantity: "420",
          unit: "MTR",
          rate: "125",
          taxable_value: "52500",
        }),
        line({
          id: "b",
          description: "Cotton twill, printed, 58 inch",
          hsn_sac: "5210",
          quantity: "250",
          unit: "MTR",
          rate: "130",
          taxable_value: "32500",
        }),
      ],
    }),
    invoice({
      id: "inv_mk",
      fields: {
        invoice_number: "G462326001150",
        invoice_date: "2026-08-31",
        supplier_name: "M K Enterprises (Godrej)",
        supplier_gstin: "08AARFM3263C2Z7",
        taxable_value: "88013.59",
        cgst: "7921.22",
        sgst: "7921.22",
        round_off: "-0.03",
        total_invoice_value: "103856",
        net_payable: "103856",
      },
      lineItems: [
        line({
          description: "PA VOYAGE AER 150ML",
          hsn_sac: "33030090",
          quantity: "96",
          unit: "PCS",
          taxable_value: "88013.59",
        }),
      ],
    }),
  ]);
  const report = validateTallyXml(xml);
  assert.deepEqual(report.errors, []);
  assert.equal(report.ok, true);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<TALLYREQUEST>Import Data<\/TALLYREQUEST>/);
  assert.match(xml, /<REPORTNAME>Vouchers<\/REPORTNAME>/);
  assert.match(xml, /<IMPORTDUPS>@@DUPCOMBINE<\/IMPORTDUPS>/);
  assert.match(xml, /<SVEXPORTFORMAT>\$\$SysName:XML<\/SVEXPORTFORMAT>/);
  assert.match(xml, /<VOUCHER REMOTEID="GSTSlip-/);
  assert.match(xml, /<VCHENTRYMODE>Item Invoice<\/VCHENTRYMODE>/);
  assert.match(xml, /<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>/);
});

test("GSTAPPLICABLE is valid XML 1.0 (no &#4;)", () => {
  const xml = toTallyXml([
    invoice({
      fields: {
        invoice_number: "NT/1",
        invoice_date: "2026-08-12",
        supplier_name: "Navkaar Textiles Pvt Ltd",
        taxable_value: "100",
        cgst: "9",
        sgst: "9",
        total_invoice_value: "118",
      },
      lineItems: [
        line({ description: "Cotton poplin", hsn_sac: "5208", quantity: "1", unit: "MTR", taxable_value: "100" }),
      ],
    }),
  ]);
  assert.equal(xml.includes("&#4;"), false);
  assert.match(xml, /<GSTAPPLICABLE>Yes<\/GSTAPPLICABLE>/);
  assert.match(xml, /<GSTDUTYHEAD>CGST<\/GSTDUTYHEAD>/);
  assert.match(xml, /<TAXTYPE>GST<\/TAXTYPE>/);
});

test("dates are YYYYMMDD and special characters are escaped", () => {
  const xml = toTallyXml([
    invoice({
      fields: {
        invoice_number: 'A&B <1>"',
        invoice_date: "31/08/2026",
        supplier_name: "M & K Enterprises",
        supplier_gstin: "08AARFM3263C2Z7",
        taxable_value: "100.00",
        cgst: "9.00",
        sgst: "9.00",
        total_invoice_value: "118.00",
        net_payable: "118.00",
      },
      lineItems: [
        line({
          description: "Oil & soap",
          hsn_sac: "3307",
          quantity: "2",
          unit: "PCS",
          rate: "50",
          taxable_value: "100.00",
          line_total: "118.00",
        }),
      ],
    }),
  ]);
  const report = validateTallyXml(xml);
  assert.deepEqual(report.errors, []);
  assert.match(xml, /<DATE>20260831<\/DATE>/);
  assert.ok(xml.includes("M &" + "amp; K Enterprises"));
  assert.ok(xml.includes("A&" + "amp;B &" + "lt;1&" + "gt;&" + "quot;"));
  assert.equal(xml.includes("M & K"), false);
});

test("round-off and TCS keep the purchase voucher in balance", () => {
  const xml = toTallyXml([
    invoice({
      fields: {
        invoice_number: "G462326001150",
        invoice_date: "2026-08-31",
        supplier_name: "M K Enterprises (Godrej)",
        supplier_gstin: "08AARFM3263C2Z7",
        taxable_value: "88013.59",
        cgst: "7921.22",
        sgst: "7921.22",
        tcs: "0",
        round_off: "-0.03",
        total_invoice_value: "103856",
        net_payable: "103856",
      },
      lineItems: [
        line({
          description: "PA VOYAGE AER 150ML",
          hsn_sac: "33030090",
          quantity: "96",
          unit: "PCS",
          taxable_value: "88013.59",
        }),
      ],
    }),
  ]);
  const report = validateTallyXml(xml);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.match(xml, /<LEDGERNAME>Round Off<\/LEDGERNAME>/);
  assert.match(xml, /<AMOUNT>-0.03<\/AMOUNT>/);
});

test("duplicate stock names are collapsed to one master", () => {
  const xml = toTallyXml([
    invoice({
      id: "a",
      fields: {
        invoice_number: "1",
        invoice_date: "2026-08-01",
        supplier_name: "Alpha",
        taxable_value: "10",
        total_invoice_value: "10",
      },
      lineItems: [
        line({ id: "1", description: "Soap", quantity: "1", taxable_value: "10" }),
      ],
    }),
    invoice({
      id: "b",
      fields: {
        invoice_number: "2",
        invoice_date: "2026-08-02",
        supplier_name: "Beta",
        taxable_value: "10",
        total_invoice_value: "10",
      },
      lineItems: [
        line({ id: "2", description: "Soap", quantity: "1", taxable_value: "10" }),
      ],
    }),
  ]);
  const names = [...xml.matchAll(/<STOCKITEM NAME="([^"]*)"/g)].map((row) => row[1]);
  assert.deepEqual(names, ["Soap"]);
  assert.equal(validateTallyXml(xml).ok, true);
});

test("purchase ledgers debit stock/tax and credit the supplier", () => {
  const row = invoice({
    fields: {
      invoice_number: "NT/2026-27/1842",
      invoice_date: "2026-08-12",
      supplier_name: "Navkaar Textiles Pvt Ltd",
      taxable_value: "85000",
      cgst: "2125",
      sgst: "2125",
      igst: "0",
      total_invoice_value: "89250",
    },
    lineItems: [
      line({ id: "a", description: "Poplin", taxable_value: "52500", quantity: "420", rate: "125" }),
      line({ id: "b", description: "Twill", taxable_value: "32500", quantity: "250", rate: "130" }),
    ],
  });
  const books = purchaseLedgerPlan(row);
  assert.equal(books.purchase, 85000);
  assert.equal(books.party, 89250);
  assert.deepEqual(
    books.ledgers.map((post) => [post.name, post.amount, Boolean(post.isParty), Boolean(post.isGst)]),
    [
      ["Input CGST", 2125, false, true],
      ["Input SGST", 2125, false, true],
      ["Navkaar Textiles Pvt Ltd", -89250, true, false],
    ],
  );
  const sum = books.purchase + books.ledgers.reduce((acc, post) => acc + post.amount, 0);
  assert.equal(Number(sum.toFixed(2)), 0);

  const xml = toTallyXml([row]);
  assert.match(xml, /<LEDGERNAME>Purchase<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>/);
  assert.match(xml, /<LEDGERNAME>Input CGST<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>No<\/ISPARTYLEDGER>/);
  assert.match(xml, /<VATEXPAMOUNT>2125.00<\/VATEXPAMOUNT>/);
  assert.match(xml, /<LEDGERNAME>Navkaar Textiles Pvt Ltd<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>/);
  assert.equal(xml.includes("<LEDGERNAME>Input IGST</LEDGERNAME>"), false);
  assert.deepEqual(validateTallyXml(xml).warnings, []);
});

test("header vs line mismatch is not patched with invented round off", () => {
  const books = purchaseLedgerPlan(
    invoice({
      fields: {
        invoice_number: "X-1",
        invoice_date: "2026-08-01",
        supplier_name: "Alpha",
        taxable_value: "100",
        cgst: "9",
        sgst: "9",
        total_invoice_value: "118",
      },
      lineItems: [line({ description: "Soap", taxable_value: "90", quantity: "1" })],
    }),
  );
  assert.equal(books.purchase, 90);
  assert.equal(books.roundOff, 0);
  assert.equal(books.party, 118);
  assert.equal(books.balanced, false);
  assert.equal(books.ledgers.some((post) => post.name === "Round Off"), false);
});

test("lines without taxable keep taxable empty instead of copying the header", () => {
  const books = purchaseLedgerPlan(
    invoice({
      fields: {
        invoice_number: "X-2",
        invoice_date: "2026-08-01",
        supplier_name: "Alpha",
        taxable_value: "100",
        igst: "18",
        total_invoice_value: "118",
      },
      lineItems: [line({ description: "Soap", quantity: "2", unit: "PCS" })],
    }),
  );
  assert.equal(books.purchase, 0);
  assert.equal(books.lines[0].taxable, 0);
  assert.equal(books.balanced, false);
  assert.equal(books.ledgers.some((post) => post.name === "Input IGST" && post.amount === 18), true);
  assert.equal(books.ledgers.some((post) => post.name.startsWith("Input CGST")), false);
});

test("service invoice without stock posts Purchase as a ledger debit", () => {
  const xml = toTallyXml([
    invoice({
      fields: {
        invoice_number: "LA/1",
        invoice_date: "2026-09-01",
        supplier_name: "Lotus Advisory",
        taxable_value: "45000",
        cgst: "4050",
        sgst: "4050",
        total_invoice_value: "53100",
      },
    }),
  ]);
  assert.match(xml, /<VCHENTRYMODE>Accounting Invoice<\/VCHENTRYMODE>/);
  assert.equal(xml.includes("ALLINVENTORYENTRIES"), false);
  assert.match(
    xml,
    /<LEDGERNAME>Purchase<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>No<\/ISPARTYLEDGER>\s*<AMOUNT>45000.00<\/AMOUNT>/,
  );
  assert.deepEqual(validateTallyXml(xml).warnings, []);
});

test("missing supplier or date is skipped instead of inventing values", () => {
  const built = buildTallyExport([
    invoice({
      fields: { invoice_number: "1", invoice_date: "2026-08-01", taxable_value: "10" },
    }),
    invoice({
      id: "no-date",
      fields: { invoice_number: "2", supplier_name: "Alpha", taxable_value: "10" },
    }),
  ]);
  assert.equal(built.included.length, 0);
  assert.equal(built.skipped.length, 2);
  assert.equal(built.xml.includes("<VOUCHER "), false);
  assert.equal(built.xml.includes(">Supplier<"), false);
});

test("optional Tally fields are omitted when the invoice does not print them", () => {
  const xml = toTallyXml([
    invoice({
      fields: {
        invoice_number: "NT/1",
        invoice_date: "2026-08-12",
        supplier_name: "Navkaar Textiles Pvt Ltd",
        taxable_value: "100",
        cgst: "9",
        sgst: "9",
        total_invoice_value: "118",
        buyer_name: "Westline Retail LLP",
      },
      lineItems: [line({ description: "Cotton poplin", quantity: "1", taxable_value: "100" })],
    }),
  ]);
  assert.equal(xml.includes("EWAYBILLDETAILS"), false);
  assert.equal(xml.includes("VEHICLENUMBER"), false);
  assert.equal(xml.includes("CONSIGNEEMAILINGNAME"), false);
  assert.equal(xml.includes("GSTREGISTRATIONTYPE"), false);
  assert.equal(xml.includes("FBTPAYMENTTYPE"), false);
  assert.equal(xml.includes('<UNIT NAME="NOS"'), false);
  assert.equal(xml.includes("Input IGST"), false);
});

test("e-Way Bill, vehicle, GST rate and IRN are exported only from printed fields", () => {
  const xml = toTallyXml([
    invoice({
      fields: {
        invoice_number: "G1",
        invoice_date: "2026-08-31",
        supplier_name: "M K Enterprises (Godrej)",
        supplier_gstin: "08AARFM3263C2Z7",
        buyer_name: "SKY SELLER",
        buyer_gstin: "08GZDPB3148C1ZR",
        consignee_name: "SKY SELLER (GODREJ)",
        taxable_value: "100",
        cgst: "9",
        sgst: "9",
        total_invoice_value: "118",
        irn: "a".repeat(64),
        ack_no: "1120260812",
        ack_date: "2026-08-31",
        eway_bill_no: "141234567890",
        eway_bill_date: "2026-08-31",
        transporter_name: "North Roadways",
        vehicle_no: "RJ14AB1234",
        lr_number: "LR-88",
        mode_of_transport: "Road",
      },
      lineItems: [
        line({
          description: "PA VOYAGE AER 150ML",
          hsn_sac: "33030090",
          quantity: "2",
          unit: "PCS",
          rate: "50",
          gst_rate: "18",
          taxable_value: "100",
        }),
      ],
    }),
  ]);
  assert.match(xml, /<BILLNUMBER>141234567890<\/BILLNUMBER>/);
  assert.match(xml, /<VEHICLENUMBER>RJ14AB1234<\/VEHICLENUMBER>/);
  assert.match(xml, /<TRANSPORTERNAME>North Roadways<\/TRANSPORTERNAME>/);
  assert.match(xml, /<TRANSPORTMODE>Road<\/TRANSPORTMODE>/);
  assert.match(xml, /<BASICSHIPDOCUMENTNO>LR-88<\/BASICSHIPDOCUMENTNO>/);
  assert.match(xml, /<CONSIGNEEMAILINGNAME>SKY SELLER \(GODREJ\)<\/CONSIGNEEMAILINGNAME>/);
  assert.match(xml, /<IRN>a{64}<\/IRN>/);
  assert.match(xml, /<IRNACKDATE>20260831<\/IRNACKDATE>/);
  assert.match(xml, /<GSTRATEDUTYHEAD>CGST<\/GSTRATEDUTYHEAD>/);
  assert.match(xml, /<GSTRATE>9.00<\/GSTRATE>/);
  assert.match(xml, /<GSTHSNNAME>33030090<\/GSTHSNNAME>/);
  assert.match(xml, /<BASEUNITS>NOS<\/BASEUNITS>/);
});

test("validator rejects a broken envelope", () => {
  const report = validateTallyXml(`<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER></ENVELOPE>`);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((row) => /IMPORTDATA|TALLYMESSAGE|Vouchers/.test(row)));
});
