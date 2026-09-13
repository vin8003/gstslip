import {
  STATE_CODES,
  formatAmountInput,
  parseAmount,
  pruneLineItems,
  type GstInvoice,
  type LineItem,
} from "./gst.ts";

export type TallyXmlReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type TallyExportResult = {
  xml: string;
  included: GstInvoice[];
  skipped: Array<{ id: string; reason: string }>;
  report: TallyXmlReport;
};

const XML_DECL = `<?xml version="1.0" encoding="UTF-8"?>`;
const GST_FROM = "20200401";
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const FORBIDDEN_ENTITY = /&#0*(?:[0-8]|1[12]|1[4-9]|2[0-9]|3[01]);/;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

function xmlText(value: string): string {
  return xmlEscape(value.replace(FORBIDDEN_CHARS, "").trim());
}

function compactXml(xml: string): string {
  return xml.replace(/^\s*[\r\n]/gm, "").replace(/\n{2,}/g, "\n");
}

function tallyDate(value: string): string {
  const raw = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw);
  if (dmy) return `${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`;
  return "";
}

function money(value: string | number): string {
  const n = typeof value === "number" ? value : parseAmount(value);
  if (n === null || !Number.isFinite(n)) return "";
  return formatAmountInput(n);
}

function amountOf(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseAmount(value ?? "") ?? 0;
}

function stateFromGstin(gstin: string): string {
  const code = gstin.replace(/\s+/g, "").slice(0, 2);
  return STATE_CODES[code] ?? "";
}

function unitName(raw: string): string {
  const u = raw.trim().toUpperCase();
  if (!u) return "";
  if (["MTR", "MTRS", "METER", "METRE", "M"].includes(u)) return "MTRS";
  if (["KGS", "KG", "KILOGRAM"].includes(u)) return "KGS";
  if (["NOS", "NO", "PCS", "PC", "QTY"].includes(u)) return "NOS";
  return u.replace(/[^A-Z0-9]/g, "").slice(0, 15);
}

function stockName(item: LineItem): string {
  return item.description.trim() || item.hsn_sac.trim();
}

function supplyTypeFromHsn(hsn: string): "Goods" | "Services" | "" {
  const digits = hsn.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("99") ? "Services" : "Goods";
}

function el(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text) return "";
  return `<${name}>${xmlText(text)}</${name}>`;
}

