# GSTSlip

India GST invoice capture. Photograph or upload a tax invoice, review extracted fields and line items, then download CSV or Tally purchase XML.

## What it does

- Capture from photo, PDF pages, sample invoice, e-invoice QR / IRN (GSP sandbox), or manual entry
- 10 free documents, then GSTSlip Pro at ₹499/month via Razorpay (30 days per payment, no auto-debit)
- Manual entry uses a free capture only when a real invoice is saved
- Fields stay on this device until you export

IRN lookup uses a GSP sandbox — not the live NIC IRP. Tally XML is a file you import; GSTSlip does not connect to Tally.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces the Vercel production output.
