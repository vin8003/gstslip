# GSTSlip

India GST invoice capture. Photograph or upload a tax invoice, review extracted fields and line items, then download CSV or Tally purchase XML.

## What it does

- Capture from photo, PDF pages, sample invoice, e-invoice QR / IRN (GSP sandbox), or manual entry
- Extract scheme, MRP, cases, PAN, route, round-off, and net payable from distributor invoices
- 10 free documents, then GSTSlip Pro at ₹499/month via Razorpay (30 days per payment, no auto-debit)
- Signed-out quota is per network address; signed-in quota is per account and does not reset on logout
- Signed-in free captures require a one-time email verification
- Operator admin desk for accounts and Pro (preview: any signed-in account; live: GSTSLIP_ADMIN_EMAILS)
- Manual entry uses a free capture only when a real invoice is saved
- Fields stay on this device until you export
- Uploaded invoices are stored for reuse; History lists background analysis and saved rows
- Original photos and PDFs can be downloaded from History and the register

IRN lookup uses a GSP sandbox — not the live NIC IRP. TallyPrime XML (Data Interchange) is a file you import with Alt+O → Transactions; GSTSlip does not connect to Tally.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces the Vercel production output.