function message(inner: string): string {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
${inner}
</TALLYMESSAGE>`;
}

function ledgerMessage(name: string, parent: string, extra = ""): string {
  return message(`<LEDGER NAME="${xmlText(name)}" ACTION="Create">
${el("NAME", name)}
${el("PARENT", parent)}
${el("ISBILLWISEON", parent === "Sundry Creditors" ? "Yes" : "No")}
${extra}</LEDGER>`);
}

function gstDutyLedger(name: string, head: "CGST" | "SGST" | "IGST" | "TCS"): string {
  return ledgerMessage(
    name,
    "Duties & Taxes",
    [
      el("TAXTYPE", head === "TCS" ? "TCS" : "GST"),
      head === "TCS" ? "" : el("GSTDUTYHEAD", head),
      el("GSTAPPROPRIATETO", "Both"),
      el("ROUNDINGMETHOD", "Normal Rounding"),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function unitMessage(unit: string): string {
  return message(`<UNIT NAME="${xmlText(unit)}" ACTION="Create">
${el("NAME", unit)}
${el("ISSIMPLEUNIT", "Yes")}
</UNIT>`);
}

function gstRateHeads(invoice: GstInvoice, gstRate: number): Array<{ head: string; rate: number }> {
  if (gstRate <= 0) return [];
  const hasIgst = amountOf(invoice.fields.igst) > 0 || invoice.lineItems.some((row) => amountOf(row.igst) > 0);
  const hasCgst = amountOf(invoice.fields.cgst) > 0 || invoice.lineItems.some((row) => amountOf(row.cgst) > 0);
  const hasSgst = amountOf(invoice.fields.sgst) > 0 || invoice.lineItems.some((row) => amountOf(row.sgst) > 0);
  if (hasIgst && !hasCgst && !hasSgst) return [{ head: "IGST", rate: gstRate }];
  if (hasCgst || hasSgst) {
    const half = round2(gstRate / 2);
    const heads: Array<{ head: string; rate: number }> = [];
    if (hasCgst) heads.push({ head: "CGST", rate: half });
    if (hasSgst) heads.push({ head: "SGST/UTGST", rate: half });
    return heads;
  }
  return [];
}

function rateDetailsXml(heads: Array<{ head: string; rate: number }>): string {
  if (!heads.length) return "";
  return `<STATEWISEDETAILS.LIST>
${el("STATENAME", "Any")}
${heads
  .map(
    (row) => `<RATEDETAILS.LIST>
${el("GSTRATEDUTYHEAD", row.head)}
${el("GSTRATEVALUATIONTYPE", "Based on Value")}
${el("GSTRATE", money(row.rate))}
</RATEDETAILS.LIST>`,
  )
  .join("\n")}
</STATEWISEDETAILS.LIST>`;
}

function stockMessage(item: LineItem, invoice: GstInvoice): string {
  const unit = unitName(item.unit);
  const name = stockName(item);
  if (!name) return "";
  const hsn = item.hsn_sac.trim();
  const gstRate = amountOf(item.gst_rate);
  const supply = supplyTypeFromHsn(hsn);
  const heads = gstRateHeads(invoice, gstRate);
  const details =
    hsn || heads.length
      ? `<GSTDETAILS.LIST>
${el("APPLICABLEFROM", GST_FROM)}
${el("HSNCODE", hsn)}
${el("TAXABILITY", "Taxable")}
${heads.length ? el("GSTCALCSLABON", "Value") : ""}
${rateDetailsXml(heads)}
</GSTDETAILS.LIST>`
      : "";
  return message(`<STOCKITEM NAME="${xmlText(name)}" ACTION="Create">
${el("NAME", name)}
${el("BASEUNITS", unit)}
${el("GSTAPPLICABLE", hsn || gstRate ? "Yes" : "")}
${el("GSTTYPEOFSUPPLY", supply)}
${details}
</STOCKITEM>`);
}

function partyExtra(invoice: GstInvoice): string {
  const gstin = invoice.fields.supplier_gstin.trim();
  const pin = invoice.fields.supplier_pincode.trim();
  const state = stateFromGstin(gstin) || invoice.fields.supplier_place.trim();
  const addr = invoice.fields.supplier_address.trim();
  return [
    el("PARTYGSTIN", gstin),
    gstin ? el("COUNTRYOFRESIDENCE", "India") : "",
    el("LEDSTATENAME", state),
    el("PINCODE", pin),
    addr
      ? `<ADDRESS.LIST TYPE="String">
${el("ADDRESS", addr)}
</ADDRESS.LIST>`
      : "",
  ].join("");
}

function inventoryBlock(
  item: LineItem,
  taxable: number,
  qty: number,
  rate: number,
): string {
  const unit = unitName(item.unit);
  const name = stockName(item);
  if (!name) return "";
  const hsn = item.hsn_sac.trim();
  const qtyText = qty ? money(qty) : "";
  const taxableText = taxable ? money(taxable) : "";
  const rateText = rate ? money(rate) : "";
  const qtyWithUnit = qtyText ? (unit ? `${qtyText} ${unit}` : qtyText) : "";
  return `<ALLINVENTORYENTRIES.LIST>
${el("STOCKITEMNAME", name)}
${el("ISDEEMEDPOSITIVE", "Yes")}
${rateText ? el("RATE", unit ? `${rateText}/${unit}` : rateText) : ""}
${el("AMOUNT", taxableText)}
${el("ACTUALQTY", qtyWithUnit)}
${el("BILLEDQTY", qtyWithUnit)}
${el("GSTHSNNAME", hsn)}
${el("GSTOVRDNHSNCODE", hsn)}
<ACCOUNTINGALLOCATIONS.LIST>
${el("LEDGERNAME", "Purchase")}
${el("ISDEEMEDPOSITIVE", "Yes")}
${el("ISPARTYLEDGER", "No")}
${el("AMOUNT", taxableText)}
</ACCOUNTINGALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function lineTaxable(item: LineItem): number {
  const direct = amountOf(item.taxable_value);
  if (direct) return round2(direct);
  const qty = amountOf(item.quantity);
  const rate = amountOf(item.rate);
  if (qty && rate) return round2(qty * rate);
  return 0;
}

export type TallyLedgerPost = {
  name: string;
  amount: number;
  isParty?: boolean;
  isGst?: boolean;
};

export type TallyPurchaseBooks = {
  partyName: string;
  voucherNo: string;
  purchase: number;
  party: number;
  roundOff: number;
  balanced: boolean;
  lines: Array<{ item: LineItem; taxable: number; qty: number; rate: number }>;
  ledgers: TallyLedgerPost[];
};

function canExportInvoice(invoice: GstInvoice): string {
  if (!invoice.fields.supplier_name.trim()) return "Supplier name is missing.";
  if (!tallyDate(invoice.fields.invoice_date)) return "Invoice date is missing.";
  return "";
}

export function purchaseLedgerPlan(invoice: GstInvoice): TallyPurchaseBooks {
  const f = invoice.fields;
  const partyName = f.supplier_name.trim();
  const voucherNo = f.invoice_number.trim();
  const lines = pruneLineItems(invoice.lineItems)
    .map((item) => ({
      item,
      taxable: lineTaxable(item),
      qty: amountOf(item.quantity),
      rate: amountOf(item.rate),
    }))
    .filter((row) => stockName(row.item));

  const purchaseFromLines = round2(lines.reduce((sum, row) => sum + row.taxable, 0));
  const headerTaxable = round2(amountOf(f.taxable_value));
  const purchase = lines.length ? purchaseFromLines : headerTaxable;

  const cgst = round2(amountOf(f.cgst));
  const sgst = round2(amountOf(f.sgst));
  const igst = round2(amountOf(f.igst));
  const tcs = round2(amountOf(f.tcs));
  const crn = round2(Math.abs(amountOf(f.crn_amount)));
  const roundOff = f.round_off.trim() ? round2(amountOf(f.round_off)) : 0;
  const printedPayable = round2(amountOf(f.net_payable) || amountOf(f.total_invoice_value));
  const computed = round2(purchase + cgst + sgst + igst + tcs + roundOff - crn);
  const party = printedPayable || computed;
  const balanced = Math.abs(round2(purchase + cgst + sgst + igst + tcs + roundOff - crn - party)) < 0.05;

  const ledgers: TallyLedgerPost[] = [];
  if (!lines.length && purchase) ledgers.push({ name: "Purchase", amount: purchase });
  if (cgst) ledgers.push({ name: "Input CGST", amount: cgst, isGst: true });
  if (sgst) ledgers.push({ name: "Input SGST", amount: sgst, isGst: true });
  if (igst) ledgers.push({ name: "Input IGST", amount: igst, isGst: true });
  if (tcs) ledgers.push({ name: "Input TCS", amount: tcs, isGst: true });
  if (f.round_off.trim() && Math.abs(roundOff) >= 0.005) {
    ledgers.push({ name: "Round Off", amount: roundOff });
  }
  if (crn) ledgers.push({ name: "CRN Adjustment", amount: -crn });
  if (partyName && party) ledgers.push({ name: partyName, amount: -party, isParty: true });

  return { partyName, voucherNo, purchase, party, roundOff, balanced, lines, ledgers };
}

function ledgerEntry(post: TallyLedgerPost, voucherNo?: string, last = false): string {
  if (Math.abs(post.amount) < 0.005) return "";
  const debit = post.amount >= 0;
  const value = formatAmountInput(Math.abs(post.amount));
  const signed = debit ? value : `-${value}`;
  return `<LEDGERENTRIES.LIST>
${el("LEDGERNAME", post.name)}
${el("ISDEEMEDPOSITIVE", debit ? "Yes" : "No")}
${el("ISPARTYLEDGER", post.isParty ? "Yes" : "No")}
${last ? el("ISLASTDEEMEDPOSITIVE", "Yes") : ""}
${el("AMOUNT", signed)}
${post.isGst ? el("VATEXPAMOUNT", value) : ""}
${post.isParty && voucherNo ? `<BILLALLOCATIONS.LIST>
${el("NAME", voucherNo)}
${el("BILLTYPE", "New Ref")}
${el("AMOUNT", signed)}
</BILLALLOCATIONS.LIST>` : ""}
</LEDGERENTRIES.LIST>`;
}

function stringList(tag: string, value: string): string {
  const text = value.trim();
  if (!text) return "";
  return `<${tag} TYPE="String">
${el("ADDRESS", text)}
</${tag}>`;
}

function companyName(invoices: GstInvoice[]): string {
  for (const invoice of invoices) {
    const name = invoice.fields.buyer_name.trim();
    if (name) return name;
  }
  return "";
}

function ewayBlock(invoice: GstInvoice): string {
  const f = invoice.fields;
  const number = f.eway_bill_no.trim();
  const date = tallyDate(f.eway_bill_date);
  if (!number && !date) return "";
  return `<EWAYBILLDETAILS.LIST>
${el("BILLNUMBER", number)}
${el("BILLDATE", date)}
</EWAYBILLDETAILS.LIST>`;
}

function voucherMessage(invoice: GstInvoice): string {
  const f = invoice.fields;
  const books = purchaseLedgerPlan(invoice);
  const date = tallyDate(f.invoice_date);
  const pos = f.place_of_supply.trim();
  const supplierState = stateFromGstin(f.supplier_gstin) || f.supplier_place.trim();
  const consigneeState = stateFromGstin(f.buyer_gstin) || f.buyer_place.trim();
  const notes = [invoice.notes, f.remarks].filter(Boolean).join(" · ");
  const indianSupplier = Boolean(f.supplier_gstin.trim());
  const indianBuyer = Boolean(f.buyer_gstin.trim());

  const inventory = books.lines
    .map((row) => inventoryBlock(row.item, row.taxable, row.qty, row.rate))
    .filter(Boolean)
    .join("\n");

  const ledgers = books.ledgers.map((post, index) =>
    ledgerEntry(post, books.voucherNo, index === books.ledgers.length - 1),
  );

  return message(`<VOUCHER REMOTEID="GSTSlip-${xmlText(invoice.id)}" VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
${el("DATE", date)}
${el("EFFECTIVEDATE", date)}
${el("VOUCHERTYPENAME", "Purchase")}
${el("VOUCHERNUMBER", books.voucherNo)}
${el("REFERENCE", books.voucherNo)}
${el("REFERENCEDATE", date)}
${el("PARTYLEDGERNAME", books.partyName)}
${el("BASICBUYERNAME", f.buyer_name)}
${el("PARTYMAILINGNAME", books.partyName)}
${el("CONSIGNEEMAILINGNAME", f.consignee_name)}
${el("PLACEOFSUPPLY", pos)}
${el("PARTYNAME", books.partyName)}
${el("PARTYGSTIN", f.supplier_gstin)}
${el("CONSIGNEEGSTIN", f.buyer_gstin)}
${el("STATENAME", supplierState)}
${el("CONSIGNEESTATENAME", consigneeState)}
${el("CONSIGNEEPINCODE", f.buyer_pincode)}
${indianBuyer ? el("CONSIGNEECOUNTRYNAME", "India") : ""}
${indianSupplier ? el("COUNTRYOFRESIDENCE", "India") : ""}
${el("VCHENTRYMODE", books.lines.length ? "Item Invoice" : "Accounting Invoice")}
${el("PERSISTEDVIEW", "Invoice Voucher View")}
${el("ISINVOICE", "Yes")}
${el("IRN", f.irn)}
${el("IRNACKNO", f.ack_no)}
${el("IRNACKDATE", tallyDate(f.ack_date))}
${el("TRANSPORTERNAME", f.transporter_name)}
${el("TRANSPORTERID", f.transporter_id)}
${el("VEHICLENUMBER", f.vehicle_no)}
${el("BASICSHIPDOCUMENTNO", f.lr_number)}
${el("TRANSPORTMODE", f.mode_of_transport)}
${ewayBlock(invoice)}
${stringList("ADDRESS.LIST", f.supplier_address)}
${stringList("BASICBUYERADDRESS.LIST", f.buyer_address)}
${el("NARRATION", notes)}
${inventory}
${ledgers.join("\n")}
</VOUCHER>`);
}

export function buildTallyExport(invoices: GstInvoice[]): TallyExportResult {
  const skipped: Array<{ id: string; reason: string }> = [];
  const included: GstInvoice[] = [];
  for (const invoice of invoices) {
    const reason = canExportInvoice(invoice);
    if (reason) skipped.push({ id: invoice.id, reason });
    else included.push(invoice);
  }

  const parties = new Map<string, GstInvoice>();
  const units = new Set<string>();
  const stocks = new Map<string, { item: LineItem; invoice: GstInvoice }>();
  const used = {
    cgst: false,
    sgst: false,
    igst: false,
    tcs: false,
    round: false,
    crn: false,
  };

  for (const invoice of included) {
    const party = invoice.fields.supplier_name.trim();
    if (party && !parties.has(party)) parties.set(party, invoice);
    const books = purchaseLedgerPlan(invoice);
    if (books.ledgers.some((row) => row.name === "Input CGST")) used.cgst = true;
    if (books.ledgers.some((row) => row.name === "Input SGST")) used.sgst = true;
    if (books.ledgers.some((row) => row.name === "Input IGST")) used.igst = true;
    if (books.ledgers.some((row) => row.name === "Input TCS")) used.tcs = true;
    if (books.ledgers.some((row) => row.name === "Round Off")) used.round = true;
    if (books.ledgers.some((row) => row.name === "CRN Adjustment")) used.crn = true;
    books.lines.forEach((row) => {
      const unit = unitName(row.item.unit);
      if (unit) units.add(unit);
      const name = stockName(row.item);
      if (name && !stocks.has(name)) stocks.set(name, { item: row.item, invoice });
    });
  }

  const supplyTypes = [...stocks.values()].map(({ item }) => supplyTypeFromHsn(item.hsn_sac));
  const purchaseSupply = supplyTypes.includes("Services") && !supplyTypes.includes("Goods")
    ? "Services"
    : supplyTypes.includes("Goods")
      ? "Goods"
      : "";

  const masters = [
    ledgerMessage(
      "Purchase",
      "Purchase Accounts",
      [el("GSTAPPLICABLE", "Yes"), el("GSTTYPEOFSUPPLY", purchaseSupply)].filter(Boolean).join("\n"),
    ),
    used.cgst ? gstDutyLedger("Input CGST", "CGST") : "",
    used.sgst ? gstDutyLedger("Input SGST", "SGST") : "",
    used.igst ? gstDutyLedger("Input IGST", "IGST") : "",
    used.tcs ? gstDutyLedger("Input TCS", "TCS") : "",
    used.round ? ledgerMessage("Round Off", "Indirect Expenses") : "",
    used.crn ? ledgerMessage("CRN Adjustment", "Indirect Expenses") : "",
    ...[...units].map(unitMessage),
    ...[...parties.values()].map((invoice) =>
      ledgerMessage(invoice.fields.supplier_name.trim(), "Sundry Creditors", partyExtra(invoice)),
    ),
    ...[...stocks.values()].map(({ item, invoice }) => stockMessage(item, invoice)),
  ].filter(Boolean);

  const xml = compactXml(`${XML_DECL}
<ENVELOPE>
<HEADER>
<TALLYREQUEST>Import Data</TALLYREQUEST>
</HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>Vouchers</REPORTNAME>
<STATICVARIABLES>
${el("SVCURRENTCOMPANY", companyName(included))}
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<IMPORTDUPS>@@DUPCOMBINE</IMPORTDUPS>
</STATICVARIABLES>
</REQUESTDESC>
<REQUESTDATA>
${masters.join("\n")}
${included.map(voucherMessage).join("\n")}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>
`);

  const warnings = [
    ...skipped.map((row) => `Skipped an invoice: ${row.reason}`),
    ...included
      .filter((invoice) => !purchaseLedgerPlan(invoice).balanced)
      .map((invoice) => {
        const label = invoice.fields.invoice_number.trim() || invoice.id;
        return `Purchase voucher ${label} amounts do not balance from the printed fields (nothing was invented to force a match).`;
      }),
  ];
  const report = validateTallyXml(xml);
  report.warnings.push(...warnings);

  return { xml, included, skipped, report };
}

export function toTallyXml(invoices: GstInvoice[]): string {
  return buildTallyExport(invoices).xml;
}

function tagStackErrors(xml: string): string[] {
  const errors: string[] = [];
  const body = xml.replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/, "");
  const stack: string[] = [];
  const re = /<!--[\s\S]*?-->|<([A-Za-z_][\w:.-]*)\b([^>]*)>|<\/([A-Za-z_][\w:.-]*)\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    if (match[0].startsWith("<!--")) continue;
    if (match[3]) {
      const expected = stack.pop();
      if (expected !== match[3]) {
        errors.push(
          expected
            ? `XML tag mismatch: </${match[3]}> closes <${expected}>.`
            : `XML tag mismatch: extra </${match[3]}>.`,
        );
        break;
      }
      continue;
    }
    const name = match[1];
    const attrs = match[2] ?? "";
    if (attrs.trimEnd().endsWith("/")) continue;
    stack.push(name);
  }
  if (!errors.length && stack.length) {
    errors.push(`XML is not well-formed: unclosed <${stack[stack.length - 1]}>.`);
  }
  return errors;
}

