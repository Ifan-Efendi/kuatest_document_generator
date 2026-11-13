# KUATEST MEGATAMA Document Generator

A standalone document generator for quotations, invoices, and receipts. Data is saved locally in the browser.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Import this repository into Vercel and set **Root Directory** to `.`. Use `npm run build`; Vercel publishes `dist` and provides the PDF rendering function in `api/render-pdf.js`.

## Local data

Documents and company identity are stored in this browser's IndexedDB. They are not shared across browsers or computers. Use **Cadangkan** to download a JSON backup and **Impor** to restore it.

## PDF output

Quotation, invoice, and receipt PDFs are rendered through Chromium with A4 pages and 15 mm margins. Local development uses installed Google Chrome; set `PUPPETEER_EXECUTABLE_PATH` to choose another browser. Company logo and identity fields can be changed in the settings.