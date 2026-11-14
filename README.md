# KUATEST MEGA TAMA Document Generator

A document generator for quotations, invoices, and receipts using Supabase Auth and Postgres.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Import this repository into Vercel and set **Root Directory** to `.`. Use `npm run build`; Vercel publishes `dist` and provides the PDF rendering function in `api/render-pdf.js`.

## Supabase setup

1. Create a Supabase project and run supabase/schema.sql in SQL Editor.
2. Create a company row, then create two users under Authentication > Users. Public sign-up is disabled.
3. Add one profiles row per Auth user with the same company_id; assign admin and director.
4. Copy .env.example to .env.local, set the Supabase project URL and publishable key, and add both values to Vercel Environment Variables before redeploy. Do not expose a secret/service-role key in browser code.
5. Export a JSON backup from the old local app. Sign into the new app as director and use Impor once to migrate old documents and company settings.

RLS policies enforce company isolation. Admins can create and edit, but cannot delete. Directors can delete, import, manage company identity, and access the recap report.

## Data

Documents are stored in Supabase and shared across signed-in devices. Directors can download JSON backups.

## PDF output

Quotation, invoice, and receipt PDFs are rendered through Chromium with A4 pages and 15 mm margins. Local development uses installed Google Chrome; set `PUPPETEER_EXECUTABLE_PATH` to choose another browser. Company logo and identity fields can be changed in the settings.