function accountingAmounts(block: string): number[] {
  const amounts: number[] = [];
  const entry = /<(ACCOUNTINGALLOCATIONS|LEDGERENTRIES)\.LIST>([\s\S]*?)<\/\1\.LIST>/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(block))) {
    if (match[1] === "LEDGERENTRIES" && match[2].includes("BILLALLOCATIONS.LIST")) {
      const outer = /<AMOUNT>([^<]*)<\/AMOUNT>/.exec(match[2]);
      if (outer) amounts.push(Number(outer[1]));
      continue;
    }
    const inner = /<AMOUNT>([^<]*)<\/AMOUNT>/.exec(match[2]);
    if (inner) amounts.push(Number(inner[1]));
  }
  return amounts;
}

export function validateTallyXml(xml: string): TallyXmlReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!xml.trimStart().startsWith(XML_DECL)) {
    errors.push("XML must start with a UTF-8 declaration.");
  }
  if (FORBIDDEN_CHARS.test(xml) || FORBIDDEN_ENTITY.test(xml)) {
    errors.push("XML 1.0 forbids control characters such as &#4;.");
  }
  errors.push(...tagStackErrors(xml));

  if (!/<ENVELOPE>[\s\S]*<\/ENVELOPE>\s*$/.test(xml)) {
    errors.push("Root element must be ENVELOPE.");
  }
  if (!/<HEADER>\s*<TALLYREQUEST>Import Data<\/TALLYREQUEST>\s*<\/HEADER>/.test(xml)) {
    errors.push("HEADER must contain TALLYREQUEST Import Data (Tally file-import envelope).");
  }
  if (!/<BODY>[\s\S]*<IMPORTDATA>[\s\S]*<REQUESTDESC>[\s\S]*<REPORTNAME>Vouchers<\/REPORTNAME>/.test(xml)) {
    errors.push("BODY must use IMPORTDATA / REQUESTDESC / REPORTNAME Vouchers.");
  }
  if (!/<REQUESTDATA>[\s\S]*<TALLYMESSAGE\b/.test(xml)) {
    errors.push("REQUESTDATA must contain TALLYMESSAGE objects.");
  }

  const dates = [...xml.matchAll(/<VOUCHER\b[^>]*>[\s\S]*?<DATE>([^<]*)<\/DATE>/g)];
  for (const [, date] of dates) {
    if (!/^\d{8}$/.test(date)) errors.push(`Voucher DATE ${date || "(empty)"} must be YYYYMMDD.`);
  }

  const stockNames = [...xml.matchAll(/<STOCKITEM NAME="([^"]*)"/g)].map((row) => row[1]);
  const seen = new Set<string>();
  for (const name of stockNames) {
    if (!name) errors.push("STOCKITEM NAME cannot be empty.");
    if (seen.has(name)) errors.push(`Duplicate STOCKITEM NAME "${name}".`);
    seen.add(name);
  }

  if (/GSTAPPLICABLE>&#4;/.test(xml)) {
    errors.push("GSTAPPLICABLE uses an invalid XML character reference.");
  }

  const vouchers = [...xml.matchAll(/<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/g)];
  for (const [, body] of vouchers) {
    if (!/<VOUCHERTYPENAME>Purchase<\/VOUCHERTYPENAME>/.test(body)) {
      errors.push("Each voucher must be VOUCHERTYPENAME Purchase.");
    }
    if (!/<PARTYLEDGERNAME>[^<]+<\/PARTYLEDGERNAME>/.test(body)) {
      errors.push("Purchase voucher is missing PARTYLEDGERNAME.");
    }
    const sum = accountingAmounts(body).reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
    if (Math.abs(sum) > 0.05) {
      warnings.push(`Purchase voucher amounts are off by ${sum.toFixed(2)} (Tally may reject the import).`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function downloadTallyXml(invoices: GstInvoice[]): TallyXmlReport {
  const built = buildTallyExport(invoices);
  if (!built.included.length) {
    throw new Error(built.skipped[0]?.reason || "No purchase invoice has a supplier name and date to export.");
  }
  if (!built.report.ok) {
    throw new Error(built.report.errors[0] || "Tally XML failed schema checks.");
  }
  const blob = new Blob([built.xml], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `GSTSlip-TallyPrime-Vouchers-${stamp}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return built.report;
}
