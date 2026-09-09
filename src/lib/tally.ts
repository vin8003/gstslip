import {
  STATE_CODES,
  formatAmountInput,
  parseAmount,
  pruneLineItems,
  type GstInvoice,
  type LineItem,
} from "./gst";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

function tallyDate(value: string): string {
  const raw = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw);
  if (dmy) return `${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`;
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function money(value: string | number, fallback = 0): string {
  const n = typeof value === "number" ? value : parseAmount(value);
  return formatAmountInput(n ?? fallback) || "0.00";
}

function stateFromGstin(gstin: string): string {
  return STATE_CODES[gstin.slice(0, 2)] ?? "";
}

function unitName(raw: string): string {
  const u = raw.trim().toUpperCase();
  if (!u) return "NOS";
  if (["MTR", "MTRS", "METER", "METRE", "M"].includes(u)) return "MTRS";
  if (["KGS", "KG", "KILOGRAM"].includes(u)) return "KGS";
  if (["NOS", "NO", "PCS", "PC", "QTY"].includes(u)) return "NOS";
  return u.slice(0, 15);
}

function stockName(item: LineItem, index: number): string {
  return item.description.trim() || item.hsn_sac.trim() || `Line ${index + 1}`;
}

function ledgerMessage(name: string, parent: string, extra = ""): string {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<LEDGER NAME="${xmlEscape(name)}" ACTION="Create">
<NAME>${xmlEscape(name)}</NAME>
<PARENT>${xmlEscape(parent)}</PARENT>
<ISBILLWISEON>${parent === "Sundry Creditors" ? "Yes" : "No"}</ISBILLWISEON>
${extra}</LEDGER>
</TALLYMESSAGE>`;
}

function unitMessage(unit: string): string {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<UNIT NAME="${xmlEscape(unit)}" ACTION="Create">
<NAME>${xmlEscape(unit)}</NAME>
<ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>
</UNIT>
</TALLYMESSAGE>`;
}

