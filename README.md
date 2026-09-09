# GSTSlip

Mobile-first India GST invoice capture. Photograph or upload a tax invoice (JPEG, PNG, WebP, PDF), extract fields and line items, edit the register, then download CSV or Tally purchase XML.

## Run

```bash
npm install
npm run dev
```

Preview build:

```bash
npm run build
npm run preview
```

Extraction uses the xAI API (`XAI_API_KEY` on the server). Invoice data stays in the browser until you export.

## Notes

- 10 free captures, then a paywall stub
- Up to 4 pages per invoice; extra pages can be added to an existing row
- IRN lookup uses a GSP sandbox, not the live NIC IRP
- Tally export is a downloadable XML file, not a live Tally connection