function stockMessage(item: LineItem, index: number): string {
  const unit = unitName(item.unit);
  const name = stockName(item, index);
  const hsn = item.hsn_sac.trim();
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<STOCKITEM NAME="${xmlEscape(name)}" ACTION="Create">
<NAME>${xmlEscape(name)}</NAME>
<BASEUNITS>${xmlEscape(unit)}</BASEUNITS>
<GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
${hsn ? `<GSTDETAILS.LIST>
<APPLICABLEFROM>20250701</APPLICABLEFROM>
<HSNCODE>${xmlEscape(hsn)}</HSNCODE>
<TAXABILITY>Taxable</TAXABILITY>
</GSTDETAILS.LIST>` : ""}
</STOCKITEM>
</TALLYMESSAGE>`;
}

function partyExtra(invoice: GstInvoice): string {
  const gstin = invoice.fields.supplier_gstin.trim();
  const pin = invoice.fields.supplier_pincode.trim();
  const state = stateFromGstin(gstin) || invoice.fields.supplier_place;
  const addr = invoice.fields.supplier_address.trim();
  return `${gstin ? `<PARTYGSTIN>${xmlEscape(gstin)}</PARTYGSTIN>
<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : ""}
<COUNTRYOFRESIDENCE>India</COUNTRYOFRESIDENCE>
${state ? `<LEDSTATENAME>${xmlEscape(state)}</LEDSTATENAME>` : ""}
${pin ? `<PINCODE>${xmlEscape(pin)}</PINCODE>` : ""}
${addr ? `<ADDRESS.LIST TYPE="String">
<ADDRESS>${xmlEscape(addr)}</ADDRESS>
</ADDRESS.LIST>` : ""}`;
}

function inventoryBlock(item: LineItem, index: number): string {
  const qty = money(item.quantity, 1);
  const unit = unitName(item.unit);
  const taxable = money(item.taxable_value);
  const rate = item.rate.trim() ? money(item.rate) : taxable;
  const name = stockName(item, index);
  return `<ALLINVENTORYENTRIES.LIST>
<STOCKITEMNAME>${xmlEscape(name)}</STOCKITEMNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<RATE>${xmlEscape(rate)}/${xmlEscape(unit)}</RATE>
<AMOUNT>${xmlEscape(taxable)}</AMOUNT>
<ACTUALQTY> ${xmlEscape(qty)} ${xmlEscape(unit)}</ACTUALQTY>
<BILLEDQTY> ${xmlEscape(qty)} ${xmlEscape(unit)}</BILLEDQTY>
<ACCOUNTINGALLOCATIONS.LIST>
<LEDGERNAME>Purchase</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>${xmlEscape(taxable)}</AMOUNT>
</ACCOUNTINGALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;
}

function taxEntry(name: string, amount: number): string {
  if (amount <= 0) return "";
  const value = formatAmountInput(amount);
  return `<LEDGERENTRIES.LIST>
<LEDGERNAME>${xmlEscape(name)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>${xmlEscape(value)}</AMOUNT>
</LEDGERENTRIES.LIST>`;
}

function voucherMessage(invoice: GstInvoice): string {
  const f = invoice.fields;
  const lines = pruneLineItems(invoice.lineItems);
  const total = parseAmount(f.total_invoice_value) ?? 0;
  const taxable = parseAmount(f.taxable_value) ?? 0;
  const cgst = parseAmount(f.cgst) ?? 0;
  const sgst = parseAmount(f.sgst) ?? 0;
  const igst = parseAmount(f.igst) ?? 0;
  const party = f.supplier_name.trim() || "Supplier";
  const vchNo = f.invoice_number.trim() || invoice.id.slice(0, 8);
  const pos = f.place_of_supply.trim();
  const notes = [
    invoice.notes,
    f.irn ? `IRN ${f.irn}` : "",
    f.ack_no ? `Ack ${f.ack_no}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const inventory =
    lines.length > 0
      ? lines.map((item, index) => inventoryBlock(item, index)).join("\n")
      : `<LEDGERENTRIES.LIST>
<LEDGERNAME>Purchase</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>${xmlEscape(money(taxable))}</AMOUNT>
</LEDGERENTRIES.LIST>`;

  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
<DATE>${tallyDate(f.invoice_date)}</DATE>
<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
<VOUCHERNUMBER>${xmlEscape(vchNo)}</VOUCHERNUMBER>
<REFERENCE>${xmlEscape(vchNo)}</REFERENCE>
<PARTYLEDGERNAME>${xmlEscape(party)}</PARTYLEDGERNAME>
<BASICBUYERNAME>${xmlEscape(f.buyer_name.trim())}</BASICBUYERNAME>
<PLACEOFSUPPLY>${xmlEscape(pos)}</PLACEOFSUPPLY>
<PARTYNAME>${xmlEscape(party)}</PARTYNAME>
<PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
<ISINVOICE>Yes</ISINVOICE>
<NARRATION>${xmlEscape(notes)}</NARRATION>
${inventory}
${taxEntry("Input CGST", cgst)}
${taxEntry("Input SGST", sgst)}
${taxEntry("Input IGST", igst)}
<LEDGERENTRIES.LIST>
<LEDGERNAME>${xmlEscape(party)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>-${xmlEscape(money(total))}</AMOUNT>
<BILLALLOCATIONS.LIST>
<NAME>${xmlEscape(vchNo)}</NAME>
<BILLTYPE>New Ref</BILLTYPE>
<AMOUNT>-${xmlEscape(money(total))}</AMOUNT>
</BILLALLOCATIONS.LIST>
</LEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>`;
}

export function toTallyXml(invoices: GstInvoice[]): string {
  const parties = new Map<string, GstInvoice>();
  const units = new Set<string>();
  const stocks: LineItem[] = [];

  for (const invoice of invoices) {
    const party = invoice.fields.supplier_name.trim();
    if (party && !parties.has(party)) parties.set(party, invoice);
    for (const item of pruneLineItems(invoice.lineItems)) {
      units.add(unitName(item.unit));
      stocks.push(item);
    }
  }

  const masters = [
    ledgerMessage("Purchase", "Purchase Accounts"),
    ledgerMessage("Input CGST", "Duties & Taxes"),
    ledgerMessage("Input SGST", "Duties & Taxes"),
    ledgerMessage("Input IGST", "Duties & Taxes"),
    ...[...units].map(unitMessage),
    ...[...parties.entries()].map(([, invoice]) =>
      ledgerMessage(invoice.fields.supplier_name.trim(), "Sundry Creditors", partyExtra(invoice)),
    ),
    ...stocks.map((item, index) => stockMessage(item, index)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
<HEADER>
<TALLYREQUEST>Import Data</TALLYREQUEST>
</HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>Vouchers</REPORTNAME>
</REQUESTDESC>
<REQUESTDATA>
${masters.join("\n")}
${invoices.map(voucherMessage).join("\n")}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>
`;
}

export function downloadTallyXml(invoices: GstInvoice[]): void {
  const xml = toTallyXml(invoices);
  const blob = new Blob([xml], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `gstslip-purchase-${stamp}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
